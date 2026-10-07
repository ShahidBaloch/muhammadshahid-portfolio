---
title: "Distributed Caching Patterns in ASP.NET Core"
description: "Cache-aside, write-through, and write-behind patterns in ASP.NET Core with Redis. When each is correct and what breaks when you pick the wrong one."
date: "2026-10-07"
category: "architecture"
tags: ["Caching", "Redis", "ASP.NET Core", "Distributed Systems", ".NET", "Performance"]
---

## Why Use Distributed Caching

Without caching, every request hits the database. For read-heavy workloads (dashboards, product catalogues, user profiles), identical queries execute thousands of times per minute with no reuse. This wastes database capacity and adds latency for every user.

Distributed caching solves it by storing query results in a fast in-memory store (Redis) shared across all service instances. Subsequent identical requests return from cache in under 1ms instead of hitting the database. The key decision is *how* the cache stays consistent with the database — that is where the patterns differ.

Microsoft's [IDistributedCache](https://learn.microsoft.com/en-us/aspnet/core/performance/caching/distributed) is the standard abstraction. The [StackExchange.Redis](https://learn.microsoft.com/en-us/aspnet/core/performance/caching/distributed#stackexchangeredis-cache) provider is the production implementation.

## Project Layout

```text
src/
├── Clinic.Application/
│   └── Caching/
│       └── ICacheService.cs                # GetAsync<T>, SetAsync<T>, RemoveAsync
├── Clinic.Infrastructure/
│   └── Caching/
│       ├── RedisCacheService.cs            # wraps IDistributedCache
│       └── CacheExtensions.cs             # AddDistributedCaching() helper
└── Clinic.Web/
    └── Program.cs                          # builder.Services.AddStackExchangeRedisCache(...)
```

The application layer calls `ICacheService`. Infrastructure owns the Redis connection. This lets you swap Redis for in-memory in tests without changing application code.

---

## Cache-Aside (Lazy Loading)

Cache-aside is the most common pattern. The application manages the cache explicitly: check cache first, if miss query the database, then populate the cache.

```
Request
  ↓
Check Cache ──→ HIT: return cached value
  ↓ MISS
Query Database
  ↓
Write to Cache (TTL)
  ↓
Return to caller
```

```csharp
public class ProductRepository
{
    private readonly IDistributedCache _cache;
    private readonly AppDbContext _db;
    
    public async Task<ProductDto?> GetByIdAsync(Guid productId, CancellationToken ct)
    {
        var cacheKey = $"product:{productId}";
        
        // 1. Check cache
        var cached = await _cache.GetStringAsync(cacheKey, ct);
        if (cached != null)
            return JsonSerializer.Deserialize<ProductDto>(cached);
        
        // 2. Cache miss — query database
        var product = await _db.Products
            .AsNoTracking()
            .Where(p => p.Id == productId && p.IsActive)
            .Select(p => new ProductDto { Id = p.Id, Name = p.Name, Price = p.Price })
            .FirstOrDefaultAsync(ct);
        
        if (product == null) return null;
        
        // 3. Populate cache with TTL
        await _cache.SetStringAsync(
            cacheKey,
            JsonSerializer.Serialize(product),
            new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(15)
            },
            ct);
        
        return product;
    }
    
    // Cache invalidation on update
    public async Task UpdatePriceAsync(Guid productId, decimal newPrice, CancellationToken ct)
    {
        var product = await _db.Products.FindAsync(productId, ct);
        product!.Price = newPrice;
        await _db.SaveChangesAsync(ct);
        
        // Invalidate cache — next read will repopulate
        await _cache.RemoveAsync($"product:{productId}", ct);
    }
}
```

### When to Use Cache-Aside
- Read-heavy data that is expensive to compute or query
- Data that can tolerate brief staleness (product catalogues, user profiles, config)
- When cache failures must not block writes (the database is the authoritative source)

### When NOT to Use Cache-Aside
- Financial balances, inventory counts, or any data where stale reads cause real-world errors
- Highly volatile data where TTL-based invalidation is too slow (cache will be almost always stale)
- When you need consistent reads across all service instances in real time

### Trade-offs
| Benefit | Cost / Risk |
|---|---|
| Simple implementation | Cache stampede on cold start or after expiry |
| Database is authoritative source | Temporary stale reads between write and TTL expiry |
| Cache failures do not block writes | Manual cache invalidation required on every write path |
| Works with any data access pattern | Two network calls on cache miss (cache + database) |

**Handling cache stampedes**: When a popular key expires, many concurrent requests all miss the cache simultaneously and all hit the database. Use probabilistic early expiration (check if key will expire soon and refresh it in the background) or a locking pattern:

```csharp
// Distributed lock prevents stampede
public async Task<ProductDto?> GetWithLockAsync(Guid productId, CancellationToken ct)
{
    var cacheKey = $"product:{productId}";
    var cached = await _cache.GetStringAsync(cacheKey, ct);
    if (cached != null) return JsonSerializer.Deserialize<ProductDto>(cached);
    
    // Acquire lock — only one thread rebuilds the cache
    var lockKey = $"lock:product:{productId}";
    await using var @lock = await _lockProvider.AcquireAsync(lockKey, TimeSpan.FromSeconds(10), ct);
    
    // Double-check after acquiring lock (another thread may have populated it)
    cached = await _cache.GetStringAsync(cacheKey, ct);
    if (cached != null) return JsonSerializer.Deserialize<ProductDto>(cached);
    
    var product = await _db.Products.FindAsync(productId, ct);
    await _cache.SetStringAsync(cacheKey, JsonSerializer.Serialize(product), ...);
    return product;
}
```

---

## Write-Through Cache

Write-through ensures the cache is always up to date by writing to both the cache and the database synchronously on every write.

```
Write Request
  ↓
Write to Cache
  ↓
Write to Database
  ↓
Return success
```

```csharp
public class UserSettingsRepository
{
    public async Task UpdateSettingsAsync(
        Guid userId, 
        UserSettings settings, 
        CancellationToken ct)
    {
        var serialized = JsonSerializer.Serialize(settings);
        
        // Write to cache first
        await _cache.SetStringAsync(
            $"settings:{userId}",
            serialized,
            new DistributedCacheEntryOptions 
            { 
                // No TTL — data stays in cache indefinitely (write-through keeps it current)
                SlidingExpiration = TimeSpan.FromHours(24) 
            },
            ct);
        
        // Write to database
        var entity = await _db.UserSettings.FindAsync(userId, ct);
        entity!.UpdateFrom(settings);
        await _db.SaveChangesAsync(ct);
    }
    
    public async Task<UserSettings?> GetAsync(Guid userId, CancellationToken ct)
    {
        var cached = await _cache.GetStringAsync($"settings:{userId}", ct);
        if (cached != null) return JsonSerializer.Deserialize<UserSettings>(cached);
        
        // Cache miss (first access or cache eviction)
        var entity = await _db.UserSettings.FindAsync(userId, ct);
        if (entity == null) return null;
        
        await _cache.SetStringAsync($"settings:{userId}", JsonSerializer.Serialize(entity), ...);
        return entity;
    }
}
```

### When to Use Write-Through
- Data that is read very frequently after being written (user settings, session data)
- When you cannot tolerate stale reads at all
- When writes are infrequent relative to reads (high read-to-write ratio)

### When NOT to Use Write-Through
- Write-heavy workloads — every write pays the cost of two operations
- Data that is written but rarely read (caching it wastes cache memory)
- When the cache service is unavailable and writes should still succeed

### Trade-offs
| Benefit | Cost / Risk |
|---|---|
| Cache always reflects current state — no stale reads | Every write touches two systems (higher write latency) |
| No manual invalidation logic needed | Cache failures can block writes if not handled carefully |
| Consistent reads immediately after writes | Unused data fills the cache if write-to-read ratio is low |

---

## Write-Behind (Write-Back) Cache

Write-behind writes to the cache immediately and to the database asynchronously. The response returns to the caller after the cache write, before the database write completes.

```
Write Request
  ↓
Write to Cache (immediate)
  ↓
Return success immediately
  ↓ (async)
Background worker flushes cache to database
```

### When to Use Write-Behind
- High-frequency writes where database write latency is a bottleneck
- Aggregating rapid updates before persisting (analytics counters, view counts, like counts)
- Non-critical data where brief database inconsistency is acceptable

### When NOT to Use Write-Behind
- Financial data, medical records, or any data where losing a cache flush means lost data
- When the database is the system of record and must always be up to date
- Small teams without the operational maturity to handle cache-to-database flush failures

### Trade-offs
| Benefit | Cost / Risk |
|---|---|
| Lowest write latency — response before DB write | Risk of data loss if cache fails before DB flush |
| Reduces database write load significantly | Database temporarily lags behind the cache |
| Batches writes efficiently | Complex failure handling (what if the DB flush fails?) |

---

## Cache Key Design

Poorly designed cache keys are a common source of subtle bugs:

```csharp
// Bad: too broad — different data shares the same key
_cache.GetStringAsync("products")

// Bad: no namespace — key collisions across services in shared Redis
_cache.GetStringAsync($"user:{userId}")

// Good: namespaced, specific, includes version to allow safe schema changes
_cache.GetStringAsync($"v1:product:{productId}:summary")
_cache.GetStringAsync($"v1:user:{userId}:profile")
_cache.GetStringAsync($"v1:orders:{customerId}:active")
```

---

## If an Interviewer Asks...

**"What is the difference between cache-aside and write-through?"**

In cache-aside, the application populates the cache lazily — on a cache miss, it reads from the database and then writes to the cache. The cache can be stale until TTL expires or an explicit invalidation happens. In write-through, every write goes to both the cache and the database synchronously, keeping the cache always current but adding latency to every write. Cache-aside is better for read-heavy data with occasional writes; write-through is better for data read frequently right after writing.

---

## Key Concepts
- **Cache-aside**: Application manages cache explicitly; populate on miss, invalidate on write
- **Write-through**: Synchronously write to cache and database on every write
- **Write-behind**: Write to cache immediately; flush to database asynchronously
- **Cache stampede**: Many concurrent requests miss the cache simultaneously and all hit the database
- **TTL (Time to Live)**: Expiry duration after which a cached entry is automatically removed
- **Cache eviction**: Redis automatically removes entries when memory is full (LRU policy by default)

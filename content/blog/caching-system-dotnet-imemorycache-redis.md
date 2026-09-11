---
title: "Caching System in .NET: IMemoryCache, Redis, and Object Cache"
description: "Caching system explained for .NET and Java developers — object cache, in-memory vs distributed cache, IMemoryCache vs Redis on ASP.NET Core, compared to Java caching patterns."
date: "2026-09-08"
updated: "2026-09-12"
category: "caching"
tags: ["Caching", "IMemoryCache", "Redis", "ASP.NET Core", ".NET", "Performance"]
related:
  - what-is-a-cache-miss
  - redis-caching-aspnet-core
  - csharp-concurrentdictionary-lock
  - ef-core-sql-performance
faq:
  - q: "What is a caching system?"
    a: "A caching system stores copies of frequently used data in fast storage (RAM, Redis) so reads avoid slower sources like SQL or HTTP. It includes the cache store, keys, TTL, eviction, invalidation on writes, and hit/miss metrics."
  - q: "What is IMemoryCache?"
    a: "ASP.NET Core’s in-memory cache — an in-process object cache for one API instance. AddMemoryCache(), inject IMemoryCache, set TTL and a size limit. It is not shared across App Service instances."
  - q: "What is in-memory cache vs Redis in ASP.NET Core?"
    a: "In-memory cache (IMemoryCache) is local to one process. Redis is a distributed cache (IDistributedCache) shared by every instance. Use IMemoryCache alone on a single instance; add Redis when you scale out."
  - q: "What is IMemoryCache vs IDistributedCache?"
    a: "IMemoryCache stores CLR objects in process RAM. IDistributedCache stores bytes (usually JSON) in Redis or another shared store. Same cache-aside pattern; different scope."
  - q: "What is a Java object cache?"
    a: "In Java, an object cache holds deserialized objects in memory — e.g. Caffeine, Ehcache, or a ConcurrentHashMap with TTL. In .NET the equivalent is IMemoryCache or IDistributedCache storing serialized or in-memory objects per key."
  - q: "What is the Java caching system vs .NET?"
    a: "Same concepts: in-process object cache (Caffeine / IMemoryCache) vs distributed cache (Redis for both). .NET uses IDistributedCache abstraction; Java often uses Spring Cache or Redisson. Both need tenant-aware keys and invalidation on writes."
  - q: "When use IMemoryCache vs Redis in ASP.NET Core?"
    a: "IMemoryCache for single-instance, fast, local object cache with size limits. Redis (IDistributedCache) when multiple API instances must share cache entries or you need a centralized TTL store."
---

**In-memory cache** and **IMemoryCache** are the .NET names for keeping hot objects in process. If you come from Java (Caffeine, Ehcache, Spring `@Cacheable`), the mental model is the same — this page maps both ecosystems. On **ASP.NET Core**, pair **`IMemoryCache`** (local) with **Redis** (`IDistributedCache`) when multiple instances must share entries.

Start with: [what is a cache miss](/blog/what-is-a-cache-miss). Redis production patterns: [Redis caching ASP.NET Core](/blog/redis-caching-aspnet-core).

## What is a caching system?

**Definition:** A **caching system** is infrastructure that **stores reusable data closer to the consumer** than the authoritative source, with rules for **lookup, expiry, eviction, and invalidation**.

```text
Client → API → [ CACHE ] → SQL / HTTP / disk
                  ↑
            hit = fast
            miss = load origin (see cache miss guide)
```

Layers in a typical ASP.NET Core product:

| Layer | Technology | Scope |
|---|---|---|
| **Browser / CDN** | HTTP cache headers | Public static assets |
| **In-process object cache** | `IMemoryCache` | One API instance |
| **Distributed object cache** | Redis + `IDistributedCache` | All API instances |
| **Database** | SQL Server buffer pool | Server-side (not your app code) |

## Java object cache vs .NET object cache

**Java object cache** usually means keeping **Java objects** in heap memory keyed by id — avoid repeated DB round-trips for the same entity graph.

**.NET equivalent:**

```csharp
// In-process object cache — ASP.NET Core
public class FeeScheduleService
{
    private readonly IMemoryCache _cache;
    private readonly AppDbContext _db;

    public async Task<FeeScheduleDto?> GetAsync(Guid tenantId, Guid scheduleId, CancellationToken ct)
    {
        var key = $"tenant:{tenantId}:feeschedule:{scheduleId}:v1";

        if (_cache.TryGetValue(key, out FeeScheduleDto? cached))
            return cached;  // object cache HIT

        var row = await _db.FeeSchedules
            .AsNoTracking()
            .FirstOrDefaultAsync(f => f.TenantId == tenantId && f.Id == scheduleId, ct);

        if (row is null) return null;

        var dto = Map(row);
        _cache.Set(key, dto, TimeSpan.FromMinutes(10));
        return dto;
    }
}
```

Register cache:

```csharp
builder.Services.AddMemoryCache();
```

| Concept | Java | .NET / ASP.NET Core |
|---|---|---|
| In-process object cache | Caffeine, Ehcache, `ConcurrentHashMap` | `IMemoryCache` |
| Annotation-driven cache | `@Cacheable` (Spring) | Manual or third-party (FusionCache, LazyCache) |
| Distributed cache | Redis + Redisson / Spring Data Redis | `IDistributedCache` + StackExchange.Redis |
| Serialize for Redis | JSON, Kryo | JSON, MessagePack |
| Stampede control | Caffeine `refreshAfterWrite` | Lock / single-flight ([Redis post](/blog/redis-caching-aspnet-core)) |

## Java caching system (mapped to .NET)

A full **Java caching system** in enterprise apps often includes:

1. **Local L1** — Caffeine per JVM
2. **Shared L2** — Redis cluster
3. **Cache-aside** — app reads cache, on miss loads DB, writes cache
4. **Write-through / write-behind** — less common on CRUD APIs; know the terms

**.NET ASP.NET Core** mirror:

```csharp
// L1 + L2 pattern (simplified)
public async Task<CatalogDto> GetCatalogAsync(Guid tenantId, CancellationToken ct)
{
    var key = $"tenant:{tenantId}:catalog:v1";

    if (_memory.TryGetValue(key, out CatalogDto? local))
        return local!;

    var json = await _distributed.GetStringAsync(key, ct);
    if (json is not null)
    {
        var fromRedis = JsonSerializer.Deserialize<CatalogDto>(json)!;
        _memory.Set(key, fromRedis, TimeSpan.FromMinutes(1));
        return fromRedis;
    }

    var fresh = await LoadFromSqlAsync(tenantId, ct);
    var payload = JsonSerializer.Serialize(fresh);

    await _distributed.SetStringAsync(key, payload, new DistributedCacheEntryOptions
    {
        AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(15),
    }, ct);

    _memory.Set(key, fresh, TimeSpan.FromMinutes(1));
    return fresh;
}
```

L1 (`IMemoryCache`) cuts Redis round-trips. L2 (Redis) shares state across App Service instances.

## In-memory cache vs Redis (IMemoryCache vs IDistributedCache)

`IMemoryCache` is a **sticky note on your monitor** — fast, invisible to the next desk, gone when the process recycles. **Redis** is the **whiteboard in the hallway** every App Service instance can read. Label the note with `tenantId` or another tenant inherits yesterday's fee schedule.

**In-memory cache** / **in-memory caching** on ASP.NET Core means `IMemoryCache` — objects live in the process heap.

**Redis as a distributed cache** means `IDistributedCache` — bytes (usually JSON) live in a shared store.

```csharp
public sealed class FeeScheduleCache(IMemoryCache memory, IDistributedCache redis)
{
    public async Task<FeeScheduleDto?> GetAsync(Guid tenantId, Guid id, CancellationToken ct)
    {
        var key = $"tenant:{tenantId}:fee:{id}:v1";

        if (memory.TryGetValue(key, out FeeScheduleDto? local))
            return local;

        var json = await redis.GetStringAsync(key, ct);
        if (json is not null)
        {
            var dto = JsonSerializer.Deserialize<FeeScheduleDto>(json)!;
            memory.Set(key, dto, TimeSpan.FromMinutes(1));
            return dto;
        }

        return null; // caller loads SQL, then SetAsync
    }
}
```

```text
One API instance, small lookups     → IMemoryCache only
Two+ instances, shared reads        → Redis (IDistributedCache)
Need L1 speed + L2 sharing          → IMemoryCache + Redis
```

**When to use IMemoryCache only:** one API instance, small lookups, you can name a size limit.

**When to add Redis:** two or more instances must share the same keys.

**When not to cache at all:** per-user clinical records keyed only by URL, checkout prices that must be exact after a promo change, anything you cannot name an invalidation rule for.

`IMemoryCache` vs `IDistributedCache` is that scope difference — not a quality ranking. Production Redis patterns: [Redis caching ASP.NET Core](/blog/redis-caching-aspnet-core).

## IMemoryCache — when to use object cache in-process

**Good for:**

- Reference data with moderate churn on **single instance** or per-instance optimization
- Parsed config, feature flags, small lookup tables
- Short TTL memoization of expensive **read-only** computation

**Avoid:**

- Storing unbounded graphs — set `SizeLimit` and entry size
- Multi-tenant data without `tenantId` in the key ([ConcurrentDictionary pitfalls](/blog/csharp-concurrentdictionary-lock))
- Assuming L1 is shared across servers — it is not

```csharp
builder.Services.AddMemoryCache(options =>
{
    options.SizeLimit = 10_000;
});
```

## Redis — distributed caching system

When you scale to **multiple Kestrel workers or App Service instances**, in-process object cache diverges — each node has its own copy. **Redis** becomes the shared caching system.

```csharp
builder.Services.AddStackExchangeRedisCache(options =>
{
    options.Configuration = builder.Configuration["Redis:Connection"];
    options.InstanceName = "myapp:";
});
```

Full patterns: [Redis caching ASP.NET Core](/blog/redis-caching-aspnet-core).

Connection failures: [error establishing a Redis connection](/blog/redis-connection-error-aspnet-core).

## Cache-aside (the pattern both stacks use)

```text
1. GET key from cache
2. if HIT → return
3. if MISS → query SQL
4. SET key with TTL
5. return
```

This is the default for catalog lists, fee schedules, and dashboard aggregates when **stale reads are acceptable** for a few minutes.

## Invalidation — caching system completeness

A caching system without invalidation is a **stale data machine**:

| Write event | Action |
|---|---|
| Update entity | Remove entity key + list keys |
| Bulk import | Bump key version `v1` → `v2` |
| Permission change | Invalidate user/role caches |

If you cannot name the invalidation rule, do not cache the read yet.

## Choosing your caching system stack

```text
One API instance, small data     → IMemoryCache only
Multiple instances, shared reads → Redis (IDistributedCache)
Need L1 speed + L2 sharing       → IMemoryCache + Redis
Real-time per-user clinical data → often no cache; tune SQL
```

## If an interviewer asks

**"Java object cache vs Redis?"**  
Object cache = in-process heap (fast, local). Redis = network shared store (consistent across nodes).

**"IMemoryCache vs ConcurrentDictionary?"**  
`IMemoryCache` has TTL and size limits. `ConcurrentDictionary` is a thread-safe map — no eviction unless you build it.

**"Cache miss implications?"**  
[What is a cache miss](/blog/what-is-a-cache-miss) — miss runs full SQL; stampede if uncontrolled.

Hub: [caching](/learning/caching).

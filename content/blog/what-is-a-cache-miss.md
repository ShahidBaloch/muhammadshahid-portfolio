---
title: "What Is a Cache Miss? (Definition With ASP.NET Core Examples)"
description: "What is a cache miss — definition, cache hit vs miss, why misses hurt performance, and how cache misses work with IMemoryCache and Redis on ASP.NET Core APIs."
date: "2026-09-08"
updated: "2026-09-08"
category: "caching"
tags: ["Caching", "Redis", "ASP.NET Core", "Performance", ".NET", "IMemoryCache"]
related:
  - redis-caching-aspnet-core
  - caching-system-dotnet-imemorycache-redis
  - ef-core-sql-performance
faq:
  - q: "What is a cache miss?"
    a: "A cache miss happens when the data you request is not in the cache, so the system must fetch it from the slower source — SQL, HTTP, disk. The opposite is a cache hit: the value was already stored and returned immediately."
  - q: "What is the difference between cache hit and cache miss?"
    a: "Cache hit — key found, fast return from memory or Redis. Cache miss — key absent or expired, rebuild from SQL or origin, then usually store in cache for next time. Misses are slower and can cause a thundering herd if many requests miss together."
  - q: "Why do cache misses matter in ASP.NET Core?"
    a: "A miss path often runs the full EF Core query or HTTP call. Under load, many simultaneous misses — cold start, TTL expiry, deploy — can spike SQL CPU and latency. Design for miss cost, stampede control, and slim cache payloads."
  - q: "How do you reduce cache misses?"
    a: "Tune TTL to data freshness needs, warm hot keys after deploy, use single-flight on rebuild, fix SQL before caching, and include tenant/version in keys so valid entries are not treated as misses."
---

If you search **what is a cache miss**, you want a plain definition before Redis tutorials or performance tuning. Here it is:

A **cache miss** occurs when a requested piece of data is **not found** in the cache (or has expired), so the application must load it from the **slower backing store** — usually SQL Server, an HTTP API, or disk.

The opposite is a **cache hit**: the value is already in memory or Redis and returns quickly.

Implementation: [Redis caching in ASP.NET Core](/blog/redis-caching-aspnet-core). Caching layers: [caching system in .NET](/blog/caching-system-dotnet-imemorycache-redis).

## Cache hit vs cache miss

```text
Request for key "tenant:1:providers:list:v1"

  CACHE HIT                          CACHE MISS
  ─────────                          ──────────
  Look up key → found                Look up key → not found (or expired)
       │                                    │
       Return cached JSON                   Run SQL / HTTP (slow path)
       (fast — microseconds)                      │
                                            Store in cache (optional)
                                                  │
                                            Return fresh data
                                            (slow — milliseconds+)
```

| | **Cache hit** | **Cache miss** |
|---|---|---|
| **Key in cache?** | Yes, not expired | No, or TTL expired |
| **Typical latency** | Very low (RAM / Redis) | Full query or network round-trip |
| **Load on SQL** | None for that request | Full read (or write on rebuild) |
| **User experience** | Snappy dashboard | Slower; spikes if many miss at once |

## What is a cache miss? (definition)

**Definition:** A **cache miss** is a cache lookup that fails to return a valid entry, forcing the system to **populate from the origin** (database, file, remote service).

Miss types you will hear in interviews and ops:

1. **Cold miss (compulsory)** — first request ever for that key; cache is empty
2. **Capacity miss** — cache evicted the entry because memory is full
3. **Conflict miss** — poor key design causes unnecessary misses (e.g. missing tenant in key)
4. **Expiration miss** — TTL elapsed; entry removed intentionally

All four feel the same to the caller: **miss → rebuild → (maybe) set**.

## Real-world analogy

A pharmacy shelf:

- **Hit** — the medicine is on the shelf; hand it to the customer
- **Miss** — shelf empty; walk to the stockroom, fetch a box, restock the shelf, then serve

If fifty customers ask for the same item and the shelf is empty, fifty trips to the stockroom happen unless **one person restocks while others wait** — that is **cache stampede** control ([Redis guide](/blog/redis-caching-aspnet-core)).

## Cache miss in ASP.NET Core

Typical `IDistributedCache` read path:

```csharp
public async Task<ProviderListDto> GetProvidersAsync(ProviderQuery query, CancellationToken ct)
{
    var key = BuildKey(query);
    var cached = await _cache.GetStringAsync(key, ct);

    if (cached is not null)
    {
        // CACHE HIT — deserialize and return
        return JsonSerializer.Deserialize<ProviderListDto>(cached)!;
    }

    // CACHE MISS — expensive path
    var fresh = await _query.ExecuteAsync(query, ct);

    await _cache.SetStringAsync(
        key,
        JsonSerializer.Serialize(fresh),
        new DistributedCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5),
        },
        ct);

    return fresh;
}
```

Every **miss** runs `_query.ExecuteAsync` — often EF Core against SQL. If that query is slow (N+1, missing index), caching only helps **after** the first miss per key per TTL window.

**Rule:** tune SQL first ([EF Core performance](/blog/ef-core-sql-performance)), then cache slim results.

## Why cache misses spike in production

| Event | What happens |
|---|---|
| **Deploy / cold start** | In-memory cache empty; Redis may be warm if shared |
| **TTL expiry** | Many keys expire together → synchronized misses |
| **Traffic spike** | Hot keys miss if never cached or evicted |
| **Wrong key** | Tenant missing → treat as miss every time or worse, serve wrong tenant’s hit |
| **Cache flush** | Ops clears Redis; all reads miss until rebuilt |

Monitor **hit ratio** and **miss rebuild duration**. A “fast” API with 5% hit rate is not winning.

## Reducing cache miss pain

1. **Absolute TTL** matched to freshness — not “cache forever”
2. **Single-flight / lock** on rebuild — one SQL query per key during stampede
3. **Warm-up** after deploy for known hot keys
4. **Version in key** (`v1` → `v2`) instead of flushing entire prefixes blindly
5. **Slim DTOs** — a miss that serializes 2 MB to Redis hurts network too
6. **Fail-open** if Redis is down — miss every time but SQL still answers ([connection errors](/blog/redis-connection-error-aspnet-core))

## Cache miss vs “slow SQL”

Caching **hides** slow SQL on **hits**. On **misses**, you still pay full query cost — sometimes **plus** cache write overhead.

```text
Bad strategy:  N+1 query + Redis
               miss = slow every TTL window
               hit  = fast but stale wrong data risk

Good strategy: tuned SQL projection + Redis
               miss = acceptable once per TTL
               hit  = fast and correct enough
```

## CPU cache miss (related term)

In computer architecture, **CPU cache miss** means the processor did not find data in L1/L2 cache and fetched from RAM — a different layer than application Redis. Interviewers may mention both; this article is **application-level** caching for APIs.

## If an interviewer asks

**"What is a cache miss?"**  
Lookup failed — data loaded from origin (SQL, HTTP) instead of cache.

**"Hit ratio?"**  
`hits / (hits + misses)`. Low ratio means cache is not helping or TTL is too short.

**"Thundering herd on miss?"**  
Many concurrent requests miss the same key and all hit SQL. Fix: lock, single-flight, or early warm-up.

**"When not to cache?"**  
Per-user PHI without strict keys, data that must be real-time, or SQL that is already broken.

More: [Redis caching ASP.NET Core](/blog/redis-caching-aspnet-core). Hub: [caching](/learning/caching).

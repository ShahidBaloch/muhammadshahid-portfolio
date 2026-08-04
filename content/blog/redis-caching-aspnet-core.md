---
title: "Redis Caching in ASP.NET Core: When It Speeds Up APIs (and When It Lies)"
description: "Practical Redis caching in ASP.NET Core for Angular SPAs — IDistributedCache, cache keys, stampede control, invalidation, and the mistakes that make dashboards show stale data."
date: "2026-08-02"
category: "architecture"
tags: ["Redis", "ASP.NET Core", "Caching", "Performance", "Azure"]
---

**Redis caching ASP.NET Core** is one of the most searched performance topics in the .NET ecosystem — and one of the easiest ways to ship a subtle production bug. Caching is not “add Redis and enjoy faster APIs.” It is a deliberate trade: freshness for latency.

I add Redis to ASP.NET Core APIs that feed Angular dashboards in healthcare ops, SaaS admin panels, and catalog-heavy eCommerce. This post covers the patterns that actually reduce load, the key design that prevents collisions, and when I refuse to cache.

## High-intent problem Redis solves

Typical Angular SPA symptoms:

- Provider list or fee schedule endpoints are hit on every navigation
- SQL CPU climbs while the data barely changes
- P95 latency is fine in Swagger with one user and awful with concurrent sessions

Redis helps when **reads dominate**, data has a clear freshness window, and invalidation is understandable. It hurts when every write must be visible instantly and your invalidation story is “we’ll figure it out later.”

## Start with IDistributedCache, not a custom client everywhere

In ASP.NET Core, `IDistributedCache` (with the Redis implementation) keeps application code testable:

```csharp
builder.Services.AddStackExchangeRedisCache(options =>
{
    options.Configuration = builder.Configuration["Redis:Connection"];
    options.InstanceName = "myapp:";
});
```

Then inject `IDistributedCache` into application services — not controllers full of Redis connection multiplexers. Controllers should stay thin; cache policy belongs next to the query use case.

For Azure, Azure Cache for Redis is the usual managed option. Locally, Docker Redis is enough. Keep connection strings out of source control.

## Cache keys: design them like public contracts

Bad keys cause silent wrong answers:

- `providers` — no tenant, no filter hash
- `user:42` — unclear what payload is stored
- keys that include raw free-text search without normalization

Good keys are explicit:

```text
tenant:{tenantId}:providers:list:v1:status={status}:page={page}:size={size}
tenant:{tenantId}:feeschedule:{scheduleId}:v2
```

Rules I follow:

1. Include **tenant/org** on multi-tenant products
2. Version the key (`v1`) when DTO shape changes
3. Include every input that changes the result
4. Prefer short stable enums over giant serialized filter objects when possible

Angular should not invent cache keys. The API owns caching. The SPA just calls endpoints.

## Get-or-set without a thundering herd

The naive pattern:

1. Many requests miss
2. All hit SQL together
3. Redis never gets a chance to help

A simple approach that works for many apps:

```csharp
public async Task<ProviderListDto> GetProvidersAsync(ProviderQuery query, CancellationToken ct)
{
    var key = BuildKey(query);
    var cached = await _cache.GetStringAsync(key, ct);
    if (cached is not null)
        return JsonSerializer.Deserialize<ProviderListDto>(cached)!;

    var fresh = await _query.ExecuteAsync(query, ct);
    var payload = JsonSerializer.Serialize(fresh);

    await _cache.SetStringAsync(
        key,
        payload,
        new DistributedCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5),
        },
        ct);

    return fresh;
}
```

For hotter keys, add a short lock (Redis lock or in-process gate per key) so only one request rebuilds the value. I only invest in fancy stampede control after metrics prove the key is hot.

## Absolute expiry vs sliding expiry

- **Absolute** — “this list is valid for 5 minutes, then rebuild.” Predictable. My default for lists and reference data.
- **Sliding** — “keep extending while someone keeps reading.” Good for session-ish data; dangerous if stale content stays popular.

For fee schedules and catalog facets, I prefer absolute expiry plus explicit invalidation on write.

## Invalidation: the part tutorials skip

Every cache needs a write story:

| Write happens | Cache action |
|---|---|
| Update one entity | Remove that entity key + related list keys |
| Bulk import | Bump a version segment in keys or flush a prefix carefully |
| Permission change | Invalidate user/role dependent payloads |

If you cannot name how a write clears related reads, do not cache that read yet.

On eCommerce-style catalogs (similar to what I structure in Ecom_NET10-style work), I often cache:

- category trees
- facet definitions
- product detail for anonymous browsing

I usually do **not** cache:

- cart contents
- checkout pricing after promotions change mid-session (unless the pricing service owns its own cache rules)
- per-user PHI-style healthcare payloads without a strict security review

## What Angular developers should know

From the SPA side:

- Do not double-cache large lists in Angular services “just in case” without a freshness policy
- Prefer short-lived client memoization for UI state, server Redis for shared expensive queries
- Handle 304/ETag only if you intentionally design HTTP caching — Redis response caching and HTTP caching are different tools

When an Angular screen looks “stuck on old data,” check API cache keys and TTL before blaming change detection.

## Observability or you are guessing

Log or metric:

- cache hit/miss ratio per key prefix
- SQL duration for rebuilds
- payload size (oversized JSON in Redis is a tax)

I have seen teams “speed up” an endpoint by caching a 2MB DTO that made Redis and network slower than a tuned SQL projection. Projection first — see also my notes on [EF Core SQL performance](/blog/ef-core-sql-performance) — then cache the slim result.

## Serialization and versioning pitfalls

Use one serializer settings profile for cache payloads. If you cache with System.Text.Json defaults and later enable camelCase only for HTTP, you can deserialize incorrectly after a deploy.

When a DTO gains a required field, bump the key version (`v1` → `v2`) instead of hoping old JSON still binds. Leaving both versions live for one TTL window is fine; forever dual-reading old blobs is not.

Also decide whether nulls mean “cached empty list” or “miss.” An empty provider list is a valid cacheable result. Do not treat empty as miss or you will hammer SQL on quiet tenants.

## Fail-open vs fail-closed

If Redis is down, choose deliberately:

- **Fail-open** — skip cache, hit SQL, keep the app alive (my default for most read caches)
- **Fail-closed** — return errors when cache is required for protection (rare; more common for rate-limit counters)

Wrap cache get/set in try/catch with warning logs. A hard dependency on Redis for every catalog read turns a cache outage into a full outage.

## Production checklist

1. Redis in non-prod that mirrors prod topology enough to test failover
2. InstanceName / key prefix per environment
3. Absolute TTL on every entry
4. Invalidation on every write path that matters
5. No secrets or tokens stored in cache values
6. Load test the miss path (cold cache) not only the hit path
7. Document which endpoints are cached and for how long

## Bottom line

Redis in ASP.NET Core pays rent when reads are hot, payloads are lean, and invalidation is honest. It becomes a liability when used as a bandage for N+1 queries and oversized graphs.

If you want help placing cache boundaries in a .NET API that serves Angular, [get in touch](/contact).

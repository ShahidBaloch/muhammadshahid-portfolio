---
title: "ASP.NET Core Output Caching vs IMemoryCache: Full Guide"
description: "Master ASP.NET Core Output Caching (.NET 8/9/10): response caching vs in-memory caching, cache eviction with tags, Redis backplane, cache locking, and tenant safety."
date: "2026-09-18"
updated: "2026-10-03"
category: "caching"
tags: ["ASP.NET Core", "Output Caching", "Redis", "HTTP", "Performance", "Architecture"]
related:
  - caching-system-dotnet-imemorycache-redis
  - redis-caching-aspnet-core
  - aspnet-core-output-caching-redis
  - aspnet-core-middleware-order
faq:
  - q: "What is the difference between Output Caching and IMemoryCache?"
    a: "IMemoryCache caches programmatic objects and models inside application memory for your code to query. Output Caching caches the complete generated HTTP response (status code, headers, body bytes) and serves subsequent identical requests immediately from middleware without executing routing or controller actions."
  - q: "Can I cache authenticated or multi-tenant API responses with Output Caching?"
    a: "By default, Output Caching bypasses authenticated requests to prevent leaking private data. You can enable it safely by defining custom policies that vary the cache key by user ID (VaryByValue) or tenant claim, or by using Output Caching only for public, tenant-agnostic endpoints."
  - q: "How do I evict output cache entries when data changes?"
    a: "Output Caching supports tag-based eviction. Tag endpoints using .Tag('products'), and inject IOutputCacheStore in your write commands (POST/PUT/DELETE) to call EvictByTagAsync('products', ct), immediately purging all related cached responses."
  - q: "Does Output Caching prevent cache stampedes (thundering herd)?"
    a: "Yes. ASP.NET Core Output Caching includes built-in request locking (mutexing). When multiple concurrent requests arrive for an expired cache entry, only one request executes the backend handler while other requests wait to receive the fresh cached response."
---

**Output Caching in ASP.NET Core** (.NET 7+) caches entire HTTP response payloads at the middleware layer. Unlike application-level caching (`IMemoryCache`), output caching short-circuits the pipeline before controller actions or Minimal API handlers execute, drastically cutting database strain and CPU overhead for read-heavy endpoints.

```text
Incoming HTTP Request
       │
       ▼
OutputCacheMiddleware
       │
       ├── Cache Hit ──► Returns cached HTTP response (status, headers, body)
       │                 (0ms action execution, 0 DB queries)
       │
       └── Cache Miss ──► Executes Action & EF Core query
                          │
                          └── Stores response in OutputCacheStore (In-Memory or Redis)
                              Tag: 'catalog'
```

**New to this** → start with [Output Caching vs IMemoryCache](#output-caching-vs-imemorycache-comparison). **Tag eviction** → [Evicting cache with tags](#tag-based-cache-invalidation). **Distributed Redis setup** → [Output caching with Redis](/blog/aspnet-core-output-caching-redis). **Interview prep** → [If an interviewer asks](#if-an-interviewer-asks).

## Real-world analogy

- **`IMemoryCache`**: A chef's recipe note on the kitchen counter. The chef still turns on the stove, cooks the steak, and plates the dish, but they quickly look up the marinade ingredients without reopening the cookbook.
- **Output Caching**: A heated warming tray of pre-packaged, plated hot lunches under a lamp. When a customer orders the standard daily special, the cashier hands them the packaged box directly from the counter without ringing the kitchen bell or turning on the oven.

The primary hazard is handing Customer B a customized tray prepared for Customer A—which is why output caching must never be applied blindly to authenticated, user-specific endpoints without proper key variation.

## Output Caching vs IMemoryCache comparison

| Feature | `IMemoryCache` / `IDistributedCache` | ASP.NET Core Output Caching |
|---|---|---|
| **What is Cached** | C# Objects, DTOs, entity collections | Serialized HTTP response (status, headers, byte streams) |
| **Pipeline Execution** | Runs routing, authorization, filters, controller/action, and serializer | Short-circuits middleware pipeline before reaching controllers |
| **Thundering Herd Protection** | Requires manual locks or `HybridCache` (.NET 9+) | Built-in request locking out of the box |
| **Eviction Mechanics** | Timeouts, cancellation tokens, manual keys | Timeouts, explicit keys, and multi-endpoint **Tags** |
| **Primary Use Case** | Shared data in business logic, command pipelines | Public catalog endpoints, CMS content, static lookups, OpenAPI specs |

## Complete Output Caching setup in ASP.NET Core

### 1. Program.cs registration

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

// Register output caching service with global or named policies
builder.Services.AddOutputCache(options =>
{
    // Global base policy: 60-second default for tagged endpoints
    options.AddBasePolicy(builder => 
        builder.Expire(TimeSpan.FromSeconds(60)));

    // Custom named policy for catalog endpoints
    options.AddPolicy("CatalogPolicy", policy =>
        policy.Expire(TimeSpan.FromMinutes(10))
              .SetVaryByQuery("page", "pageSize", "sort")
              .Tag("catalog_tag"));

    // Tenant-isolated policy
    options.AddPolicy("TenantPolicy", policy =>
        policy.Expire(TimeSpan.FromMinutes(5))
              .VaryByValue((context) => new KeyValuePair<string, string>(
                  "tenant_id", 
                  context.Request.Headers["X-Tenant-ID"].ToString() ?? "default")));
});

var app = builder.Build();

app.UseRouting();

// OutputCache must be placed after UseRouting and before MapEndpoints
app.UseOutputCache();

app.UseAuthentication();
app.UseAuthorization();

// 2. Applying policies to Minimal APIs and Controllers
app.MapGet("/api/v1/products", async (CatalogDbContext db, CancellationToken ct) =>
{
    return await db.Products.AsNoTracking().ToListAsync(ct);
})
.CacheOutput("CatalogPolicy");

// Inline policy customization with tags
app.MapGet("/api/v1/categories", async (CatalogDbContext db, CancellationToken ct) =>
{
    return await db.Categories.AsNoTracking().ToListAsync(ct);
})
.CacheOutput(p => p.Expire(TimeSpan.FromHours(1)).Tag("categories_tag"));
```

## Tag-based cache invalidation

One of the greatest features of ASP.NET Core Output Caching is tag-based cache purging. You can invalidate multiple cached routes with a single call:

```csharp
// Features/Products/UpdateProductEndpoint.cs
app.MapPost("/api/v1/products", async (
    CreateProductRequest request,
    CatalogDbContext db,
    IOutputCacheStore cacheStore,
    CancellationToken ct) =>
{
    var product = new Product(request.Name, request.Price, request.CategoryId);
    db.Products.Add(product);
    await db.SaveChangesAsync(ct);

    // Invalidate all responses tagged with 'catalog_tag' across all query param variations!
    await cacheStore.EvictByTagAsync("catalog_tag", ct);

    return Results.Created($"/api/v1/products/{product.Id}", product);
});
```

When `EvictByTagAsync("catalog_tag")` executes, every paginated variant (`/api/v1/products?page=1`, `?page=2`, `?sort=price`) is instantly purged from the cache store.

## Common mistakes and pitfalls

- **Caching authenticated responses without variation**: Output caching defaults to skipping requests with `Authorization` or `Cookie` headers. Forcing `.CacheOutput()` on an `/api/profile` endpoint without `.VaryByValue(user_id)` can leak User A's private profile to User B.
- **Placing middleware in the wrong pipeline order**: Placing `UseOutputCache()` before `UseRouting()` prevents endpoint-specific policies from binding. Placing it after `UseEndpoints()` means requests are never intercepted.
- **Neglecting cache eviction in background workers**: If an external batch job or worker updates products directly in SQL Server, output cache entries in Kestrel memory will remain stale until TTL expires unless evicted via `IOutputCacheStore`.
- **Using output cache for massive streaming files**: Output cache buffers responses in memory by default. For multi-gigabyte video or blob downloads, use [streaming responses](/blog/aspnet-core-file-download-streaming) instead of output caching.

## If an interviewer asks

**30-second answer:** `IMemoryCache` stores programmatic objects in memory for use inside business logic, while Output Caching stores completed HTTP responses (headers, status codes, and serialized bodies) directly in middleware. Output Caching short-circuits the pipeline on cache hits, avoiding controller execution, object serialization, and database queries.

**Strong answer:** Output Caching in modern ASP.NET Core provides enterprise-grade response caching with built-in thundering-herd mutex locking and tag-based invalidation (`IOutputCacheStore.EvictByTagAsync`). In microservices and SaaS architectures, we use Output Caching for read-heavy public catalogs and lookup APIs, configuring Redis as a distributed backplane so that server restarts or autoscaling instances share the warmed cache. For user-specific data, we either vary by tenant/user claims or rely on `IMemoryCache` / `HybridCache` at the service layer.

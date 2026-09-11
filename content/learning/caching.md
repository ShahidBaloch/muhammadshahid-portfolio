---
title: "Caching for ASP.NET Core APIs"
---

## Introduction

If you search **what is a cache miss**, **in-memory cache**, **IMemoryCache**, **java caching system**, **java object cache**, or **error establishing a redis connection**, you want definitions and fixes before tuning production APIs. Start here:

- [What is a cache miss](/blog/what-is-a-cache-miss)
- [Caching system in .NET (IMemoryCache + Redis)](/blog/caching-system-dotnet-imemorycache-redis)
- [Redis connection errors](/blog/redis-connection-error-aspnet-core)
- [Redis caching patterns](/blog/redis-caching-aspnet-core)

## Cache hit vs miss (summary)

```text
HIT  → key in cache → fast return
MISS → key absent   → SQL/HTTP rebuild → store → return
```

A high miss rate under load spikes SQL. Fix queries first, then cache slim DTOs with TTL and stampede control.

## Caching layers on .NET APIs

| Layer | Tool | When |
|---|---|---|
| In-process object cache | `IMemoryCache` | Single instance, short TTL |
| Distributed cache | Redis + `IDistributedCache` | Multiple App Service instances |
| HTTP cache | `Cache-Control`, ETag | Public static assets |

Java developers: Caffeine/Ehcache ≈ `IMemoryCache`; Redis patterns are the same — cache-aside, TTL, invalidation.

## Deep-dive articles

| You are trying to… | Read |
|---|---|
| Define **cache miss** | [What is a cache miss](/blog/what-is-a-cache-miss) |
| Choose **IMemoryCache vs Redis** | [Caching system in .NET](/blog/caching-system-dotnet-imemorycache-redis) |
| Fix **Redis connection errors** | [Redis connection error fix](/blog/redis-connection-error-aspnet-core) |
| Design production Redis cache | [Redis caching ASP.NET Core](/blog/redis-caching-aspnet-core) |
| SQL still slow on miss | [EF Core SQL performance](/blog/ef-core-sql-performance) |
| Tenant-safe in-memory maps | [ConcurrentDictionary](/blog/csharp-concurrentdictionary-lock) |

---
title: "Caching Articles for ASP.NET Core APIs"
---

## Introduction

This page is the **article map** for caching on ASP.NET Core. Definitions, Redis production patterns, and connection fixes each have their own URL — open those for ranking and deep answers.

| You want… | Open |
|---|---|
| **What is a cache miss** | [Cache miss definition](/blog/what-is-a-cache-miss) |
| **IMemoryCache vs Redis layers** | [Caching system in .NET](/blog/caching-system-dotnet-imemorycache-redis) |
| **Redis production patterns** | [Redis caching ASP.NET Core](/blog/redis-caching-aspnet-core) |
| **Error establishing a Redis connection** | [Redis connection fix](/blog/redis-connection-error-aspnet-core) |

## Cache hit vs miss (one-line map)

```text
HIT  → key in cache → fast return
MISS → key absent   → SQL/HTTP rebuild → store → return
```

Full definition and miss-path design: [what is a cache miss](/blog/what-is-a-cache-miss).

## Caching layers (quick map)

| Layer | Tool | Deep dive |
|---|---|---|
| In-process object cache | `IMemoryCache` | [Caching system](/blog/caching-system-dotnet-imemorycache-redis) |
| Distributed cache | Redis + `IDistributedCache` | [Redis caching](/blog/redis-caching-aspnet-core) |
| Connection / TLS failures | StackExchange.Redis | [Connection error fix](/blog/redis-connection-error-aspnet-core) |

## Deep-dive articles

| You are trying to… | Read |
|---|---|
| Define **cache miss** | [What is a cache miss](/blog/what-is-a-cache-miss) |
| Choose **IMemoryCache vs Redis** | [Caching system in .NET](/blog/caching-system-dotnet-imemorycache-redis) |
| Fix **Redis connection errors** | [Redis connection error fix](/blog/redis-connection-error-aspnet-core) |
| Design production Redis cache | [Redis caching ASP.NET Core](/blog/redis-caching-aspnet-core) |

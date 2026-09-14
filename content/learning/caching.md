---
title: "Caching Articles for ASP.NET Core APIs"
---

## Introduction

This page is the **article map** for caching on ASP.NET Core. Definitions and fixes each have their own URL.

| You want… | Open |
|---|---|
| **What is a cache miss** | [Cache miss definition](/blog/what-is-a-cache-miss) |
| **IMemoryCache vs Redis layers** | [Caching system in .NET](/blog/caching-system-dotnet-imemorycache-redis) |
| **Redis production patterns** | [Redis caching ASP.NET Core](/blog/redis-caching-aspnet-core) |
| **Error establishing a Redis connection** | [Redis connection fix](/blog/redis-connection-error-aspnet-core) |

```text
HIT  → key in cache → fast return
MISS → key absent   → rebuild from SQL/HTTP
```

Open the definition and Redis articles above for depth — this index does not replace them.

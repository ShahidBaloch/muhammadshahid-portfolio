---
title: "ASP.NET Core Output Caching vs IMemoryCache"
description: "Output caching stores a finished HTTP response. IMemoryCache stores a value inside the process. Use output cache for a public GET. Do not use it for a response that depends on the logged-in user unless you vary by that user."
date: "2026-09-18"
updated: "2026-09-18"
category: "caching"
tags: ["ASP.NET Core", "Output Caching", "HTTP", "Performance"]
related:
  - caching-system-dotnet-imemorycache-redis
  - redis-caching-aspnet-core
  - aspnet-core-middleware-order
faq:
  - q: "What is the difference between output cache and IMemoryCache?"
    a: "IMemoryCache holds an object your code reads. Output cache holds the response bytes and can skip the action entirely. The Redis and IMemoryCache guide covers the object cache. This page is only the response."
  - q: "Can I output-cache an authenticated API?"
    a: "Not by default. A cached 200 for one user must not be served to the next user. Vary by a user id you control, or do not cache that route."
  - q: "Does output cache replace Redis?"
    a: "No. Output cache is per instance unless you add a distributed store. A value several instances must share still belongs in the cache guide that covers Redis."
---

Some GETs build the same JSON for every anonymous caller. Running the action every time is wasted work. Output caching stores that response. It is not the tool that remembers a computed price inside a command.

The object cache, including Redis, is [the caching guide](/blog/caching-system-dotnet-imemorycache-redis). This post does not repeat it. Hub: [Caching](/learning/caching).

## Real-world analogy

IMemoryCache is a note on the prep counter: the cook still cooks, but they glance at the note for the oven temperature. Output cache is a tray of plated lunches under a lamp. The next identical order does not go back through the kitchen. The danger is handing table 4 the plate you made for table 9 because the orders looked similar and the ticket had a name you ignored.

## Worked example

`GET /api/v1/categories` hits the database 40 times a minute and returns the same twelve rows. Adding `IMemoryCache` inside the action still runs routing, the action, and the serializer. `.CacheOutput()` on that endpoint returns the stored body and skips the action until the window ends. The same attribute on `GET /api/v1/orders`, which depends on the caller, serves the first user's orders to the second user for 30 seconds. Take the attribute off any route that reads the current user, or vary the cache by a claim you set yourself. Do not vary by the raw `Authorization` header and then log that key.

| Store | What is saved | Skip the action? |
|---|---|---|
| `IMemoryCache` | An object you name | No |
| Output cache | The HTTP response | Yes |
| Redis (see the other guide) | A value every instance can read | No, unless you build that yourself |

## Code

```csharp
builder.Services.AddOutputCache();

app.UseOutputCache();

app.MapGet("/api/v1/categories", ListCategories)
    .CacheOutput(policy => policy.Expire(TimeSpan.FromSeconds(30)));
```

`UseOutputCache` sits after routing, with the rest of the pipeline you already ordered in [middleware order](/blog/aspnet-core-middleware-order). A 30-second window is a product decision. A catalog that changes when an admin clicks save needs a tag eviction or a shorter window, not a hope that nobody notices. Authenticated order lists stay uncached.

Public catalog reads of this shape: [Ecom_NET10](/work/ecom-net10).

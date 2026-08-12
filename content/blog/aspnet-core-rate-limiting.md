---
title: "ASP.NET Core Rate Limiting: Protect APIs Without Killing Real Users"
description: "Implement ASP.NET Core rate limiting middleware for Web APIs — fixed/sliding windows, per-user policies, 429 responses for Angular clients, and multi-instance pitfalls."
date: "2026-08-04"
category: "architecture"
tags: ["Rate Limiting", "ASP.NET Core", "API Security", ".NET", "Performance"]
---

**ASP.NET Core rate limiting** is a high-intent topic because it sits at the intersection of security, cost control, and uptime. Bots hammer login endpoints. A buggy Angular retry loop fans out hundreds of calls. One tenant floods a shared SaaS API. Without limits, you pay in CPU, SQL, and support tickets.

Since .NET 7, ASP.NET Core ships built-in rate limiting middleware. I turn it on for public and partner APIs — especially auth, search, and export endpoints that are expensive or attractive to abuse.

## Why this keyword converts traffic

Searchers want a working answer to:

- How do I return **429 Too Many Requests**?
- Fixed window vs sliding window vs token bucket?
- Per-IP vs per-user limits?
- Will this work on multiple Azure App Service instances?

Those are the questions teams ask when APIs hit production traffic — worth answering with working code, not middleware snippets alone.

## What the built-in middleware does (and does not)

It limits how many requests a partition (IP, user, API key) can make in a time window. On reject, you typically return **429**.

Important limitation: the default in-memory limiters are **per process**. Two App Service instances do not share counters. For strict global limits across a farm, you need a distributed store (Redis) or edge limiting (API Management / reverse proxy). Still, in-process limits stop a huge class of accidental and casual abuse.

## Minimal setup

```csharp
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.AddFixedWindowLimiter("fixed", opt =>
    {
        opt.PermitLimit = 100;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.QueueLimit = 0;
    });
});

var app = builder.Build();
app.UseRateLimiter();
```

Apply to endpoints:

```csharp
app.MapGet("/api/search", SearchAsync)
   .RequireRateLimiting("fixed");
```

Or with attributes on controllers:

```csharp
[EnableRateLimiting("fixed")]
[ApiController]
public class SearchController : ControllerBase { }
```

Place `UseRateLimiter` correctly in the pipeline (after routing; for user-based partitions, after authentication so `User` is available).

## Partition by user when you can

IP limits are blunt. On corporate NATs, many good users share one IP. Prefer authenticated identity when present:

```csharp
options.AddPolicy("per-user", httpContext =>
{
    var key = httpContext.User.Identity?.IsAuthenticated == true
        ? httpContext.User.Identity!.Name!
        : httpContext.Connection.RemoteIpAddress?.ToString() ?? "anon";

    return RateLimitPartition.GetFixedWindowLimiter(
        key,
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 60,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
        });
});
```

For APIs with API keys, partition on the key header instead of IP.

## Algorithm cheat sheet

| Algorithm | Good for | Watch-outs |
|---|---|---|
| **Fixed window** | Simple quotas | Burst at window edges |
| **Sliding window** | Smoother than fixed | Slightly more complex |
| **Token bucket** | Allow short bursts | Tune refill carefully |
| **Concurrency** | Limit parallel expensive work | Does not cap total/minute alone |

Login / token endpoints: strict fixed or sliding limits.  
Large exports: concurrency limiter + low permit count.  
Read-heavy search: higher limits + caching ([Redis](/blog/redis-caching-aspnet-core)).

## QueueLimit: usually keep it at zero for public APIs

`QueueLimit > 0` holds excess requests until a slot opens. Under a stampede you can accumulate thousands of waiting requests, then release pain all at once. For public Angular apps I prefer **fail fast with 429** and let the client back off.

## What Angular should do on 429

Teach the SPA:

1. Read `Retry-After` if you send it  
2. Back off (exponential jitter) — do not tight-loop refresh  
3. Show a calm message on login brute-force limits  
4. Deduplicate identical in-flight GETs where possible  

Example interceptor sketch: on 429, delay once, retry once, then surface an error. Pair with your [global exception / ProblemDetails](/blog/aspnet-core-global-exception-handling) shape so the UI stays consistent.

You can customize the rejection response:

```csharp
options.OnRejected = async (context, token) =>
{
    context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
    await context.HttpContext.Response.WriteAsJsonAsync(new
    {
        title = "Too many requests",
        status = 429,
        detail = "Please wait and try again.",
    }, token);
};
```

## Different policies for different endpoints

Do not apply one global limit that makes browsing painful while still leaving `/api/auth/login` wide open.

Suggested starting point for a SaaS API:

- `login`: 5–10 / minute / IP  
- `refresh`: modest per user  
- `search`: higher, per user  
- `export`: very low concurrency  
- health checks: disabled / excluded  

Use `[DisableRateLimiting]` on health endpoints your load balancer probes.

## Multi-instance and Redis reality check

On Azure App Service with multiple instances:

- in-memory limiter ≈ per instance  
- attackers can round-robin and multiply effective quota  
- for login protection at the edge, also configure WAF / Front Door / APIM limits  

If you build Redis-backed partitioning, treat Redis connections as carefully as any shared resource — connection pool mistakes can starve the app worse than the abuse you tried to stop.

## Load test before you celebrate

Rate limiting changes failure modes. Test:

- legitimate Angular user journeys still pass  
- burst traffic receives 429, not 500  
- login lockout behavior matches product expectations  
- admin users are not accidentally sharing the anonymous partition  

## Production checklist

1. `AddRateLimiter` + `UseRateLimiter` ordered correctly  
2. Stricter policy on auth and expensive endpoints  
3. Partition key = user/API key when available  
4. `QueueLimit = 0` for most public APIs  
5. Clear 429 JSON for Angular  
6. Exclude health probes  
7. Document limits for partners  
8. Plan edge/distributed limits if you scale out  

## Failure story: Angular retry storm

An admin grid had an interceptor that retried every 401 and every network error immediately, three times, with no jitter. Combined with a token refresh race, one open dashboard tab generated hundreds of API calls per minute. SQL DTU spiked; other users felt the outage. Rate limiting on the search and list endpoints returned 429 quickly, which forced the team to fix the interceptor — the real bug — while protecting the shared database.

Rate limiting is not a substitute for correct auth refresh logic ([Angular JWT interceptors](/blog/angular-jwt-interceptors)), but it is an excellent safety net.

## Bottom line

**ASP.NET Core rate limiting** is one of the highest-leverage protections you can add in an afternoon — if you tune partitions and avoid treating in-memory limits as global farm guarantees. Protect login and heavy endpoints first, teach Angular to respect 429, and escalate to distributed/edge limits when horizontal scale demands it.

Related: [IHttpClientFactory](/blog/ihttpclientfactory-aspnet-core) for outbound resilience, [JWT auth checklist](/blog/aspnet-core-jwt-auth) for login surfaces worth protecting.

Need help hardening a .NET + Angular API? [Contact me](/contact).

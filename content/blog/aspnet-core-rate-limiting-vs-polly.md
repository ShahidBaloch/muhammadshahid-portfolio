---
title: "ASP.NET Core Rate Limiting vs Polly Rate Limiter"
description: "ASP.NET Core rate limiting vs Polly: return 429 before the action, and limit outbound HttpClient calls in Polly. Most APIs need both, for different budgets."
date: "2026-10-03"
category: "api-design"
tags: ["ASP.NET Core", "Polly", "Rate Limiting", "C#", "HttpClient"]
faq:
  - q: "Is ASP.NET Core rate limiting the same as Polly's rate limiter?"
    a: "No. ASP.NET Core rate limiting rejects inbound HTTP requests (usually 429) before your action runs. Polly's rate limiter gates outbound calls your process makes through HttpClient so you do not overload a dependency. They share the System.Threading.RateLimiting primitives and solve opposite sides of the process."
  - q: "Can I use Polly instead of the ASP.NET Core rate limiting middleware?"
    a: "You can bolt a limiter onto anything, but Polly will not partition by user, write Retry-After, or return 429 on the request pipeline unless you build that yourself. Use the middleware for inbound abuse and fairness. Use Polly on HttpClient for downstream protection."
  - q: "How does this differ from the ASP.NET Core rate limiting post?"
    a: "That post is the inbound middleware: policies, partitions, and 429 responses for Angular. This page is the comparison with Polly and the rule for which limiter sits on which side of the API."
---

**ASP.NET Core rate limiting vs Polly** is an inbound versus outbound decision: the middleware protects your API from callers; Polly's rate limiter protects the services you call. Same limiter types, opposite directions.

```text
Angular  --429?-->  ASP.NET Core UseRateLimiter  -->  your code
                                                      |
                                                      v
                                            HttpClient + Polly rate limiter
                                                      |
                                                      v
                                            billing / partner API
```

**New to this** - stay here for the split. **Inbound policies** - [ASP.NET Core rate limiting](/blog/aspnet-core-rate-limiting). **HttpClient and retries** - [IHttpClientFactory](/blog/ihttpclientfactory-aspnet-core).

## When do you use ASP.NET Core rate limiting vs Polly?

Search intent for **asp.net core rate limiting vs polly** is a comparison. Teams see `AddRateLimiter` and Polly's `AddRateLimiter` and assume one of them is redundant. They want to know which package sits in front of the controller and which sits in front of `HttpClient`.

This page is not the catalog of fixed window versus sliding window, and it is not how to retry HTTP 500s. Windows, partitions, and Angular 429 UX live on the inbound post. Retries and socket exhaustion live on the HttpClient post.

## When does this split apply?

You are on ASP.NET Core 7 or later (the built-in rate limiting middleware) and Polly v8 (`Microsoft.Extensions.Http.Resilience` or `Polly` with `ResiliencePipeline`). You expose an API to an Angular SPA, partners, or other services, and that API calls something else: a payer, a shipping API, Microsoft Graph, or your own internal service.

If the process never makes outbound HTTP calls, you do not need Polly's rate limiter. If nobody calls you except a single worker you control, inbound limiting is still useful but the failure mode is different (a bug looping, not a hostile client).

## Which limiter answers which question?

Both sides use `System.Threading.RateLimiting`: fixed window, sliding window, token bucket, concurrency. The type names match. The question they answer does not.

| Question | ASP.NET Core middleware | Polly rate limiter |
|---|---|---|
| Who is being limited? | Callers of your endpoints | Your calls to someone else |
| What happens on reject? | HTTP 429 (or your status) and the action does not run | `RateLimiterRejectedException` inside the handler; the outbound call is not sent |
| Partition key | User id, API key, IP, tenant | Usually one limiter per named client, or a key you choose |
| Knows about routes? | Yes (`RequireRateLimiting`, `[EnableRateLimiting]`) | No |
| Survives multiple API instances? | Not by itself; each process has its own counters | Not by itself; each process limits only itself |
| Job | Fairness and abuse on the edge | Protect a dependency and respect its quota |

A limiter inside one process is not a global quota. Two replicas with a permit limit of 100 allow about 200. Say that in the ADR so nobody thinks the middleware replaced API Management or a gateway.

## How do you reject inbound work before it runs?

> **Watch:** The middleware returns 429 only for HTTP requests that pass through it. It does not limit a background consumer that never enters that pipeline.

The middleware runs early. A request over the limit never touches the database, the domain, or the downstream you are afraid of. That is the point. Limiting only inside the HttpClient still lets the expensive action start, then fail when the outbound limiter says no. The user already paid for the request, and your thread pool already paid for the controller.

Shape for an authenticated API, one policy, no attempt to restate every window type:

```csharp
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (ctx, ct) =>
    {
        if (ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
            ctx.HttpContext.Response.Headers.RetryAfter =
                ((int)retryAfter.TotalSeconds).ToString();

        await ctx.HttpContext.Response.WriteAsJsonAsync(new
        {
            type = "https://api.example.com/problems/rate-limited",
            title = "Too many requests",
            status = StatusCodes.Status429TooManyRequests
        }, ct);
    });

    options.AddPolicy("per-user", httpContext =>
    {
        var key = httpContext.User.FindFirstValue("sub")
            ?? httpContext.Connection.RemoteIpAddress?.ToString()
            ?? "anonymous";

        return RateLimitPartition.GetSlidingWindowLimiter(key, _ =>
            new SlidingWindowRateLimiterOptions
            {
                PermitLimit = 120,
                Window = TimeSpan.FromMinutes(1),
                SegmentsPerWindow = 6,
                QueueLimit = 0
            });
    });
});

app.UseRateLimiter();

app.MapGroup("/api/orders")
    .RequireRateLimiting("per-user")
    .MapPost("/", CreateOrder);
```

Partition by subject when the caller is signed in. IP partitions punish NAT offices and mobile carriers, and they are trivial to rotate. QueueLimit above zero holds the request in the server; that is a timeout waiting to happen under load. Prefer fail fast with 429 and `Retry-After`.

Angular should treat 429 as a client message, not a generic "server error," and it should honor `Retry-After` instead of retrying immediately. Immediate retry is how a polite UI becomes the outage.

## How do you limit outbound HttpClient calls?

> **Watch:** Polly protects the dependency, not your callers. Retrying a partner 429 without honoring Retry-After is how you hit their ban.

Your dependency has a quota too. If twenty concurrent requests each call billing, you can be under your inbound limit and still get the partner's 429 or a socket pile-up. Put a rate limiter on that `HttpClient` only.

```csharp
builder.Services.AddHttpClient("billing", client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Billing:BaseUrl"]!);
    client.Timeout = TimeSpan.FromSeconds(10);
})
.AddResilienceHandler("billing", (pipeline, _) =>
{
    // First strategy is outermost. Retry wraps the limiter,
    // so each attempt, including a retry, takes its own permit.
    pipeline.AddRetry(new HttpRetryStrategyOptions
    {
        MaxRetryAttempts = 2,
        ShouldHandle = static args =>
        {
            if (args.Outcome.Exception is HttpRequestException)
                return ValueTask.FromResult(true);

            var code = args.Outcome.Result?.StatusCode;
            return ValueTask.FromResult(
                code is HttpStatusCode.BadGateway
                    or HttpStatusCode.ServiceUnavailable);
        }
    });

    pipeline.AddRateLimiter(new SlidingWindowRateLimiter(
        new SlidingWindowRateLimiterOptions
        {
            PermitLimit = 20,
            Window = TimeSpan.FromSeconds(1),
            SegmentsPerWindow = 4,
            QueueLimit = 40,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst
        }));
});
```

Outbound queueing can be reasonable: the user request is already accepted, and waiting 200 ms for a permit is better than a partner 429 storm. Cap the queue. A queue of thousands is a memory leak with a timeout at the end.

Do not share one Polly limiter across every `HttpClient`. Graph, billing, and your own identity server do not have the same quota. Named clients exist so policies stay specific.

When the limiter rejects, map it to a problem your caller can understand. Swallowing `RateLimiterRejectedException` and returning 200 with an empty body is a lie. Returning 500 teaches Angular to retry harder. 503 with a clear title, or 429 if the caller can slow down, is honest.

## How do the two limiters compose?

> **Watch:** One PermitLimit copied into both limiters mixes two budgets. Per-user fairness and downstream calls per second are different contracts.

Use both when the API is public and it calls a limited dependency:

1. Inbound limiter: per user or per API key, `QueueLimit = 0`, 429 before the action.
2. Application logic and database work.
3. Outbound limiter on the specific client, small queue, no retry-on-reject unless the dependency documented a backoff.
4. Polly retry only for transient failures (timeouts, 502, 503), with a budget. Retry and rate limit interact: a retry consumes another outbound permit. If you retry inside the same limiter, a dependency blip burns the quota you were trying to protect. Add the retry first and the rate limiter second. Polly runs the first strategy as the outermost, so each attempt, including a retry, takes a permit from the inner limiter. `HttpRetryStrategyOptions` retries HTTP 429 by default. Replace `ShouldHandle` and do not retry 429. Unlimited retries against a tiny permit count park the request until your own client timeout.

Concurrency limiters are the other tool people confuse with rate limits. A concurrency limiter caps in-flight calls, not calls per second. Use it when the dependency falls over from parallel connections even if the average rate is fine. It still belongs on the outbound client, not as a substitute for inbound 429s.

## What should neither limiter be used for?

- **A global legal quota** ("10,000 calls per day per contract") needs a store shared by every instance: Redis, API Management, or the vendor's own meter. In-memory windows reset on deploy and split per pod.
- **Authentication.** A rate limiter is not a substitute for auth. Limit anonymous sign-in attempts more tightly than authenticated reads, but still authenticate.
- **Background workers.** A `BackgroundService` that drains a queue should use the outbound limiter (and a channel bound), not `UseRateLimiter`, because there is no HTTP request to reject. See [background report generation](/blog/background-report-signalr-aspnet-core) for the worker side of a feature that also calls external systems.
- **Retries.** Polly's retry strategy is not a rate limiter. Retrying a 429 immediately is how you get banned. The HttpClient post covers retry; do not merge the two policies in your head.

## What fails in review?

- One shared `PermitLimit` copied from a sample into both middleware and Polly. The numbers mean different budgets. Inbound 120/minute per user is a product decision. Outbound 20/second is a contract with billing.
- Partition key `RemoteIpAddress` behind a reverse proxy that does not forward `X-Forwarded-For` correctly. Everyone looks like the proxy, so they share one bucket, or you trust a spoofable header and the bucket is useless.
- Turning on Polly retry for 429 from the partner without reading `Retry-After`. You will meet their ban threshold.
- Expecting the middleware to limit gRPC or a background consumer. It limits HTTP requests that pass through that pipeline.
- Logging the full user identifier at information level on every reject. Count rejects by policy name and route. Keep the subject out of logs unless you are investigating abuse.
- "We added Polly, so we removed the middleware." You just moved the failure from the edge to the middle of the order transaction.

## How do you verify both limits?

1. Call an endpoint faster than `PermitLimit` with one token. Expect 429, `Retry-After` when the lease provides it, and no row in the database for the rejected attempt.
2. Call with two users. One user's flood must not 429 the other if the partition is `sub`.
3. Point the named HttpClient at a local stub that counts requests. Set the outbound permit low, fire parallel requests, and confirm the stub's rate stays inside the window. The extra calls fail in your process with the rate-limit exception before the stub sees them.
4. Run two API instances. Confirm each enforces its own inbound window. If product asked for a global cap, this test is the one that fails, and that failure is the reason to add a shared store.
5. Put a retry and a rate limiter on the same client in a unit test that always returns 503. Assert an upper bound on attempts so a bug cannot loop inside the limiter.

## Which limiter should you add first?

Keep ASP.NET Core's rate limiter on the request path for anything an Angular app or a partner can call. Add a Polly rate limiter per downstream client whose quota you can violate. Do not pick one package to "handle rate limiting." If you only have time for one, pick inbound: it sheds load before you do work. Add outbound before the first partner quota incident, not after the third.


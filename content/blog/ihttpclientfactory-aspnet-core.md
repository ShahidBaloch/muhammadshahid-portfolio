---
title: "IHttpClientFactory in ASP.NET Core: Stop Socket Exhaustion the Right Way"
description: "Use IHttpClientFactory in ASP.NET Core to avoid HttpClient socket exhaustion and stale DNS — named clients, typed clients, Polly retries, and mistakes that still break production APIs."
date: "2026-08-03"
category: "architecture"
tags: ["IHttpClientFactory", "HttpClient", "ASP.NET Core", ".NET", "Performance"]
---

If you search **IHttpClientFactory ASP.NET Core**, you are usually already in trouble — or about to be. The classic symptoms are intermittent `SocketException`, slow outbound calls after traffic spikes, and a server that “runs out of ports” while CPU looks fine. The root cause is almost always **incorrect `HttpClient` lifetime**.

I wire outbound HTTP from ASP.NET Core APIs constantly: identity providers, payment gateways, Azure services, EDI partners, and internal microservices. This is the practical guide I give teams so Angular-facing APIs do not melt when background jobs and user traffic both call external systems.

## Why this keyword has high intent

Developers are not browsing casually. They hit:

- `System.Net.Sockets.SocketException`
- advice that says “make HttpClient static”
- conflicting advice that says “never reuse HttpClient”
- production incidents after a partner API DNS change

**IHttpClientFactory** is Microsoft’s recommended middle path: create `HttpClient` instances safely while pooling handlers underneath.

## The two wrong extremes

### 1) `new HttpClient()` per request

Looks innocent in a service method. Under load it opens many sockets. Disposed clients leave connections in `TIME_WAIT`. Eventually the machine cannot open new connections — **socket / port exhaustion**.

### 2) One naive static `HttpClient` forever

Fixes exhaustion, then fails when DNS for `api.partner.com` changes. The long-lived handler keeps talking to an old IP. Healthcare and payment integrations are unforgiving about that class of silent failure.

## What IHttpClientFactory actually manages

The factory pools **`HttpMessageHandler`** instances and recycles them on a lifetime (default ~2 minutes). You create short-lived `HttpClient` wrappers that reuse those handlers. You get:

- connection reuse (less exhaustion)
- periodic handler refresh (fresher DNS)
- centralized configuration (base address, headers, handlers)
- easy integration with logging and resilience policies

## Basic registration

```csharp
builder.Services.AddHttpClient();
```

Consume:

```csharp
public sealed class PartnerLookupService(IHttpClientFactory factory)
{
    public async Task<string> GetAsync(CancellationToken ct)
    {
        var client = factory.CreateClient();
        return await client.GetStringAsync("https://api.example.com/health", ct);
    }
}
```

Prefer **named** or **typed** clients for real products — raw factory calls scatter URLs.

## Named clients (my default for integrations)

```csharp
builder.Services.AddHttpClient("payments", client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Payments:BaseUrl"]!);
    client.Timeout = TimeSpan.FromSeconds(30);
    client.DefaultRequestHeaders.Add("Accept", "application/json");
});
```

```csharp
var client = factory.CreateClient("payments");
var response = await client.PostAsJsonAsync("/charges", payload, ct);
response.EnsureSuccessStatusCode();
```

Name clients after **systems**, not features: `payments`, `identity`, `blob-sas`, `edi-partner`.

## Typed clients (cleanest for application code)

```csharp
builder.Services.AddHttpClient<IPaymentGatewayClient, PaymentGatewayClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Payments:BaseUrl"]!);
});
```

```csharp
public sealed class PaymentGatewayClient(HttpClient http) : IPaymentGatewayClient
{
    public async Task<ChargeResult> ChargeAsync(ChargeRequest request, CancellationToken ct)
    {
        var response = await http.PostAsJsonAsync("/v1/charges", request, ct);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ChargeResult>(ct))!;
    }
}
```

Inject `IPaymentGatewayClient` into handlers/services. Controllers stay thin. Tests replace the typed client with a fake.

## Auth headers without poisoning the pool

Do **not** set a user-specific bearer token on a shared default header for a long-lived configuration path that other requests reuse incorrectly.

Safer patterns:

1. Set `Authorization` per request on the `HttpRequestMessage`
2. Or use a delegating handler that reads the current token from an accessor for user-delegated calls
3. For client-credentials machine tokens, use a handler that refreshes and caches the token safely

Shared handlers + accidental cookie/token sharing is a real footgun. If you need isolated cookies, read Microsoft’s guidance: factory pooling can share `CookieContainer` in ways you do not want.

## Resilience: retries belong next to the client

Transient 408/429/5xx from partners should not crash Angular users on the first blip.

With typed/named clients you can add Polly handlers (package versions vary by .NET):

- retry with jitter on transient HTTP failures
- circuit breaker for persistently down dependencies
- timeout policy aligned with `HttpClient.Timeout`

Idempotency matters: do not blindly retry `POST /charge` without an idempotency key.

## Background jobs and Hangfire-style workers

Outbound HTTP from background workers is where exhaustion appears first. Rules:

- still use `IHttpClientFactory` / typed clients
- do not capture a request-scoped typed client inside a singleton incorrectly
- create a scope when the worker needs scoped services, but keep HTTP clients registered correctly for the worker lifetime

If a job cancels immediately on `HttpClient` calls, check tokens and environment egress — but also verify you are not disposing a shared handler incorrectly.

## Angular connection (why your SPA “randomly fails”)

Angular rarely calls the third-party directly. Your API does. When sockets exhaust:

- Angular sees timeouts and 502/504 from the reverse proxy
- users blame “the frontend”
- adding Redis will not fix outbound socket leaks

Fix the HTTP client lifetime first. Then add [rate limiting](/blog/aspnet-core-rate-limiting) on public endpoints and [caching](/blog/redis-caching-aspnet-core) where reads allow it.

## Production checklist

1. No `new HttpClient()` in request paths or loops  
2. Named or typed clients for each external system  
3. Sensible timeouts (do not leave infinite)  
4. Per-request auth headers when tokens vary by user  
5. Retries only for safe/transient operations  
6. Logs include correlation id + dependency name  
7. Load test outbound fan-out, not only inbound QPS  
8. Watch for DNS change drills on critical partners  

## Failure story I still see on client projects

A healthcare integration service created `new HttpClient()` inside a loop that posted provider updates to a partner API. In QA with ten records it was fine. In production with a nightly batch of thousands, the app pool started failing with socket errors around midnight. The Angular “sync status” screen showed random failures. The fix was a typed client via **IHttpClientFactory**, batching, and concurrency limits — not more App Service instances.

Another team made a static client and survived load day one. Two months later the partner rotated DNS. Half the instances kept the old IP until recycle. Factory handler rotation (or explicit `PooledConnectionLifetime`) would have narrowed the blast radius.

## When a static client is still OK

A carefully configured singleton/`SocketsHttpHandler` with `PooledConnectionLifetime` can be valid for limited clients. In ASP.NET Core apps with many integrations, **IHttpClientFactory** stays the clearer default for teams.

## Bottom line

**IHttpClientFactory** exists because `HttpClient` lifetime is easy to get wrong and expensive in production. Use named/typed clients, keep handlers pooled, set auth carefully, and treat outbound HTTP as a first-class reliability concern.

If you want a quick review of outbound integrations in your .NET API, [contact me](/contact).

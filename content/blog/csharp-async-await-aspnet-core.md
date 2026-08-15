---
title: "C# Async and Await in ASP.NET Core: Stop Blocking Your API"
description: "C# async await explained for ASP.NET Core APIs — Task vs async void, CancellationToken, .Result starvation, WhenAll, HttpClient, Minimal APIs, and how Angular clients behave under load."
date: "2026-08-12"
category: "architecture"
tags: ["C#", "async await", "Asynchronous Programming", "ASP.NET Core", ".NET", "Performance"]
---

Async does not make a single SQL query finish sooner. It keeps the thread pool free while your API waits on databases, HTTP, or blob storage so other Angular clients are not stuck behind blocked workers.

I apply this checklist on healthcare portals, SaaS backends, and marketplace services (including CarBazaar-style architectures) where one sync-over-async helper under load starves an otherwise healthy farm.

This URL is the **implementation guide** for ASP.NET Core request paths. Interview-style drills — what a strong candidate says under a prompt — live here: [C# async await interview questions](/blog/csharp-async-await-interview-questions).

## What async actually buys you

| Myth | Reality |
|---|---|
| “Async makes code run faster” | Async frees threads during **I/O waits** so more requests share the same pool |
| “Every method should be async” | CPU-bound work needs better algorithms or careful parallelism — not random `Task.Run` |
| “`.Result` is fine if I know it completes” | Blocking on async code deadlocks (UI) or starves ASP.NET Core under load |
| “`async void` is OK in APIs” | Prefer `async Task` / `Task<T>` so the host can observe completion and faults |

In ASP.NET Core, the win is **throughput and resilience**, not magic CPU speed.

## The minimal correct controller shape

```csharp
[HttpGet("{id:guid}")]
public async Task<ActionResult<OrderDto>> GetAsync(
    Guid id,
    CancellationToken cancellationToken)
{
    var order = await _orders.GetByIdAsync(id, cancellationToken);
    if (order is null) return NotFound();
    return Ok(order);
}
```

Three non-negotiables:

1. Return `Task` / `Task<T>` — never `async void` on request paths
2. `await` EF Core / `HttpClient` methods that already expose async APIs
3. Accept and **pass** `CancellationToken` so a cancelled Angular request can stop DB work

### Minimal API equivalent

```csharp
app.MapGet("/api/orders/{id:guid}", async (
    Guid id,
    IOrderService orders,
    CancellationToken ct) =>
{
    var order = await orders.GetByIdAsync(id, ct);
    return order is null ? Results.NotFound() : Results.Ok(order);
});
```

Same rules apply — see [Minimal APIs](/blog/aspnet-core-minimal-apis).

## Async all the way down

If the repository is async, the service and controller should be async too. Mixing sync over async is where outages hide:

```csharp
// Bad — blocks a thread-pool thread
var order = _orders.GetByIdAsync(id).Result;

// Bad — same class of problem
var order = _orders.GetByIdAsync(id).GetAwaiter().GetResult();

// Good
var order = await _orders.GetByIdAsync(id, cancellationToken);
```

Watch **helpers**, FluentValidation adapters, and “temporary” sync facades. On Ecom_NET10-style checkout paths, a single `.Result` helper called from many endpoints was enough to spike timeouts when traffic arrived. Staging with one user never showed it.

## CancellationToken is not decoration

ASP.NET Core cancels the request token when the client disconnects. Pass it into EF Core and `HttpClient`:

```csharp
public async Task<Order?> GetByIdAsync(Guid id, CancellationToken ct)
{
    return await _db.Orders
        .AsNoTracking()
        .FirstOrDefaultAsync(o => o.Id == id, ct);
}
```

```csharp
public async Task<ExchangeRate> GetRateAsync(string pair, CancellationToken ct)
{
    using var response = await _http.GetAsync($"/rates/{pair}", ct);
    response.EnsureSuccessStatusCode();
    return await response.Content.ReadFromJsonAsync<ExchangeRate>(ct);
}
```

Without the token, SQL and outbound HTTP keep running after the Angular user navigates away. Under load that wastes connection pools and money.

**SPA tip:** canceling an `HttpClient` call is necessary but not sufficient — the API must honor the token.

## Task.WhenAll — speed with guardrails

Independent I/O can run concurrently:

```csharp
var pricesTask = _pricing.GetAsync(sku, ct);
var stockTask = _inventory.GetAsync(sku, ct);
await Task.WhenAll(pricesTask, stockTask);

var prices = await pricesTask;
var stock = await stockTask;
```

**Do not** share one scoped `DbContext` across parallel queries. Use separate scopes or sequential awaits. Parallel EF operations on one context race.

When both reads hit the same database, **one shaped SQL query** often beats clever `WhenAll`.

## IHttpClientFactory and async

Outbound calls should be async end-to-end and use [IHttpClientFactory](/blog/ihttpclientfactory-aspnet-core) so you do not exhaust sockets with `new HttpClient()`:

```csharp
public sealed class InventoryClient
{
    private readonly HttpClient _http;

    public InventoryClient(HttpClient http) => _http = http;

    public async Task<StockDto?> GetStockAsync(string sku, CancellationToken ct)
    {
        return await _http.GetFromJsonAsync<StockDto>($"stock/{sku}", ct);
    }
}
```

Combine with Polly only when you understand retry storms — retries amplify load during outages.

## Exceptions and async

```csharp
try
{
    await _orders.GetByIdAsync(id, ct);
}
catch (OperationCanceledException) when (ct.IsCancellationRequested)
{
    // Client left — usually log at debug, do not treat as 500
    throw;
}
catch (Exception ex)
{
    _logger.LogError(ex, "Failed loading order {OrderId}", id);
    throw;
}
```

Let your [global exception handler](/blog/aspnet-core-global-exception-handling) translate failures into ProblemDetails for Angular. Do not swallow cancels as server errors.

## ConfigureAwait in ASP.NET Core

In library code that may run on UI sync contexts, `ConfigureAwait(false)` avoids forcing continuations onto a captured context. **Inside ASP.NET Core app code**, there is typically no UI sync context — skip the noise unless you author shared NuGet packages.

`ConfigureAwait` does not forgive `.Result`.

## Async void — where it belongs

Only UI event handlers historically needed `async void`. In ASP.NET Core middleware, controllers, Minimal APIs, and background services: return `Task`.

```csharp
// Never on an API
public async void ProcessWebhook(WebhookDto dto) { ... }

// Yes
public async Task ProcessWebhookAsync(WebhookDto dto, CancellationToken ct) { ... }
```

## Background work after the HTTP response

Fire-and-forget (`_ = SendEmailAsync()`) after `SaveChangesAsync` risks disposed scopes and lost exceptions. Prefer queues, outbox patterns, or hosted services for work that must survive the request — especially in marketplace checkout flows.

## Failure story: sync service layer in a clinic portal

A healthcare team wrapped every EF call in `.GetAwaiter().GetResult()` “because the service layer was sync.” Under morning login spikes, thread-pool starvation made the Angular SPA spin while SQL stayed healthy. Scaling App Service instances treated the symptom. Async all the way down treated the cause.

## How to verify before you call it done

1. Search the API for `.Result`, `.Wait(`, `GetAwaiter().GetResult`
2. Confirm tokens flow from endpoints to EF/HttpClient
3. Load-test a hot endpoint with concurrent clients (k6, NBomber, JMeter)
4. Watch thread-pool queue length and p95 latency together
5. Cancel from the SPA mid-request and confirm SQL stops (or cancels promptly)

## Delivery checklist

1. Controllers / Minimal API handlers return `Task` / `Task<IResult>`
2. No `.Result`, `.Wait()`, or `GetAwaiter().GetResult()` on request paths
3. `CancellationToken` accepted at the edge and passed to EF / HttpClient
4. No `async void` outside true UI events
5. Parallel `WhenAll` only with independent resources (no shared DbContext)
6. Side effects that must be durable use a queue/outbox — not bare fire-and-forget
7. Logging includes correlation ids so slow awaits are findable

## Related reading

- [C# Async Await Interview Questions](/blog/csharp-async-await-interview-questions)
- [IHttpClientFactory in ASP.NET Core](/blog/ihttpclientfactory-aspnet-core)
- [EF Core and SQL Server Performance](/blog/ef-core-sql-performance)
- [ASP.NET Core Global Exception Handling](/blog/aspnet-core-global-exception-handling)

If your API still mixes sync wrappers around async EF Core and Angular clients time out under load, [contact me](/contact) — we can map the call chain and remove blockers before you scale hardware.

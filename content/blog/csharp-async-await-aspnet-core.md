---
title: "C# Async and Await in ASP.NET Core: Stop Blocking Your API"
description: "async/await lets an ASP.NET Core API wait on SQL or HTTP without holding a thread. Task vs async void, CancellationToken, .Result starvation, WhenAll, and HttpClient."
date: "2026-08-12"
updated: "2026-09-07"
category: "async-concurrency"
tags: ["C#", "async await", "Asynchronous Programming", "ASP.NET Core", ".NET", "Performance", "C# async await ASP.NET Core", "CancellationToken"]
related:
  - asynchronous-meaning-definition
  - async-vs-sync-programming
  - csharp-threadpool-starvation-sync-over-async
  - csharp-task-run-aspnet-core
  - csharp-cancellationtoken-aspnet-core
faq:
  - q: "How should I use async and await in ASP.NET Core?"
    a: "Await I/O end to end: EF Core, HttpClient, blobs, and anything else that returns a Task. Do not block with .Result or .Wait(). Pass the action CancellationToken all the way to ToListAsync and SendAsync. That keeps ThreadPool workers free for other Angular clients. Async does not make SQL faster; it stops the lobby from backing up."
  - q: "Does async make a SQL query faster?"
    a: "No. Query time is still indexing, the plan, and EF. Async only frees the ThreadPool worker during the wait. A 2-second query stays 2 seconds. What changes is that 5,000 concurrent waits do not pin 5,000 workers."
  - q: "Should an ASP.NET Core action WhenAll two queries on one DbContext?"
    a: "No. DbContext is not thread-safe. Two ToListAsync calls on the same instance in WhenAll is a race, not a speedup. Sequential awaits, two scopes, or one SQL shape. The WhenAll article covers caps and Parallel.ForEachAsync."
---

`async`/`await` let a method wait for slow work (database, HTTP, blobs) **without holding a thread**. The ThreadPool worker goes back to the pool and serves other requests. The query is not faster. The API can take more concurrent clients.

```text
Request hits Kestrel
  worker runs GetAsync until await ToListAsync
       │
       ├── worker returned to ThreadPool   ← other Angular clients can run
       │
       SQL / HTTP completes
       │
       a worker continues: map DTO, return Ok()
```

**New to this** → stay here. **Merging a PR** → [wrong vs right](#wrong-vs-right). **On-call / interview** → [production](#failure-story-sync-service-layer-in-a-clinic-portal) · [if an interviewer asks](#if-an-interviewer-asks).

**Terms used here:** **ThreadPool** = shared workers Kestrel (the ASP.NET Core web server) uses for your actions. **I/O-bound** = waiting on SQL/HTTP/disk. **CPU-bound** = hashing or tight loops — not “mark it async.” **Sync-over-async** = calling `.Result` / `.Wait()` on a `Task`. **Continuation** = code after `await`. New to Task vs Thread? Read [Task vs Thread vs ThreadPool](/blog/csharp-task-vs-thread) first.

## What async actually buys you

_Comparison: common async myths versus what ASP.NET Core actually gains._

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
    // Task<...> = promise the host can observe; never async void here
    var order = await _orders.GetByIdAsync(id, cancellationToken);
    // cancellationToken = Angular left; pass it so EF can stop
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

## Wrong vs right

I would reject a PR that blocks on a `Task` on the request path, including “just in a helper.”

```csharp
// Wrong — blocks a ThreadPool worker until EF finishes
var order = _orders.GetByIdAsync(id).Result;

// Wrong — same class of problem
var order = _orders.GetByIdAsync(id).GetAwaiter().GetResult();

// Right
var order = await _orders.GetByIdAsync(id, cancellationToken);
```

If the repository is async, the service and controller should be async too. Mixing sync over async is where outages hide. Watch **helpers**, FluentValidation adapters, and “temporary” sync facades. Staging with one user never shows it.

How to confirm starvation with `dotnet-counters` and Parallel Stacks is the [starvation diagnostic](/blog/csharp-threadpool-starvation-sync-over-async) — do not scale the farm first.

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

Without the token, SQL and outbound HTTP keep running after the Angular user navigates away. Under load that wastes connection pools and money. Linked timeouts, tests, and 499 vs 500 live on [CancellationToken in ASP.NET Core](/blog/csharp-cancellationtoken-aspnet-core).

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

**Do not** share one scoped `DbContext` across parallel queries. Use separate scopes or sequential awaits. Parallel EF operations on one context race. Capping 10,000 outbound calls is [WhenAll vs Parallel.ForEach](/blog/csharp-task-whenall-vs-parallel-foreach).

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

Retries amplify load during outages — add Polly only when you have a budget and a jittered backoff, not “retry forever.”

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

**Inside ASP.NET Core app code**, skip `ConfigureAwait(false)` — there is no UI sync context. Shared NuGet packages still need it. The full split, including .NET 8 `ConfigureAwaitOptions`, is [ConfigureAwait(false) in libraries](/blog/csharp-configureawait-false-library).

`ConfigureAwait` does not forgive `.Result`.

## Async void vs async Task: Where it belongs

Only UI event handlers historically needed `async void`. In ASP.NET Core middleware, controllers, Minimal APIs, and background services: return `Task`.

```csharp
// Never on an API
public async void ProcessWebhook(WebhookDto dto) { ... }

// Yes
public async Task ProcessWebhookAsync(WebhookDto dto, CancellationToken ct) { ... }
```

## Background work after the HTTP response

Fire-and-forget (`_ = SendEmailAsync()`) after `SaveChangesAsync` risks disposed scopes and lost exceptions. Prefer a [BackgroundService](/blog/csharp-backgroundservice-hosted-service-async) reading a bounded [Channel](/blog/csharp-channel-producer-consumer), or an outbox if recycle cannot drop the message.

## Failure story: sync service layer in a clinic portal

A healthcare team wrapped every EF call in `.GetAwaiter().GetResult()` “because the service layer was sync.” Under morning login spikes, thread-pool starvation made the Angular SPA spin while SQL stayed healthy. Scaling App Service instances treated the symptom. Async all the way down treated the cause. I have seen the same shape on marketplace checkout when a pricing helper blocked on `HttpClient`.

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

## What this is not

Idle-CPU 504s: [thread pool starvation](/blog/csharp-threadpool-starvation-sync-over-async). Wrapping I/O in `Task.Run`: [Task.Run vs await](/blog/csharp-task-run-aspnet-core). Tokens: [CancellationToken](/blog/csharp-cancellationtoken-aspnet-core). Topic map: [async & threading hub](/learning/async-concurrency).

## If an interviewer asks

What `async`/`await` buys you on ASP.NET Core; why `.Result` is starvation not a Core deadlock; why `async void` is wrong on an action; whether `WhenAll` can share a `DbContext`.

**Strong answer:** async frees workers during I/O; the query is not faster; pass the token; never block on a `Task` on the request path.


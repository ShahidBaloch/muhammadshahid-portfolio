---
title: "C# SemaphoreSlim WaitAsync: Throttle Outbound API Calls"
description: "A semaphore is a handful of tickets. SemaphoreSlim.WaitAsync is the async lock for outbound HttpClient — bulkhead (max in flight), why lock cannot await, versus inbound rate limiting."
date: "2026-09-07"
updated: "2026-09-07"
category: "async-concurrency"
tags: ["Asynchronous Programming", "Concurrency", "Threading", "C#", ".NET", "ASP.NET Core"]
related:
  - csharp-task-whenall-vs-parallel-foreach
  - ihttpclientfactory-aspnet-core
  - aspnet-core-rate-limiting
faq:
  - q: "How do I throttle outbound API calls with SemaphoreSlim.WaitAsync?"
    a: "Share one SemaphoreSlim whose initial count is the max calls in flight (for example 10). Await WaitAsync, call HttpClient, Release in a finally. That is a bulkhead: a handful of tickets, not a requests-per-second clock. Partners still 429 you if their SLA is 10 per minute — add a time-based limiter as well."
  - q: "Can I await inside a lock statement?"
    a: "No. lock (Monitor) must be entered and exited by the same thread. After await, ASP.NET Core often resumes on another ThreadPool worker. Use SemaphoreSlim.WaitAsync for an async critical section."
  - q: "Is SemaphoreSlim the same as ASP.NET Core rate limiting middleware?"
    a: "No. Middleware limits inbound HTTP (429 on your API). SemaphoreSlim limits your outbound calls or in-process parallelism. Inbound 429s are the rate-limiting article, not this one."
---

A **semaphore** is a handful of tickets. **`SemaphoreSlim.WaitAsync`** waits for a ticket **without blocking a ThreadPool worker**. A **bulkhead** is that limit: max N outbound calls in flight so one slow partner cannot take every worker. You cannot `await` inside `lock` — that is why this exists.

**New to this** → stay here. **Merging a PR** → [wrong vs right](#wrong-vs-right). **On-call / interview** → [DelegatingHandler](#typed-client-delegatinghandler) · [if an interviewer asks](#if-an-interviewer-asks).

Read first: [lock vs Monitor](/blog/csharp-lock-statement-monitor-mutex) if `lock` is new.

**Terms used here:** **Outbound** = your API calling a partner. **Inbound** = Angular calling *you* (that is [rate limiting middleware](/blog/aspnet-core-rate-limiting)). **`finally`** = runs even if an exception is thrown — put `Release()` there. **Singleton** = one instance for the whole app; **transient** = new instance per resolve.

```text
SemaphoreSlim(10, 10)  — ten tickets

  [T][T][T][T][T][T][T][T][T][T]   ← in flight
  waiting: POST roster, POST roster, ...   ← WaitAsync yields the worker
```

## Smallest example

```csharp
private readonly SemaphoreSlim _gate = new(1, 1); // async mutex

public async Task<int> NextAsync(CancellationToken ct)
{
    await _gate.WaitAsync(ct);
    try
    {
        await Task.Delay(10, ct); // stand-in for I/O you cannot do inside lock
        return _n++;
    }
    finally
    {
        _gate.Release(); // runs even if Delay throws
    }
}
```

`SemaphoreSlim(1, 1)` is a mutex you may hold across awaits. `SemaphoreSlim(10, 10)` is “ten at a time.”

## Wrong vs right

I would reject `await` inside `lock` (it will not compile — CS1996) and a **new** `SemaphoreSlim(10)` inside an HTTP handler (every request gets its own 10 tickets).

```csharp
lock (_gate)
{
    await _http.GetAsync(url, ct); // CS1996 — will not compile
}

await _gate.WaitAsync(ct);
try
{
    return await _http.GetFromJsonAsync<RosterDto>(url, ct);
}
finally
{
    _gate.Release();
}
```

`Monitor` is thread-affine: the same thread must `Exit`. After `await` you may be on another worker.

Do not `Wait()` (sync) on the request path — that [starves the pool](/blog/csharp-threadpool-starvation-sync-over-async).

## Typed client + DelegatingHandler

A **DelegatingHandler** sits in the `HttpClient` pipeline: every send goes through `SendAsync` before the network. Share **one** gate for that partner (**singleton**), not one per request. Register the handler as **transient**; it still uses the same singleton gate.

```csharp
public sealed class PartnerThrottleHandler(PartnerThrottle throttle) : DelegatingHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        await throttle.Gate.WaitAsync(cancellationToken);
        try
        {
            return await base.SendAsync(request, cancellationToken);
        }
        finally
        {
            throttle.Gate.Release();
        }
    }
}

public sealed class PartnerThrottle
{
    public SemaphoreSlim Gate { get; } = new(10, 10);
}

builder.Services.AddSingleton<PartnerThrottle>();
builder.Services.AddTransient<PartnerThrottleHandler>();
builder.Services.AddHttpClient<IPartnerClient, PartnerClient>()
    .AddHttpMessageHandler<PartnerThrottleHandler>();
```

We used [IHttpClientFactory](/blog/ihttpclientfactory-aspnet-core) correctly and still got 429s, because every Angular user that opened a roster fired N outbound calls with no gate. Inbound rate limiting would have punished our own SPA.

A thrown exception that skips `Release` permanently shrinks the semaphore until the process dies.

## Concurrency vs rate

A semaphore of 10 can still send 10 requests **every millisecond** if they complete fast. “10 per second” needs a **time** limiter.

_Comparison: SemaphoreSlim versus time-based rate limiting versus inbound middleware._

| Need | Tool |
|---|---|
| Max N in flight | `SemaphoreSlim` |
| Max N per second / minute | `System.Threading.RateLimiting` (token bucket) |
| Max inbound requests to *your* API | ASP.NET Core rate limiting middleware |
| Isolate a failing dependency | Bulkhead (this semaphore) so the rest of the app still has workers |

Capping a `WhenAll` loop is [WhenAll vs Parallel.ForEach](/blog/csharp-task-whenall-vs-parallel-foreach).

## Async lock around shared state

```csharp
public sealed class LicenseCache
{
    private readonly SemaphoreSlim _lock = new(1, 1);
    private LicenseBlob? _cached;

    public async Task<LicenseBlob> GetAsync(CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            if (_cached is { IsFresh: true }) return _cached;
            _cached = await _inner.RefreshAsync(ct);
            return _cached;
        }
        finally
        {
            _lock.Release();
        }
    }
}
```

`SemaphoreSlim` is `IDisposable`. For a singleton process-lifetime gate, disposing at shutdown is enough. Do not dispose per request.

## Common mistakes

- New `SemaphoreSlim(10)` inside the handler
- Same gate for two partners with different SLAs
- Forgetting cancellation on `WaitAsync` so a canceled Angular request still holds a slot
- Using this as inbound API throttling

## What this is not

`lock` itself: [lock vs Monitor vs Mutex](/blog/csharp-lock-statement-monitor-mutex). Inbound 429s: [rate limiting](/blog/aspnet-core-rate-limiting). Topic map: [async & threading hub](/learning/async-concurrency).

## If an interviewer asks

How to lock in async code; Mutex vs Semaphore vs Monitor; bulkhead; throttle third-party calls.

**Strong answer:** `WaitAsync` + `finally Release`, singleton gate, inbound vs outbound.

If a partner 429s you while your own Angular users are polite, [contact me](/contact). Bring their published limits and the typed client.

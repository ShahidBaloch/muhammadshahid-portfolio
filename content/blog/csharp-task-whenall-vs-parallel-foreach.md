---
title: "C# Task.WhenAll vs Task.WaitAll vs Parallel.ForEach"
description: "Task.WhenAll waits for many I/O tasks without blocking a thread. WaitAll blocks the pool. Cap 10,000 HTTP calls, never WhenAll two queries on one DbContext, Parallel.ForEach is for CPU."
date: "2026-09-07"
updated: "2026-09-07"
category: "async-concurrency"
tags: ["Asynchronous Programming", "Concurrency", "Threading", "C#", ".NET", "ASP.NET Core"]
related:
  - csharp-semaphore-slim-async-lock
  - csharp-threadpool-starvation-sync-over-async
  - csharp-async-await-aspnet-core
faq:
  - q: "Should I use Task.WhenAll or Parallel.ForEach for 10,000 HTTP calls?"
    a: "WhenAll for I/O. Parallel.ForEach is CPU data parallelism and wants synchronous bodies. Unbounded WhenAll of 10,000 GetAsync calls opens 10,000 sockets and trips partner 429s (Too Many Requests). Cap with SemaphoreSlim (50) or Parallel.ForEachAsync with MaxDegreeOfParallelism."
  - q: "What is the difference between Task.WhenAll and Task.WaitAll?"
    a: "WhenAll returns a Task you await — the worker goes back to the pool during I/O. WaitAll blocks that worker until every child finishes. On ASP.NET Core, WaitAll is the same class of bug as .Result. Use WhenAll."
  - q: "Is Task.WaitAll faster than Task.WhenAll?"
    a: "No. Clock time for three 2-second HTTP calls is about 2 seconds either way. WaitAll only adds a blocked ThreadPool thread."
  - q: "Can Task.WhenAll share one EF Core DbContext?"
    a: "No. DbContext is not thread-safe. Sequential awaits, two scopes, or one SQL shape. Never WhenAll two queries on the same instance."
---

`Task.WhenAll` takes several `Task`s and returns **one** `Task` that completes when the last child finishes. That is **I/O concurrency** (many waits in flight). `Parallel.ForEach` is **CPU parallelism** (use the cores). `Task.WaitAll` is WhenAll’s blocking cousin — same clock time, a parked ThreadPool worker.

**New to this** → stay here. **Merging a PR** → [wrong vs right](#wrong-vs-right). **On-call / interview** → [cap of 50](#whenall-with-a-cap-of-50) · [if an interviewer asks](#if-an-interviewer-asks).

**Terms used here:** **429** = HTTP Too Many Requests (partner throttled you). **rps** = requests per second. **`AggregateException`** = wrapper WhenAll uses when more than one child faulted; `await` usually unwraps to the first. **`Parallel.ForEachAsync`** = .NET 6+.

```text
Three 2-second HTTP calls

Sequential await:  A ████      B ████      C ████     ≈ 6s clock
WhenAll:           A ████
                   B ████
                   C ████                             ≈ 2s clock
WaitAll:           same 2s clock, but a ThreadPool worker sits idle the whole time
```

`async`/`await` **does not** mean “run on many cores.” It means “do not hold a worker while I/O is in flight.”

## Smallest example

```csharp
var a = Task.Delay(1000, ct);
var b = Task.Delay(1000, ct);
var c = Task.Delay(1000, ct);
await Task.WhenAll(a, b, c); // ~1 second, not ~3
```

## I/O concurrency vs CPU parallelism

_Comparison: when to use WhenAll versus Parallel.ForEach._

| Work | Tool |
|---|---|
| Independent HTTP, SQL, blob I/O | `await Task.WhenAll` (cap with `SemaphoreSlim`) |
| CPU-bound loops (hash, image resize) | `Parallel.ForEach` / `Parallel.ForEachAsync` with `MaxDegreeOfParallelism` ≈ cores |
| Three calls, merge DTO | `WhenAll` — no semaphore needed |

## Wrong vs right

I would reject unbounded `WhenAll` of 10,000 `GetAsync` calls, `WaitAll` on an API, and two EF queries on one `DbContext` in `WhenAll`.

```csharp
await Task.WhenAll(a, b, c); // Right — worker free during I/O
Task.WaitAll(a, b, c);       // Wrong on ASP.NET — [starvation](/blog/csharp-threadpool-starvation-sync-over-async)

// Wrong — DbContext is not thread-safe
var openTask = db.Orders.Where(o => o.Open).ToListAsync(ct);
var closedTask = db.Orders.Where(o => !o.Open).ToListAsync(ct);
await Task.WhenAll(openTask, closedTask); // race
```

Use sequential awaits, two scopes, or **one query**.

```csharp
// Wrong — Parallel.ForEach + .Result
Parallel.ForEach(npis, npi =>
{
    var row = _npi.GetAsync(npi).Result;
});
```

Pre-.NET 6, people did this because `ForEach` had no async body. Now you have `ForEachAsync`.

_Comparison: WhenAll versus WaitAll versus sequential await versus WhenAny._

| API | Blocks thread? | Use on ASP.NET Core |
|---|---|---|
| `await Task.WhenAll` | No | Yes |
| `Task.WaitAll` | **Yes** | No |
| `task.Wait()` / `.Result` | **Yes** | No |
| sequential `await` | No | Yes, when order or one `DbContext` requires it |
| `await Task.WhenAny` | No | First completion, timeouts, “any replica” |

`WhenAll` waits for **all**, then throws. `await` unwraps to the first exception. One failure does not cancel the siblings unless you cancel a token yourself.

## WhenAll with a cap of 50

`SemaphoreSlim` is a handful of tickets — here, 50 HTTP calls in flight. Full story: [SemaphoreSlim WaitAsync](/blog/csharp-semaphore-slim-async-lock).

```csharp
public async Task<IReadOnlyList<NpiResult>> EnrichAsync(
    IReadOnlyList<string> npis,
    CancellationToken ct)
{
    using var gate = new SemaphoreSlim(50, 50);
    var tasks = npis.Select(async npi =>
    {
        await gate.WaitAsync(ct);
        try
        {
            return await _npi.GetAsync(npi, ct);
        }
        finally
        {
            gate.Release();
        }
    });

    return await Task.WhenAll(tasks);
}
```

`Select` still creates 10,000 task state machines. The **gate** keeps 50 HTTP calls in flight. I still prefer WhenAll when I need **results in input order**. `ConcurrentBag` does not.

```csharp
await Parallel.ForEachAsync(
    npis,
    new ParallelOptions { MaxDegreeOfParallelism = 50, CancellationToken = ct },
    async (npi, token) =>
    {
        var row = await _npi.GetAsync(npi, token);
        results.Add(row);
    });
```

`MaxDegreeOfParallelism` defaulting to `ProcessorCount` (8) makes I/O look “mysteriously slow” compared to WhenAll of 1,000. You throttled to 8.

A partner dump with 10,000 NPIs and unbounded `WhenAll` opened thousands of sockets and tripped 429s. Staging with 20 ids was instant. Unbounded WhenAll is not a throttle.

## When sync / Parallel belongs on an API

Rare: you must hash a payload on the request. Then `Task.Run` + a bound, or a [Channel](/blog/csharp-channel-producer-consumer) worker. Do not `Parallel.ForEach` 10,000 items on the request thread and hope.

## Common mistakes

- WhenAll without a cap against a partner SLA of 10 rps
- Sharing `HttpClient` incorrectly — [IHttpClientFactory](/blog/ihttpclientfactory-aspnet-core)
- Ignoring cancellation so Angular leaving does not stop the remaining calls

## What this is not

Outbound reusable lock: [SemaphoreSlim](/blog/csharp-semaphore-slim-async-lock). Request-path async: [async await in ASP.NET Core](/blog/csharp-async-await-aspnet-core).

## If an interviewer asks

WhenAll vs Parallel.ForEach; WhenAll vs WaitAll; three 2-second calls; WhenAll on one DbContext.

**Strong answer:** I/O → WhenAll + cap. CPU → Parallel. Never one context in parallel.

If a bulk enrich job 429s a partner or starves Kestrel, [contact me](/contact). Bring the loop and the partner’s rate limit.

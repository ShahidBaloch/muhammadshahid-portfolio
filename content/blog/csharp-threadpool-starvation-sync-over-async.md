---
title: "C# ThreadPool Starvation: Sync-Over-Async .Result Causes 504s"
description: "Thread pool starvation is queued work with no free workers. C# .Result and .Wait on ASP.NET Core cause idle-CPU 504s — diagnose with dotnet-counters, then make the call chain async."
date: "2026-09-07"
updated: "2026-09-07"
category: "async-concurrency"
tags: ["C#", ".NET", "Asynchronous Programming", "Threading", "Concurrency", "ASP.NET Core", "Performance", "thread pool starvation", "sync over async"]
related:
  - csharp-async-await-aspnet-core
  - csharp-task-run-aspnet-core
  - csharp-task-vs-thread
faq:
  - q: "What is C# thread pool starvation from sync-over-async?"
    a: "Thread pool starvation is when Kestrel has work (new requests and async continuations) but every ThreadPool worker is blocked. The usual cause is sync-over-async: .Result, .Wait(), or GetAwaiter().GetResult() on a Task that still needs a worker to finish. Queue length climbs, CPU stays low, and Angular gets 504s. It is a queueing problem, not slow SQL."
  - q: "Is .Result a deadlock or starvation on ASP.NET Core?"
    a: "On ASP.NET Core it is starvation, not the classic UI deadlock. Core has no request SynchronizationContext, so the hang is queued work and idle CPU, then 504s. Diagnose that here. The interview page asks you to name both worlds."
  - q: "How do you diagnose thread pool starvation?"
    a: "Do not scale the App Service first. Run dotnet-counters and watch threadpool-queue-length rise while CPU stays idle. Collect a dump and look on Parallel Stacks for Wait, Result, or Monitor.Enter. .NET 9 emits WaitHandleWait for the same blocks. Search helpers, FluentValidation, and AutoMapper — controllers that are already async Task often hide the .Result one layer down."
  - q: "Can I wrap .Result in Task.Run as a last resort?"
    a: "No. The request already runs on a pool thread. Task.Run schedules a second worker, then the inner .Result blocks that one. Change the interface to async, or keep the leftover sync call off the request path on a hosted worker you own. Microsoft’s ASP.NET Core best-practices page says not to fake async with Task.Run."
---

**Thread pool starvation** means the ThreadPool has work (new HTTP requests and async continuations) and **no free worker**, because existing workers are blocked. A **504 Gateway Timeout** is the reverse proxy giving up while your API is still queued — often while CPU looks idle. The usual cause is **sync-over-async**: `.Result`, `.Wait()`, or `.GetAwaiter().GetResult()` on a `Task`.

```text
Healthy await                         Starved by .Result

[W1] await SQL  →  W1 FREE            [W1] .Result  →  W1 BLOCKED
[W2] await SQL  →  W2 FREE            [W2] .Result  →  W2 BLOCKED
[W3] serves next request              [W3] .Result  →  W3 BLOCKED
     queue: empty                          queue: 400 Kestrel requests
     CPU: low, by design                   CPU: still low — nobody is computing
                                           gateway: 504
```

**New to this** → stay here. **Merging a PR** → [wrong vs right](#wrong-vs-right). **On-call / interview** → [production](#how-it-showed-up-in-production) · [diagnose](#diagnose-before-you-scale-the-farm) · [if an interviewer asks](#if-an-interviewer-asks).

Read first if this is new: [Task vs Thread](/blog/csharp-task-vs-thread) and [async/await in ASP.NET Core](/blog/csharp-async-await-aspnet-core).

**Terms used here:** **Kestrel** = ASP.NET Core’s web server. **Continuation** = code after `await` that needs a worker when I/O finishes. **Hill-climbing** = the runtime adds ThreadPool workers slowly (about **one or two per second**) when the queue is backed up. **p95** = the 95th-percentile request duration.

## Wrong vs right

I would reject a PR that blocks on EF or `HttpClient` on the request path.

```csharp
// Wrong — worker blocked until EF finishes
[HttpGet("{id:guid}")]
public ActionResult<OrderDto> Get(Guid id)
{
    var order = _orders.GetByIdAsync(id).Result;
    return Ok(order);
}

// Right
[HttpGet("{id:guid}")]
public async Task<ActionResult<OrderDto>> GetAsync(Guid id, CancellationToken ct)
{
    var order = await _orders.GetByIdAsync(id, ct);
    if (order is null) return NotFound();
    return Ok(order);
}
```

Under one user in staging, `.Result` “works.” Under Monday morning traffic you run out of workers. SQL is not the bottleneck.

## Sync-over-async: Starvation is not a classic deadlock

ASP.NET Core does **not** install a request `SynchronizationContext`. Classic UI deadlock (continuation needs the same blocked thread) usually does not happen. `.Result` is still wrong — it occupies a pool thread until I/O completes.

_Comparison: classic deadlock versus thread pool starvation in ASP.NET Core._

| Symptom | Classic deadlock (UI / old ASP.NET) | Starvation (ASP.NET Core) |
|---|---|---|
| Sync context | Present; continuation needs the captured thread | **None** — ASP.NET Core does not install one |
| One request | Can hang forever | Usually finishes, just slowly |
| Many requests | Hang | Queue length ↑, p95 ↑, 504s, **CPU idle** |
| Fix | Don’t block the context thread | Don’t block **pool** threads on async I/O |

[ConfigureAwait(false)](/blog/csharp-configureawait-false-library) does **not** forgive `.Result`.

## How it showed up in production

The clinic portal was healthy at 7:40am. At 8:05, Angular login and the schedule grid started returning **504s**. SQL was fine. CPU sat around 12%. Scaling out bought twenty minutes. The dump showed **blocked workers**.

A healthcare service layer was “sync because the original interface was sync.” Every EF call became `GetAwaiter().GetResult()`. Controllers were `async Task` — so a code search for `.Result` in `*Controller.cs` was clean.

App Insights showed **request duration**, not SQL duration. The SQL dependency was 80ms. The HTTP request was 12 seconds, then the gateway timed out.

I have seen the same shape on marketplace checkout when a pricing helper blocked on `HttpClient`, and on SaaS exports that mixed `Wait()` “just in the CSV mapper.”

## The continuation deadlock-with-yourself

Even without a sync context, this is still a **pool deadlock under load**:

1. Request A’s worker calls `.Result` on `GetByIdAsync`
2. EF completed on I/O; the continuation needs a worker
3. Every worker is in step 1
4. Injection is too slow; Kestrel’s queue expires; 504

Every cashier is waiting for the bagger, and the bagger is waiting for a cashier. Nobody is using CPU.

## Do not wrap `.Result` in `Task.Run`

```csharp
// Still two pool workers for one SQL wait — not a last resort
public OrderDto GetById(Guid id) =>
    Task.Run(() => _orders.GetByIdAsync(id).Result).GetAwaiter().GetResult();
```

Microsoft’s ASP.NET Core best-practices page: do **not** use `Task.Run` to fake async. The request is already on a pool thread. That fight is [Task.Run vs await](/blog/csharp-task-run-aspnet-core).

If the leftover sync interface cannot move this sprint, keep the block **off the request path** — a dedicated hosted worker you own, not Kestrel. Do not “fix” it with more App Service instances first.

## Diagnose before you scale the farm

**1. Counters, not vibes**

```text
dotnet-counters monitor System.Runtime --process-id <pid>
```

What a starved box looks like:

```text
[System.Runtime]
    cpu-usage                              12 %          ← idle, not a compute fire
    threadpool-thread-count               48             ← climbing slowly (hill-climbing)
    threadpool-queue-length              312             ← this is the smoking gun
```

If CPU is 90% you have a compute problem. Starvation looks like a quiet box with an angry queue.

**2. Parallel Stacks / dump**

```text
dotnet-dump collect -p <pid>
dotnet-dump analyze <dump>
> parallelstacks
> syncblk
```

You want stacks parked in `Monitor.Wait`, `Task.Wait`, `ManualResetEventSlim`, or `SemaphoreSlim.Wait` (the sync overload). Visual Studio **Parallel Stacks** on a dump is the same picture with better grouping.

**.NET 9:** `WaitHandleWait` events fire when a worker blocks on `.Result`, `.Wait()`, `lock`, `Monitor.Enter`, or `SemaphoreSlim.Wait`.

**3. Search the call graph, not just controllers**

```text
.Result
.Wait(
GetAwaiter().GetResult()
.GetResult()
Thread.Sleep(
```

Hiding places: FluentValidation adapters, AutoMapper resolvers, `IAuthorizationHandler`, health checks, “temporary” sync facades, SOAP clients, and `Task.WhenAll(...).Wait()`.

Analyzer: `Microsoft.VisualStudio.Threading.Analyzers` (`VSTHRD002`, `VSTHRD103`).

Pass the token — [CancellationToken in ASP.NET Core](/blog/csharp-cancellationtoken-aspnet-core).

## Common mistakes

- “It works on my machine” with one user
- Blocking in `ConfigureServices` / startup on async I/O
- `async void` fire-and-forget that still hits `.Result` inside
- Treating 504 as “the gateway is flaky”
- CPU-bound loops on the request thread (different bug: you **want** CPU high; that is saturation, not starvation)

## What this is not

Merge checklist: [async and await in ASP.NET Core](/blog/csharp-async-await-aspnet-core). Wrapping the block in `Task.Run`: [Task.Run vs await](/blog/csharp-task-run-aspnet-core). Task vs OS thread: [Task vs Thread](/blog/csharp-task-vs-thread). Topic map: [async & threading hub](/learning/async-concurrency).

## If an interviewer asks

What thread-pool starvation is; what `.Result` does; why async does not create a thread; why scalability ≠ speed; how an idle-CPU slow API is diagnosed; how you find the blocking call.

**Strong answer:** names injection rate, queue length, and a dump of `Wait`/`Result` — not “async is broken.”

. Bring a 30-second `dotnet-counters` capture and one dump.

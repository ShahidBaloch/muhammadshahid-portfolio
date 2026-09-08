---
title: "C# Async Await Interview Questions"
description: "C# async await interview questions with scenario answers — .Result starvation, async void, Task.WhenAll with EF Core, CancellationToken, and ValueTask."
date: "2026-08-12"
updated: "2026-09-07"
category: "interview-questions"
tags: ["Interview Questions", "C#", "async await", "Asynchronous Programming", ".NET", "ASP.NET Core"]
related:
  - csharp-threadpool-starvation-sync-over-async
  - csharp-task-run-aspnet-core
  - csharp-async-await-aspnet-core
faq:
  - q: "What C# async await interview questions actually get asked?"
    a: "Senior interviews ask you to diagnose .Result as thread pool starvation (not a Framework-style deadlock), async void, Task.WhenAll on one EF Core DbContext, CancellationToken that actually reaches SQL, fire-and-forget after checkout, ConfigureAwait(false) as a library rule, and ValueTask vs Task. They do not ask trivia about whether async creates a thread. Recite the production failure, then the fix."
  - q: "How do I answer .Result deadlock versus starvation in an interview?"
    a: "Name both worlds. Classic deadlock is a UI or old ASP.NET SynchronizationContext story. ASP.NET Core has no request context, so .Result occupies a pool worker until I/O finishes — idle CPU, rising queue, 504s. Recite the failure, then point at the starvation how-to."
  - q: "What do interviewers want on Task.WhenAll and one DbContext?"
    a: "That you refuse it. DbContext is not thread-safe. Say sequential awaits, two scopes, or one query — not clock-time overlap on a corrupted context. The WhenAll how-to is the merge checklist; this page is the oral version."
  - q: "Does ConfigureAwait(false) matter on ASP.NET Core APIs?"
    a: "Almost never on the request path. ASP.NET Core has no custom SynchronizationContext, so false is noise in controllers. Use it in libraries that may run on WPF, WinForms, or MAUI. It is not a .Result amnesty and it does not make the API faster."
---

**This page is for 3–5 year interviews** (and anyone rehearsing those loops). `async`/`await` let an API wait on SQL or HTTP without holding a ThreadPool worker. Reciting “async does not create a new thread” is table stakes. Interviewers then ask you to diagnose starvation, unobserved exceptions, and EF Core misuse under load.

If `Task` vs `Thread` is still fuzzy, read [Task vs Thread](/blog/csharp-task-vs-thread) and [async/await in ASP.NET Core](/blog/csharp-async-await-aspnet-core) first. If the loop is staff (Channels, Span, tenant maps), use [expert C# interview questions](/blog/csharp-expert-interview-questions).

How-tos for the same traps: [starvation](/blog/csharp-threadpool-starvation-sync-over-async), [Task.Run vs await](/blog/csharp-task-run-aspnet-core), [ConfigureAwait](/blog/csharp-configureawait-false-library). Hub: [async & threading](/learning/async-concurrency).

_Crisp definitions (read before the scenarios)._

| Term | Crisp answer |
|---|---|
| `async` | Enables `await`; method returns an awaitable state machine |
| `await` | Yields the worker during incomplete awaitables; resumes later |
| `Task` | Representation of ongoing work / result — not an OS thread |
| Thread-pool starvation | Too many workers blocked; async continuations cannot run promptly |
| CancellationToken | Cooperative cancel signal; pass it to I/O APIs |

## C# async await interview questions (the list)

These are the **C# async await interview questions** I actually ask. Full scenario answers are below — this list is the prompt set, not a second article.

1. `.Result` / `.GetAwaiter().GetResult()` — deadlock in UI vs thread-pool starvation in ASP.NET Core
2. `async void` on a controller or Minimal API
3. `Task.WhenAll` sharing one EF Core `DbContext`
4. Angular navigates away; SQL keeps running (`CancellationToken`)
5. “Will marking everything `async` cut latency in half?”
6. Fire-and-forget email after checkout
7. `ConfigureAwait(false)` on an ASP.NET Core API
8. `ValueTask` vs `Task` (when allocation actually matters)
9. Sync-over-async inside a helper called from an async action

If the loop is senior/staff runtime (channels, spans, linked tokens), use [expert C# interview questions](/blog/csharp-expert-interview-questions) instead of stretching this page. Implementation deep-dives for the same traps: [starvation](/blog/csharp-threadpool-starvation-sync-over-async), [Task.Run vs await](/blog/csharp-task-run-aspnet-core), [ConfigureAwait](/blog/csharp-configureawait-false-library), [WhenAll vs WaitAll](/blog/csharp-task-whenall-vs-parallel-foreach), [IAsyncEnumerable](/blog/csharp-iasyncenumerable-yield-return).

---

## Scenario 1: `.Result` “just for now”

**Definition:** ASP.NET Core has **no** request `SynchronizationContext`. `.Result` still occupies a ThreadPool worker until the `Task` finishes → **starvation** (idle CPU, 504s), not the classic UI deadlock. How-to: [thread pool starvation](/blog/csharp-threadpool-starvation-sync-over-async).

**Prompt:** A shared library exposes `Task<Customer> GetCustomerAsync`. A legacy sync layer calls `GetCustomerAsync(id).Result`. In a WPF tool it deadlocks. In ASP.NET Core under morning load, requests hang while CPU stays low. Explain both worlds and the fix.

### Detailed answer

**UI / classic sync-context case:** `await` marshals back to the captured synchronization context by default in some app models. Blocking the context thread with `.Result` while the continuation needs that thread → **deadlock**.

**ASP.NET Core case:** `.Result` **occupies a thread-pool thread** until the task finishes. Under concurrency, workers block waiting on work that needs workers → **thread-pool starvation**. Symptoms: rising queue length, healthy SQL, unhappy Angular timeouts.

```csharp
// Interview red flag on a request path
var customer = customerService.GetCustomerAsync(id).Result;

// Also a red flag
customerService.GetCustomerAsync(id).GetAwaiter().GetResult();

// Fix
public async Task<ActionResult<Customer>> Get(Guid id, CancellationToken ct)
{
    var customer = await customerService.GetCustomerAsync(id, ct);
    return customer is null ? NotFound() : Ok(customer);
}
```

**Fix:** make the call chain async end-to-end (`async Task` controllers/handlers). If you truly cannot, isolate the sync boundary carefully (rare) — never as the default pattern in new API code.

**Weak answer:** “Async is broken in .NET.”  
**Strong answer:** Names starvation vs classic deadlock and refuses `.Result` on hot paths.

---

## Scenario 2: `async void` on an API

**Definition:** `async void` is for UI event handlers that cannot return `Task`. On an API the host cannot await completion; exceptions are unobserved. How-to: [async/await in ASP.NET Core](/blog/csharp-async-await-aspnet-core).

**Prompt:** Candidate writes:

```csharp
[HttpPost]
public async void Import(ImportRequest request)
{
    await _importer.RunAsync(request);
}
```

They say “there is no return value.” Critique.

### Detailed answer

`async void` exists primarily for **UI event handlers** that cannot return `Task`. On ASP.NET Core:

- The framework cannot await completion reliably the same way as `Task`
- Exceptions from `async void` are harder to observe/handle consistently
- Your action may look “finished” to the pipeline while work continues (or fails unnoticed)

**Correct shapes:**

```csharp
[HttpPost]
public async Task<IActionResult> Import(ImportRequest request, CancellationToken ct)
{
    await _importer.RunAsync(request, ct);
    return Accepted();
}
```

Or Minimal APIs returning `Task<IResult>`.

**Follow-up interview question:** “Where *is* `async void` acceptable?” — UI events, not controllers, not middleware, not domain services.

---

## Scenario 3: `Task.WhenAll` on one `DbContext`

**Definition:** `DbContext` is not thread-safe. `WhenAll` of two queries on one instance is a race. How-to: [WhenAll vs Parallel.ForEach](/blog/csharp-task-whenall-vs-parallel-foreach).

**Prompt:** To “speed up” a screen, a developer does:

```csharp
var openTask = _db.Orders.Where(o => o.Open).ToListAsync(ct);
var closedTask = _db.Orders.Where(o => !o.Open).ToListAsync(ct);
await Task.WhenAll(openTask, closedTask);
```

What goes wrong? How would you rewrite it?

### Detailed answer

`DbContext` is **not thread-safe**. Concurrent operations on one instance cause races, exceptions (`A second operation was started...`), or subtle corruption.

**Safe options:**

1. **Sequential awaits** (often fast enough):

```csharp
var open = await _db.Orders.Where(o => o.Open).ToListAsync(ct);
var closed = await _db.Orders.Where(o => !o.Open).ToListAsync(ct);
```

2. **True parallelism** with **separate scopes/contexts**:

```csharp
await using var scope2 = _scopeFactory.CreateAsyncScope();
var db2 = scope2.ServiceProvider.GetRequiredService<AppDbContext>();
// query on _db and db2 in parallel, then WhenAll
```

3. **One SQL query** that returns what the UI needs (usually best).

**Strong candidates** ask whether parallelism is necessary at all before doubling connections.

---

## Scenario 4: Angular navigates away; SQL keeps running

**Definition:** Cancellation is cooperative — nothing stops unless you pass the token to `ToListAsync(ct)`. How-to: [CancellationToken in ASP.NET Core](/blog/csharp-cancellationtoken-aspnet-core).

**Prompt:** User opens a heavy report route, then clicks away. Kestrel shows the request aborted, but SQL still runs ~30 seconds. Why, and how do you fix it?

### Detailed answer

ASP.NET Core ties request abortion to a `CancellationToken`. If you never pass it to EF Core / `HttpClient`, the backend keeps working for a client that no longer cares.

```csharp
public async Task<List<ReportRow>> GetAsync(ReportQuery query, CancellationToken ct)
{
    return await _db.ReportRows.AsNoTracking()
        .Where(/* filters */)
        .Take(500)
        .ToListAsync(ct); // critical
}
```

Wire the token from the controller/Minimal API parameter (framework binds it) down through services.

**Angular side:** canceling the `HttpClient` subscription/signal load is good UX; **server cooperation** is what saves database capacity.

---

## Scenario 5: “Will async cut our latency in half?”

**Definition:** Async frees workers during I/O. It does not shrink a 200ms SQL query to 100ms.

**Prompt:** A PM read a blog post and wants every method marked `async` to make pages twice as fast. How do you respond in an interview (and in real life)?

### Detailed answer

Separate three ideas:

| Goal | Tool |
|---|---|
| Higher concurrency under I/O wait | async/await done correctly |
| Lower CPU time per request | algorithms, less work, caching, better SQL |
| Parallel independent I/O | `WhenAll` with safe resources |

Async does not shrink a 200ms SQL query to 100ms. It prevents that wait from monopolizing a thread so *other* requests progress.

**Strong answer** offers measurement: before/after thread-pool waits, not vibes.

---

## Scenario 6: Fire-and-forget email after checkout

**Definition:** Fire-and-forget means you start work and do not await it before `return Ok()`. The request token is already canceled; exceptions are unobserved. How-to: [Channel producer-consumer](/blog/csharp-channel-producer-consumer).

**Prompt:** After `SaveChangesAsync`, code does:

```csharp
_ = _email.SendOrderConfirmationAsync(order.Id);
return Ok(order);
```

Discuss reliability and safer designs.

### Detailed answer

Risks:

1. Scoped services (`DbContext`, `IEmailSender` with scoped deps) may dispose when the request ends
2. Exceptions can become unobserved
3. App recycle can kill in-flight sends
4. No retry/visibility for ops

```csharp
await notify.Writer.WriteAsync(new OrderNotify(order.Id), ct);
return Ok(order);
// BackgroundService: await foreach (var msg in channel.Reader.ReadAllAsync(stopping))
```

**Better patterns:** outbox + worker; Azure Service Bus / RabbitMQ if recycle cannot drop the message; bounded `Channel` + `BackgroundService` for in-process smoothing.

Interviewers love hearing **“the request boundary is not a unit of business durability.”**

---

## Scenario 7: `ConfigureAwait(false)` debate

**Definition:** `SynchronizationContext` is the rule for which thread continuations run on. ASP.NET Core has none on the request path. How-to: [ConfigureAwait(false) in libraries](/blog/csharp-configureawait-false-library).

**Prompt:** A teammate pastes `ConfigureAwait(false)` on every await in an ASP.NET Core app. Necessary?

### Detailed answer

```csharp
// ASP.NET Core controller — skip; no context to skip
var order = await _orders.GetByIdAsync(id, ct);

// Shared library that WPF also calls
var bytes = await stream.ReadAsync(buffer, ct).ConfigureAwait(false);
```

In **library code** that may run on UI sync contexts, `ConfigureAwait(false)` avoids forcing continuations onto a captured context.

In **ASP.NET Core application code**, there is typically no UI sync context — the habit is often noise. Prefer clarity unless you are writing shared packages.

Don’t pretend it fixes `.Result` deadlocks you introduced yourself.

---

## Scenario 8: `ValueTask` vs `Task`

**Definition:** `ValueTask` is TAP with less allocation when the result is **often already complete** (cache hit). Await a given instance **once**. How-to: [Task vs Thread](/blog/csharp-task-vs-thread) (ValueTask section).

**Prompt:** When do you choose `ValueTask` / `ValueTask<T>` over `Task`?

### Detailed answer

```csharp
public ValueTask<FeeSchedule?> GetCachedAsync(string tenantId)
{
    if (_memory.TryGetValue(tenantId, out FeeSchedule? schedule))
        return new ValueTask<FeeSchedule?>(schedule); // sync complete — no Task allocated

    return new ValueTask<FeeSchedule?>(LoadAsync(tenantId));
}
```

When profiling shows allocation pressure on a **hot path that often completes synchronously**. Rules:

- Await a given `ValueTask` **once**
- Don’t store them casually
- Default to `Task` for ordinary API code

Candidates who reach for `ValueTask` everywhere without numbers score lower than candidates who say “Task until evidence.”

---

## Scenario 9: Sync over async in a “helper”

**Definition:** One `.GetResult()` helper on a hot path reintroduces [starvation](/blog/csharp-threadpool-starvation-sync-over-async) even if every controller is `async Task`.

**Prompt:** All controllers are async, but a helper does:

```csharp
public string GetName(Guid id) =>
    _users.GetNameAsync(id).GetAwaiter().GetResult();
```

Is the app “async enough”?

### Detailed answer

No. One sync-over-async helper on a hot path reintroduces blocking. Interviewers look for **async all the way down**, including helpers, filters, and validators that touch I/O.

---

## How to practice for real interviews

1. Narrate a bug you fixed involving `.Result` or missing tokens (2 minutes)
2. Draw what happens to a thread when awaiting `ToListAsync`
3. Review a PR: list three async hazards without insulting the author
4. Explain why Angular cancel ≠ database cancel unless tokens flow

## Related reading

- [Thread pool starvation](/blog/csharp-threadpool-starvation-sync-over-async)
- [Task.Run vs await on ASP.NET Core](/blog/csharp-task-run-aspnet-core)
- [C# Expert-Level Interview Questions](/blog/csharp-expert-interview-questions)
- [C# Async and Await in ASP.NET Core](/blog/csharp-async-await-aspnet-core)
- [Async & threading hub](/learning/async-concurrency)
- [Interview questions hub](/learning/interview-questions)


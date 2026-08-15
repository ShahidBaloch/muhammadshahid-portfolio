---
title: "C# Async Await Interview Questions (Scenario-Based)"
description: "C# async await interview questions with full scenario answers — .Result deadlocks, async void, Task.WhenAll with EF Core, CancellationToken, fire-and-forget, and ValueTask."
date: "2026-08-12"
category: "architecture"
tags: ["Interview Questions", "C#", "async await", "Asynchronous Programming", ".NET", "ASP.NET Core"]
---

Reciting “async does not create a new thread” is table stakes. Senior interviews ask you to diagnose starvation, unobserved exceptions, and EF Core misuse under load.

This is a set of scenario prompts with answers I expect from people who have shipped ASP.NET Core APIs (often with Angular clients). Every scenario is written from production debugging — not a trivia bank.

This URL is **interview rehearsal**. For the request-path checklist you would actually merge, use [C# async and await in ASP.NET Core](/blog/csharp-async-await-aspnet-core).

---

## Scenario 1: `.Result` “just for now”

**Prompt:** A shared library exposes `Task<Customer> GetCustomerAsync`. A legacy sync layer calls `GetCustomerAsync(id).Result`. In a WPF tool it deadlocks. In ASP.NET Core under morning load, requests hang while CPU stays low. Explain both worlds and the fix.

### Detailed answer

**UI / classic sync-context case:** `await` marshals back to the captured synchronization context by default in some app models. Blocking the context thread with `.Result` while the continuation needs that thread → **deadlock**.

**ASP.NET Core case:** Modern ASP.NET Core does not behave like the old ASP.NET sync-context story in the same way, but `.Result` still **occupies a thread-pool thread** until the task finishes. Under concurrency, workers block waiting on work that needs workers → **thread-pool starvation**. Symptoms: rising queue length, healthy SQL, unhappy Angular timeouts.

```csharp
// Interview red flag on a request path
var customer = customerService.GetCustomerAsync(id).Result;

// Also a red flag
customerService.GetCustomerAsync(id).GetAwaiter().GetResult();
```

**Fix:** make the call chain async end-to-end (`async Task` controllers/handlers). If you truly cannot, isolate the sync boundary carefully (rare) — never as the default pattern in new API code.

**Weak answer:** “Async is broken in .NET.”  
**Strong answer:** Names starvation vs classic deadlock and refuses `.Result` on hot paths.

---

## Scenario 2: `async void` on an API

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

**Better patterns:**

- Outbox table + background worker
- Queue (Azure Service Bus / RabbitMQ) — as in marketplace designs like CarBazaar
- `IHostedService` / Channel consumer with retries
- At minimum, `IHostApplicationLifetime.ApplicationStopping` awareness and proper logging if you must stay in-process (still weaker than a queue)

Interviewers love hearing **“the request boundary is not a unit of business durability.”**

---

## Scenario 7: `ConfigureAwait(false)` debate

**Prompt:** A teammate pastes `ConfigureAwait(false)` on every await in an ASP.NET Core app. Necessary?

### Detailed answer

In **library code** that may run on UI sync contexts, `ConfigureAwait(false)` avoids forcing continuations onto a captured context.

In **ASP.NET Core application code**, there is typically no UI sync context — the habit is often noise. Prefer clarity unless you are writing shared packages.

Don’t pretend it fixes `.Result` deadlocks you introduced yourself.

---

## Scenario 8: `ValueTask` flex

**Prompt:** When do you choose `ValueTask` / `ValueTask<T>` over `Task`?

### Detailed answer

When profiling shows allocation pressure on a **hot path that often completes synchronously**. Rules:

- Await a given `ValueTask` **once**
- Don’t store them casually
- Default to `Task` for ordinary API code

Candidates who reach for `ValueTask` everywhere without numbers score lower than candidates who say “Task until evidence.”

---

## Scenario 9: Sync over async in a “helper”

**Prompt:** All controllers are async, but a helper does:

```csharp
public string GetName(Guid id) =>
    _users.GetNameAsync(id).GetAwaiter().GetResult();
```

Is the app “async enough”?

### Detailed answer

No. One sync-over-async helper on a hot path reintroduces blocking. Interviewers look for **async all the way down**, including helpers, filters, and validators that touch I/O.

---

## Rapid-fire definitions (still asked)

| Term | Crisp answer |
|---|---|
| `async` | Enables `await`; method returns an awaitable state machine |
| `await` | Yields the worker during incomplete awaitables; resumes later |
| `Task` | Representation of ongoing work / result — not an OS thread |
| Thread-pool starvation | Too many workers blocked; async continuations cannot run promptly |
| CancellationToken | Cooperative cancel signal; pass it to I/O APIs |

## How to practice for real interviews

1. Narrate a bug you fixed involving `.Result` or missing tokens (2 minutes)
2. Draw what happens to a thread when awaiting `ToListAsync`
3. Review a PR: list three async hazards without insulting the author
4. Explain why Angular cancel ≠ database cancel unless tokens flow

## Related reading

- [C# Async and Await in ASP.NET Core](/blog/csharp-async-await-aspnet-core)
- [ASP.NET Core Interview Questions (Scenarios)](/blog/aspnet-core-interview-questions-scenarios)
- [IHttpClientFactory](/blog/ihttpclientfactory-aspnet-core)
- [EF Core SQL Performance](/blog/ef-core-sql-performance)

Want mock interviews focused on asynchronous programming and API scalability? [Get in touch](/contact).

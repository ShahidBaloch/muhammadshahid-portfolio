---
title: "Async vs Sync: What's the Difference in Programming?"
description: "Async vs sync explained with tables and C# examples — blocking vs non-blocking I/O, when to use each on ASP.NET Core, and how synchronous learning differs from asynchronous in plain English."
date: "2026-09-08"
updated: "2026-09-08"
category: "async-concurrency"
tags: ["Asynchronous Programming", "C#", "async await", ".NET", "ASP.NET Core", "async vs sync"]
related:
  - asynchronous-meaning-definition
  - csharp-async-await-aspnet-core
  - csharp-threadpool-starvation-sync-over-async
  - csharp-task-vs-thread
faq:
  - q: "What is the difference between async and sync?"
    a: "Sync code blocks the caller until each step finishes. Async code starts I/O, releases the worker during the wait, and continues when the operation completes. On ASP.NET Core APIs, async I/O prevents thread pool starvation under concurrent clients."
  - q: "When should I use async vs sync in C#?"
    a: "Use async for I/O — EF Core, HttpClient, blobs, messaging. Use sync for trivial in-memory work or when the entire call stack is genuinely CPU-only and fast. Never block on Task with .Result on a web request path."
  - q: "What is synchronous learning vs asynchronous learning?"
    a: "Synchronous learning is live instruction at a fixed time. Asynchronous learning is self-paced — lectures and assignments on your schedule. In software, sync vs async refers to blocking vs non-blocking code, not course format."
  - q: "What is synchronous class meaning?"
    a: "In education, a synchronous class meets live at scheduled times. In C#, a synchronous method blocks until it returns. An asynchronous class is a type whose methods return Task and use await for I/O — see the asynchronous class guide."
---

**Async vs sync** is one of the first comparisons developers look up — and one of the most misunderstood under load. This page explains the difference in plain terms, shows C# examples, and maps when each model belongs on an ASP.NET Core API.

Definitions first: [asynchronous meaning and definition](/blog/asynchronous-meaning-definition). Implementation checklist: [async/await in ASP.NET Core](/blog/csharp-async-await-aspnet-core).

## Async vs sync at a glance

| | **Synchronous (sync)** | **Asynchronous (async)** |
|---|---|---|
| **Caller during I/O** | Blocked — waits at the call site | Free — worker released during wait |
| **Completion** | Return value when call returns | `Task` / `Task<T>` completes later |
| **C# syntax** | Ordinary method | `async` + `await` |
| **ASP.NET Core default for SQL/HTTP** | Avoid on request path | Preferred |
| **Makes I/O faster?** | No | No — improves **concurrency** |
| **Risk under load** | Thread pool starvation | Misused `Task.Run`, `WhenAll` on one DbContext |

```text
Sync call on a web request

  Worker → call SQL (blocked 200 ms) → return response
           └── worker idle but UNAVAILABLE to other requests

Async call on a web request

  Worker → start SQL → worker RETURNS to pool
           SQL completes → worker continues → return response
           └── same 200 ms query, more requests can share workers
```

## Synchronous code example

```csharp
// Sync — blocks the ThreadPool worker for the entire SQL round-trip
public OrderDto? GetOrder(Guid id)
{
    var order = _db.Orders
        .AsNoTracking()
        .FirstOrDefault(o => o.Id == id);  // blocks here
    return order is null ? null : Map(order);
}
```

Every concurrent caller pins a worker for the full database latency. At hundreds or thousands of concurrent waits, the pool queue grows. CPU looks idle. Gateways return 504. That is [thread pool starvation](/blog/csharp-threadpool-starvation-sync-over-async), not “SQL is slow.”

## Asynchronous code example

```csharp
// Async — worker released while SQL runs
public async Task<OrderDto?> GetOrderAsync(Guid id, CancellationToken ct)
{
    var order = await _db.Orders
        .AsNoTracking()
        .FirstOrDefaultAsync(o => o.Id == id, ct);
    return order is null ? null : Map(order);
}
```

The query duration is unchanged. The API can serve more concurrent clients because workers are not blocked per wait.

## When to use sync

Sync is fine when:

- Work is **fast and in-memory** — parsing a config flag, mapping a DTO already in RAM
- The entire stack is **CPU-only** and completes in microseconds
- You are in a **console tool** with one thread and no concurrency pressure

Sync is **wrong** on ASP.NET Core request paths when the method waits on:

- EF Core / SQL Server
- `HttpClient` / external APIs
- Azure Blob, file I/O, message queues

Do not “fix” slow sync by wrapping `ToListAsync().Result` or `Task.Run(() => ToListAsync())`. Both make throughput worse.

## When to use async

Use async when:

- The action waits on **I/O** (database, HTTP, storage)
- You need **high concurrency** with I/O-bound latency
- Clients can disconnect — pass **`CancellationToken`** to stop wasted SQL

Rules on APIs:

1. Return `Task` / `Task<T>` — not `async void`
2. `await` end to end — no `.Result` / `.Wait()` in services or controllers
3. Do not `Task.WhenAll` two queries on one `DbContext`
4. CPU offload → measured `Task.Run` or background `Channel`, not default for SQL

## Async vs sync in other domains

The same vocabulary appears outside code. Searchers comparing **synchronous learning** and **asynchronous learning** (or **online asynchronous**) mean course delivery, not `await`:

| Term | Typical meaning (education) | Programming meaning |
|---|---|---|
| **Synchronous** | Live class — everyone together at a set time | Blocking call — wait until done |
| **Asynchronous** | Self-paced — complete modules on your schedule | Non-blocking — continue while I/O runs |
| **Synchronous class** | Scheduled live session (Zoom, lecture hall) | A class whose methods block callers |
| **Online asynchronous** | Remote course without required live meetings | Remote API using async HTTP/SQL |

If you are here for **C# and ASP.NET Core**, the programming column is what matters. Building an online learning product still uses async I/O in the API layer — see [asynchronous class in C#](/blog/asynchronous-class-csharp) for how to structure async methods on a type.

## Common async vs sync mistakes

| Mistake | Why it fails |
|---|---|
| `.Result` on `ToListAsync()` | Sync-over-async — starves the pool |
| `Task.Run(() => ToListAsync())` | Extra scheduling; still wrong abstraction |
| `async` on every method “for speed” | No I/O → unnecessary state machine |
| Sync EF in an async controller | Blocks workers; mixed stack hides outages |
| `async void` on API actions | Unobserved exceptions; host cannot track completion |

## Decision flowchart

```text
Does this code wait on SQL, HTTP, files, or messaging?
  │
  ├─ Yes → async/await, pass CancellationToken
  │
  └─ No → Is it CPU-heavy on the request thread?
            │
            ├─ Yes → algorithm first; then Task.Run with a cap or background queue
            │
            └─ No → sync is fine
```

## If an interviewer asks

**"Async vs sync — when do you choose?"**  
Async for I/O on web APIs. Sync for fast in-memory paths. Never block on `Task` in ASP.NET Core.

**"Does async replace multithreading?"**  
No. Async coordinates I/O waits. Multithreading (`Task.Run`, `lock`, `Channel`) handles CPU parallelism and in-memory coordination.

**"Will converting everything to async cut latency in half?"**  
No. It improves throughput under concurrent I/O. Latency is still query and network time.

More prompts: [C# async await interview questions](/blog/csharp-async-await-interview-questions). Hub: [async & threading](/learning/async-concurrency).

---
title: "Async and Await in C# — Explained with Examples"
---

## What is async and await in C#?

**Async and await in C#** are language features for the **Task-based Asynchronous Pattern (TAP)**. You write code as a normal sequence of statements, but **`await`** lets the runtime **release the current thread** while I/O (SQL, HTTP, files) finishes instead of blocking.

An **async method in C#** is marked with the **`async`** modifier and returns **`Task`** or **`Task<T>`** so callers can observe completion and exceptions. **`await`** is used **inside** that method on awaitable work (`FirstOrDefaultAsync`, `ReadToEndAsync`, `SendAsync`, …).

This hub is a **C# async and await explained** tutorial with examples — from the **async and await keywords in C#** through production **ASP.NET Core** rules.

## Difference between async and await in C#

`async` and `await` are not alternatives — they work together.

| | **`async` keyword in C#** | **`await` keyword in C#** |
|---|---|---|
| **What it is** | Modifier on a method, lambda, or local function | Operator inside an `async` method |
| **Purpose** | Allows `await` in the body; method returns a `Task` / `Task<T>` | Suspends the method until awaited work completes |
| **Where it goes** | On the method signature: `public async Task<T> …` | Before an awaitable call: `await _db.SaveAsync(ct)` |
| **Without the other** | `async` with no `await` → CS4014 (runs synchronously) | `await` outside `async` → compile error |
| **Analogy** | Declares “this method can pause safely” | The actual pause point |

**`async`** sets up the method; **`await`** is where control returns to the caller until I/O completes.

## How to use async and await in C# with examples

Three steps for every **async method in C#**:

1. Add **`async`** and return **`Task`** or **`Task<T>`** (not `void` on APIs).
2. **`await`** each I/O call end to end — EF Core, `HttpClient`, `File.*Async`, streams.
3. Pass **`CancellationToken`** on ASP.NET Core request paths.

### C# async await example (ASP.NET Core + SQL)

```csharp
public async Task<OrderDto?> GetOrderAsync(Guid id, CancellationToken ct)
{
    var order = await _db.Orders.FirstOrDefaultAsync(o => o.Id == id, ct);
    return order is null ? null : Map(order);
}
```

### Return types for async methods in C#

| Signature | When to use |
|---|---|
| `async Task` | Async work with no return value (side effects only) |
| `async Task<T>` | Async work that returns `T` — most API and service methods |
| `async void` | **UI event handlers only** — never controllers, middleware, or services |

On ASP.NET Core, actions return `async Task<IActionResult>` or `async Task<ActionResult<T>>` so Kestrel can track faults and completion.

### How async and await works in C#

1. The caller invokes your **async method** and gets a **`Task`** back immediately (work started).
2. At the first **`await`**, the method **yields** — the ThreadPool worker is free for other requests.
3. When the awaited I/O finishes, a worker **continues** from the line after `await`.

```text
Caller → async method runs → await SQL/HTTP/file → worker returns to pool
       → I/O completes → continuation runs → Task completes with result
```

Same mechanics for console apps and UI — on APIs the win is **concurrency under load**, not faster SQL.

Name I/O methods with an **`Async` suffix** (`GetOrderAsync`, `ReadConfigAsync`) so callers know they must not block with `.Result`.

## What async and await give you

_Comparison: why teams adopt TAP over blocking code and callbacks._

| Benefit | Generic C# | ASP.NET Core API (this hub’s focus) |
|---|---|---|
| **Non-blocking I/O** | UI stays responsive; console can do other work | ThreadPool workers serve other clients during SQL/HTTP waits |
| **Readable flow** | Linear code instead of nested callbacks | Controllers read top-to-bottom like sync code — easier review than APM `Begin/End` |
| **Composition** | `await` step A, then step B | Service awaits EF, then `HttpClient`, then maps DTO — each step is still async |
| **Exceptions** | Faulted `Task` throws on `await` — same `try/catch` shape | Unhandled faults become 500s your [exception handler](/blog/aspnet-core-global-exception-handling) can turn into ProblemDetails |
| **Not magic speed** | I/O duration unchanged | A 200 ms query stays 200 ms — you stop **pinning** one worker per wait |

For callback history and promises, see [callback vs promise](/blog/callback-vs-promise-async) and [promise vs Task](/blog/async-promise-explained).

## More async await C# examples: file I/O, delay, and CPU offload

### Async file read (StreamReader or one-shot API)

```csharp
public async Task<string> ReadConfigAsync(string path, CancellationToken ct)
{
    await using var reader = new StreamReader(path);
    return await reader.ReadToEndAsync(ct);
}

// Same idea — one call when you do not need a stream
public Task<string> ReadConfigFastAsync(string path, CancellationToken ct) =>
    File.ReadAllTextAsync(path, ct);
```

Azure blobs use the same rule: `await` the SDK’s `*Async` methods ([blob uploads](/blog/azure-blob-aspnet-core-uploads)).

### `Task.Delay` — non-blocking wait (not `Thread.Sleep`)

```csharp
public async Task<OrderStatusDto> PollPartnerAsync(Guid id, CancellationToken ct)
{
    for (var attempt = 0; attempt < 5; attempt++)
    {
        var status = await _partner.GetStatusAsync(id, ct);
        if (status.IsFinal) return status;
        await Task.Delay(TimeSpan.FromSeconds(2), ct); // yields the worker — Sleep would block it
    }
    throw new TimeoutException("Partner did not finalize in time.");
}
```

On APIs always pass **`CancellationToken`** into `Task.Delay`. Full `Sleep` vs `Delay`: [Task vs Thread](/blog/csharp-task-vs-thread).

### CPU work on a pool thread (`Task.Run`)

```csharp
public async Task<int> HashReportAsync(byte[] payload, CancellationToken ct)
{
    return await Task.Run(() => ComputeHash(payload), ct); // CPU-bound — not for wrapping EF I/O
}
```

When **not** to use `Task.Run`: [Task.Run vs await](/blog/csharp-task-run-aspnet-core).

### Console and UI — same `async`/`await` syntax

Console apps use the same keywords; the win is **not blocking** the main thread while I/O runs:

```csharp
static async Task Main(string[] args)
{
    Console.WriteLine("Reading config…");
    var json = await File.ReadAllTextAsync("appsettings.json");
    Console.WriteLine($"Loaded {json.Length} chars.");
}
```

Desktop UI uses the same pattern so the **message loop stays responsive** — buttons stay clickable while downloads run. The one exception: **`async void`** is only for UI event handlers that cannot return `Task`. Never use `async void` on ASP.NET Core actions. UI-only detail: [Task.Yield and the UI thread](/blog/csharp-task-yield-ui-thread).

## Async without parallel — then start work together

**Async is not multithreading.** One thread can `await` SQL, then `await` HTTP, sequentially — no extra workers during the waits.

**Concurrent async** means starting multiple independent I/O operations, then awaiting them — like a clinic portal that loads **patient header** and **open appointments** at the same time instead of waiting for each query to finish before starting the next.

```csharp
// Sequential — simple, safe on one DbContext
var order = await _db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.Id == id, ct);
var lines = await _db.Lines.AsNoTracking().Where(l => l.OrderId == id).ToListAsync(ct);

// Concurrent — only when resources are independent (separate scopes or HTTP calls)
var orderTask = _orders.GetHeaderAsync(id, ct);
var linesTask = _lines.ListForOrderAsync(id, ct);
await Task.WhenAll(orderTask, linesTask);
var dto = Map(await orderTask, await linesTask);
```

**Never** `Task.WhenAll` two `ToListAsync` calls on the **same** `DbContext` — it is not thread-safe. Pattern details: [Task.WhenAll caps](/blog/csharp-task-whenall-vs-parallel-foreach).

If one awaited call throws, the `Task` is **faulted** and the exception surfaces at the `await` — same mental model as sync `try/catch`.

## Async vs multithreading

| | Asynchronous (`async`/`await`) | Multithreading |
|---|---|---|
| **Goal** | Non-blocking I/O waits | Parallel workers or in-memory gates |
| **ASP.NET use** | `ToListAsync`, `HttpClient`, blobs, `File.ReadAllTextAsync` | `Task.Run` (CPU), `lock`, `Channel` |
| **Thread per I/O wait?** | No | `Task.Run` uses ThreadPool workers |
| **Wrong pattern** | `.Result` / `.Wait()` (sync-over-async) | `new Thread()` per request, `await` in `lock` |

Async frees the ThreadPool worker during SQL/HTTP/files. Multithreading coordinates CPU work and shared in-memory state. They are not interchangeable.

## When to use which

| Situation | Use |
|---|---|
| SQL, HTTP, local files, blobs, messaging | `async`/`await` end to end |
| Two independent I/O sources (two scopes or HTTP clients) | Start both, `await Task.WhenAll` |
| CPU-bound hash/encode on the API | `Task.Run` with a cap — rarely every request |
| Two threads could corrupt memory | `lock` or `Interlocked` |
| Work after `return Ok()` | `Channel` + `BackgroundService` |
| Outbound partner API flood | `SemaphoreSlim.WaitAsync` or `IHttpClientFactory` |

## Example: async I/O on ASP.NET Core

```csharp
public async Task<OrderDto?> GetOrderAsync(Guid id, CancellationToken ct)
{
    var order = await _db.Orders
        .AsNoTracking()
        .FirstOrDefaultAsync(o => o.Id == id, ct);
    return order is null ? null : Map(order);
}
```

The worker is free while SQL runs. The query is not faster — the API serves more concurrent clients.

## Thread pool starvation

**Symptom:** gateway **504** timeouts, Angular spinners, **CPU looks idle**, SQL metrics healthy.

**Cause:** **Sync-over-async** — `.Result`, `.Wait()`, or `.GetAwaiter().GetResult()` on `Task` in controllers or services. Pool workers block while async continuations still need workers to finish. The queue grows until Kestrel stops accepting work.

```csharp
// Wrong — blocks a worker until EF completes
var order = _orders.GetByIdAsync(id).Result;

// Right — worker returns to the pool during SQL
var order = await _orders.GetByIdAsync(id, ct);
```

**Fix:** async end to end on the request path. Search the repo for `.Result`, `.Wait(`, and `GetAwaiter().GetResult()` before shipping.

Full failure story and dumps: [thread pool starvation](/blog/csharp-threadpool-starvation-sync-over-async). Related how-tos in the **Starvation and library context** track below.

## ASP.NET Core rules

```text
Healthy:  action → await ToListAsync → worker returns to pool → SQL done → Ok()

Starved:  action → .Result on ToListAsync → sync-over-async → queue → 504, CPU idle
```

1. Await EF Core, `HttpClient`, storage, and `File.*Async` end to end.
2. Never `.Result`, `.Wait()`, or `.GetAwaiter().GetResult()` on hot paths.
3. Do not wrap `ToListAsync` in `Task.Run`.
4. Pass `CancellationToken` through to SQL, HTTP, files, and `Task.Delay`.
5. Use `lock` / `Interlocked` for short in-memory gates — not around EF or HTTP.
6. Use `Channel` + `BackgroundService` for work after `Ok()`.
7. Do not mark a method `async` without `await` — it runs synchronously and triggers **CS4014**; remove `async` or return `Task.FromResult(...)`.
8. `Task.WhenAll` only when each task uses **independent** resources (not one shared `DbContext`).

## Beyond basics — ConfigureAwait, ValueTask, and IAsyncEnumerable

These show up after syntax clicks — brief map to deeper articles:

| Topic | Rule of thumb on ASP.NET Core | Deep dive |
|---|---|---|
| **`ConfigureAwait(false)`** | Skip in app controllers — no UI sync context. **Do** use in shared NuGet libraries. | [ConfigureAwait in libraries](/blog/csharp-configureawait-false-library) |
| **`ValueTask` / `ValueTask<T>`** | For **measured** hot paths that often complete synchronously (cache hit). Default to `Task` until profiling proves a win. Await once. | [Task vs Thread — ValueTask](/blog/csharp-task-vs-thread) |
| **`IAsyncEnumerable<T>`** | Stream large exports/report rows without loading everything into memory — `await foreach` with `CancellationToken`. | [IAsyncEnumerable exports](/blog/csharp-iasyncenumerable-yield-return) |

## Common mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| `async` with no `await` | CS4014 warning; fake async | `Task.FromResult` or real `await` |
| `.Result` in services | Idle CPU, 504s | Async to the controller |
| `Task.Run(() => ToListAsync())` | Worse p95 | `await ToListAsync(ct)` |
| `async void` controller | Lost exceptions | `async Task<IActionResult>` |
| `WhenAll` on one `DbContext` | EF corruption | Sequential or two scopes |
| `await` inside `lock` | Deadlock / CS1996 | `SemaphoreSlim.WaitAsync` |
| Email after `Ok()` | Lost on recycle | `Channel` + `BackgroundService` |

Pick a path below, tap **Try it** to self-check, or jump to a track.

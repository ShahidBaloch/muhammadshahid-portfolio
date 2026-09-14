---
title: "Async and Await in C# — Explained with Examples"
---

> **How this hub is indexed:** This page owns the **C# language primer** (async/await keywords, TAP examples). Dictionary SERPs and ASP.NET production failure modes live on dedicated articles — linked below.

| You want… | Open |
|---|---|
| **asynchronous meaning / definition** | [Asynchronous meaning](/blog/asynchronous-meaning-definition) |
| **async vs sync tables** | [Async vs sync](/blog/async-vs-sync-programming) |
| **promise / Task / Future** | [What is a promise](/blog/async-promise-explained) |
| **callback vs promise** | [Callback vs promise](/blog/callback-vs-promise-async) |
| **ASP.NET Core production checklist** | [Async/await in ASP.NET Core](/blog/csharp-async-await-aspnet-core) |
| **504 / idle CPU starvation** | [Thread pool starvation](/blog/csharp-threadpool-starvation-sync-over-async) |
| **Task vs Thread** | [Task vs Thread](/blog/csharp-task-vs-thread) |
| **Task.WhenAll caps** | [WhenAll vs WaitAll](/blog/csharp-task-whenall-vs-parallel-foreach) |
| **Multithreading map** | [C# multithreading primer](/blog/csharp-multithreading-primer) |

## What is async and await in C#?

**Async and await in C#** are language features for the **Task-based Asynchronous Pattern (TAP)**. You write code as a normal sequence of statements, but **`await`** lets the runtime **release the current thread** while I/O (SQL, HTTP, files) finishes instead of blocking.

An **async method in C#** is marked with the **`async`** modifier and returns **`Task`** or **`Task<T>`** so callers can observe completion and exceptions. **`await`** is used **inside** that method on awaitable work (`FirstOrDefaultAsync`, `ReadToEndAsync`, `SendAsync`, …).

This hub is a **C# async and await explained** primer with examples — keywords and mechanics. For request-path rules (`.Result`, `CancellationToken`, `WhenAll` on `DbContext`), use the [ASP.NET Core async checklist](/blog/csharp-async-await-aspnet-core).

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

| Benefit | Meaning |
|---|---|
| **Non-blocking I/O** | Worker free during SQL/HTTP waits |
| **Readable flow** | Linear code instead of nested callbacks |
| **Composition** | `await` step A, then step B |
| **Not magic speed** | I/O duration unchanged — throughput improves |

For callback history and promises: [callback vs promise](/blog/callback-vs-promise-async) · [promise vs Task](/blog/async-promise-explained).

## More async await C# examples: file I/O, delay, and CPU offload

### Async file read

```csharp
public async Task<string> ReadConfigAsync(string path, CancellationToken ct)
{
    await using var reader = new StreamReader(path);
    return await reader.ReadToEndAsync(ct);
}

public Task<string> ReadConfigFastAsync(string path, CancellationToken ct) =>
    File.ReadAllTextAsync(path, ct);
```

### `Task.Delay` vs `Thread.Sleep` (language note)

`await Task.Delay(...)` yields without blocking a worker; `Thread.Sleep` pins it. Full Sleep vs Delay and Task vs Thread: [Task vs Thread](/blog/csharp-task-vs-thread).

### CPU offload (`Task.Run`) — map only

Use `Task.Run` for CPU-bound work, not to wrap EF I/O. When **not** to use it on ASP.NET Core: [Task.Run vs await](/blog/csharp-task-run-aspnet-core).

### Console and UI

Same `async`/`await` syntax. **`async void`** is only for UI event handlers — never ASP.NET Core actions. UI-only: [Task.Yield](/blog/csharp-task-yield-ui-thread).

## Async without parallel — then start work together

**Async is not multithreading.** One thread can `await` SQL, then `await` HTTP, sequentially.

**Concurrent async** means starting independent I/O, then awaiting together. **Never** `Task.WhenAll` two `ToListAsync` calls on the **same** `DbContext`. Caps and patterns: [Task.WhenAll](/blog/csharp-task-whenall-vs-parallel-foreach).

## Async vs multithreading (map)

Async frees the worker during I/O. Multithreading coordinates CPU work and shared memory. Full map: [C# multithreading primer](/blog/csharp-multithreading-primer).

## Spoke guides (not this primer)

| Topic | Winner article |
|---|---|
| Request-path checklist | [Async/await in ASP.NET Core](/blog/csharp-async-await-aspnet-core) |
| 504 / idle CPU / `.Result` | [Thread pool starvation](/blog/csharp-threadpool-starvation-sync-over-async) |
| ConfigureAwait / ValueTask / IAsyncEnumerable | [ConfigureAwait](/blog/csharp-configureawait-false-library) · [Task vs Thread](/blog/csharp-task-vs-thread) · [IAsyncEnumerable](/blog/csharp-iasyncenumerable-yield-return) |

## Common mistakes (language → spoke)

| Mistake | Where to fix |
|---|---|
| `async` with no `await` | This primer (CS4014) |
| `.Result` on request path | [Starvation](/blog/csharp-threadpool-starvation-sync-over-async) |
| `WhenAll` on one `DbContext` | [WhenAll](/blog/csharp-task-whenall-vs-parallel-foreach) |
| `async void` controller | [ASP.NET checklist](/blog/csharp-async-await-aspnet-core) |

Pick a track below, tap **Try it** to self-check, or open a spoke article from the table at the top.

---
title: "C# Async vs Multithreading for ASP.NET Core"
---

## C# async await vs multithreading — pick the model

| | Asynchronous (`async`/`await`) | Multithreading |
|---|---|---|
| **Goal** | Non-blocking I/O waits | Parallel workers or in-memory gates |
| **ASP.NET use** | `ToListAsync`, `HttpClient`, blobs | `Task.Run` (CPU), `lock`, `Channel` |
| **Thread per I/O wait?** | No | `Task.Run` uses **ThreadPool** workers |
| **Wrong pattern** | `.Result` / `.Wait()` (**sync-over-async**) | `new Thread()` per request, `await` in `lock` |

**One line:** **C# async await** frees the **ThreadPool** worker during SQL/HTTP; **C# multithreading** coordinates CPU work and shared in-memory state (**Task vs Thread** — different tools). They are not interchangeable.

Topics below: **async vs sync**, **asynchronous meaning**, **thread pool starvation**, **CancellationToken**, **ConfigureAwait**, **deadlock**, and **callback vs promise** — each links to a dedicated article.

## ASP.NET Core async rules and thread pool starvation

```text
Healthy:  action → await ToListAsync → worker returns to pool → SQL done → Ok()

Starved:  action → .Result on ToListAsync → sync-over-async → queue → 504, CPU idle
```

1. **Await** EF Core, `HttpClient`, and storage end to end (**async await ASP.NET Core**).
2. **Never** `.Result`, `.Wait()`, or `.GetAwaiter().GetResult()` — causes **thread pool starvation**.
3. **Do not** wrap `ToListAsync` in `Task.Run` — the request already runs on the pool.
4. **Pass `CancellationToken`** through to SQL and HTTP.
5. **`lock` / `Interlocked`** for short in-memory gates — not around EF or HTTP.
6. **`Channel` + `BackgroundService`** for work after `Ok()` — not fire-and-forget `Task.Run`.

## Common async and multithreading mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| `.Result` in services | Idle CPU, 504s | Async to the controller |
| `Task.Run(() => ToListAsync())` | Worse p95 | `await ToListAsync(ct)` |
| `async void` controller | Lost exceptions | `async Task<IActionResult>` |
| `WhenAll` on one `DbContext` | EF corruption | Sequential or two scopes |
| `await` inside `lock` | Deadlock / CS1996 | `SemaphoreSlim.WaitAsync` |
| Email after `Ok()` | Lost on recycle | `Channel` + `BackgroundService` |

New to definitions? Open the **definitions track** below. Production **504** dumps? Start with **thread pool starvation and sync-over-async**. Interview prep? See [interview questions](/learning/interview-questions).

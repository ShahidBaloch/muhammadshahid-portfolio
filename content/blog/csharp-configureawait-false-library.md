---
title: "ConfigureAwait(false) in C# Libraries (Not ASP.NET Core)"
description: "If you only write ASP.NET Core APIs, skip ConfigureAwait(false). It is a library contract for WPF/MAUI SynchronizationContext — not a Core performance trick, and not a .Result amnesty."
date: "2026-09-07"
updated: "2026-09-07"
category: "async-concurrency"
tags: ["C#", ".NET", "Asynchronous Programming", "Threading", "Concurrency"]
related:
  - csharp-threadpool-starvation-sync-over-async
  - csharp-async-await-interview-questions
  - csharp-task-yield-ui-thread
faq:
  - q: "Should I use ConfigureAwait(false) in ASP.NET Core?"
    a: "Not on controllers, Minimal APIs, or hosted services. ASP.NET Core has no SynchronizationContext, so the call does not change where the continuation runs. Use ConfigureAwait(false) in NuGet or shared libraries that may run on WPF, WinForms, MAUI, or classic ASP.NET. Turn CA2007 on the library project and off on the web project."
  - q: "Does ConfigureAwait(false) prevent .Result deadlocks?"
    a: "In a UI app it can keep the library continuation off the dispatcher so a blocked UI thread is not waiting on itself. It does not make .Result safe — do not block. In ASP.NET Core, .Result is thread pool starvation, not a context deadlock."
  - q: "Does ConfigureAwait(false) make ASP.NET Core faster?"
    a: "No meaningful win. There is no context to skip. Measure SQL and HttpClient instead. Sprinkling false on every controller await only grows the PR."
  - q: "Can I use ConfigureAwait(false) then read IHttpContextAccessor?"
    a: "In ASP.NET Core app code, skip false. After false in a library or on Blazor Server, the continuation is on the pool, not the circuit. Do not assume HttpContext or component state is still there. Capture claims or tenant id before the await."
---

**If you only write ASP.NET Core APIs, you can skip `ConfigureAwait(false)`.** There is no UI thread to capture. Sprinkling it on every controller `await` does not make the API faster.

**`ConfigureAwait(false)` is a library contract:** “resume on any ThreadPool thread, do not post back to the caller’s UI.” You need it in NuGet / shared DLLs that might run inside WPF, WinForms, MAUI, or classic ASP.NET.

**New to this** → stay here. **Merging a PR** → [wrong vs right](#wrong-vs-right). **On-call / interview** → [who has a context](#who-has-a-synchronizationcontext) · [.NET 8 options](#net-8-configureawaitoptions) · [if an interviewer asks](#if-an-interviewer-asks).

**Terms used here:** **SynchronizationContext** = a rule for **which thread** continuations must run on (WPF dispatcher, Blazor circuit). **Capture** = after `await`, try to resume on that same context. **`ConfigureAwait(false)`** = do not capture; resume on a pool thread.

```text
WPF deadlock without ConfigureAwait(false) in the library

  UI thread:  LoadHeaderAsync(...).Result     ← blocked, waiting for the Task
       │
       library await ReadAsync  captures UI context
       │
       ReadAsync completes → continuation needs the UI thread
       │
       UI thread is still in .Result  →  deadlock
```

With `ConfigureAwait(false)` inside the library, the continuation can run on the pool. The UI thread is still blocked (still a bad handler) but it is not waiting on itself.

## What await captures

The compiler builds a **state machine**. On an incomplete `await`, it stores locals and, by default, captures:

1. `SynchronizationContext.Current` if it is not null
2. Otherwise the current `TaskScheduler`

When the task completes, the continuation is **posted back** to that context.

```csharp
public async Task<ClaimHeader> LoadHeaderAsync(Stream stream, CancellationToken ct)
{
    var bytes = await stream.ReadAsync(buffer, ct).ConfigureAwait(false);
    // Continuation is not required to run on the caller's UI thread
    return ParseHeader(buffer.AsSpan(0, bytes));
}
```

In a NuGet package I do not know the host. That is why the `false` is there. **Must** means every incomplete `await` in the library, not the first one.

## Wrong vs right

I would reject a PR that adds `.ConfigureAwait(false)` to every ASP.NET Core controller “for performance.” I would also reject a shared parser that *omits* it when WPF might call it.

```csharp
// ASP.NET Core controller — skip false; no context to skip
var order = await _orders.GetByIdAsync(id, ct);

// Same helper in a library that WPF also references — use false
var bytes = await stream.ReadAsync(buffer, ct).ConfigureAwait(false);
```

```csharp
// WPF — never do this, but people do
var header = parser.LoadHeaderAsync(stream, CancellationToken.None).Result;
```

Fix the WPF handler to `async void` (the one place `async void` is for) and `await`. The library just refused to join the deadlock. `.Result` on ASP.NET Core is [starvation](/blog/csharp-threadpool-starvation-sync-over-async), not this deadlock.

## Who has a SynchronizationContext

_Comparison: which hosts have a SynchronizationContext and whether ConfigureAwait(false) matters._

| Host | Context? | `ConfigureAwait(false)` |
|---|---|---|
| ASP.NET Core (MVC, Minimal APIs, most workers) | **No** | Skip in app code |
| Console / generic host | No | Skip |
| WPF / WinForms / MAUI | **Yes** | Required in libraries; in app code only if you must resume off-UI |
| Blazor Server | **Yes** (circuit) | `false` leaves the circuit — do not touch component state after |
| Blazor WebAssembly | Yes (single thread) | Library still uses `false`; UI stays on the JS thread by design |
| Classic ASP.NET | Yes | Library `false`; do not `.Result` on the request thread |
| xUnit (modern) | Usually no | Optional |

ASP.NET Core **removed** the request `SynchronizationContext` on purpose. Continuations already run on the pool.

## What it does not do

- Does not make `.Result` acceptable on an API
- Does not speed up EF Core
- Does not replace [CancellationToken](/blog/csharp-cancellationtoken-aspnet-core)
- Does not restore `HttpContext` if you left the request

## Blazor Server and HttpContext after `false`

Blazor Server **has** a circuit `SynchronizationContext`. That is the miss in the “Core has no context, skip `false`” slogan.

```csharp
var rows = await _db.Fees.ToListAsync(ct).ConfigureAwait(false);
// Continuation is on the pool — not the circuit
grid.Items = rows; // wrong thread
var user = _http.HttpContext?.User; // do not assume this is still the circuit request
```

_Comparison: what is safe after ConfigureAwait(false)._

| After `ConfigureAwait(false)` | Safe? |
|---|---|
| Circuit-bound UI / component fields | No — you left the circuit |
| `IHttpContextAccessor.HttpContext` you did not capture | Copy claims / tenant id **before** the await |
| Plain DTO parse on the pool | Yes |

ASP.NET Core **controllers** still skip `false` — they have no circuit. UI yielding is [Task.Yield](/blog/csharp-task-yield-ui-thread).

## .NET 8 ConfigureAwaitOptions

`Task.ConfigureAwait(ConfigureAwaitOptions)` is extra flags on **`Task` / `Task<T>`**, not yet on `ValueTask` in .NET 8.

- `ConfigureAwaitOptions.None` — do not capture context (same idea as `false`)
- `SuppressThrowing` — await a faulted task without throwing (you must inspect `Status`)
- `ForceYielding` — always yield, even if the task is already complete (cousin of [Task.Yield](/blog/csharp-task-yield-ui-thread))

Default `await` is unchanged: it still captures. App code on Core still does not need this for throughput.

## Analyzers I actually turn on

- **CA2007** / `ConfigureAwait` analyzer on **library** projects
- **Off** on the ASP.NET Core web project, or you will fight noise in every controller

One rule for `MyCompany.Claims.Parsing.csproj`. A different rule for `MyCompany.Claims.Api.csproj`.

## Common mistakes

- Sprinkling `false` on controllers “for performance”
- Using `false` then touching UI-bound objects or `HttpContext` in the continuation
- Forgetting `false` on `await foreach` in a library
- Believing Core “deadlocks like Framework” — it mostly **starves** instead

## What this is not

Request-path async: [async await in ASP.NET Core](/blog/csharp-async-await-aspnet-core). UI message pump: [Task.Yield](/blog/csharp-task-yield-ui-thread).

## If an interviewer asks

When is `ConfigureAwait(false)` still useful; does it help performance on Core; what `SynchronizationContext` is; what happens across an `await` on one request.

**Strong answer:** “Libraries yes. ASP.NET Core app code no. It is not a `.Result` amnesty.”

If you are extracting a shared parser or client SDK from an ASP.NET Core solution and need the library/app analyzer split, [contact me](/contact).

---
title: "C# AsyncLocal vs ThreadLocal: Context Across await"
description: "ThreadLocal sticks to an OS thread; after await you are often on another ThreadPool worker. AsyncLocal flows with ExecutionContext. Prefer a tenantId parameter; ambient current-user is how clinic B saw clinic A."
date: "2026-09-07"
updated: "2026-09-07"
category: "async-concurrency"
tags: ["Asynchronous Programming", "Threading", "Concurrency", "C#", ".NET", "ASP.NET Core"]
related:
  - csharp-task-vs-thread
  - csharp-async-await-aspnet-core
  - csharp-concurrentdictionary-lock
faq:
  - q: "What is the difference between AsyncLocal and ThreadLocal in C#?"
    a: "ThreadLocal and [ThreadStatic] stick to an OS thread. After await, ASP.NET Core often resumes on another ThreadPool worker, so the value is gone — or left for the next request on that worker. AsyncLocal flows with ExecutionContext across awaits. Prefer a tenantId parameter."
  - q: "Can I store the current user in a static helper?"
    a: "Not in ThreadLocal or static fields. Prefer a parameter or IHttpContextAccessor for request scope. If you must use ambient context this sprint, use AsyncLocal and clear it at the end of the request."
  - q: "Does ConfigureAwait(false) stop AsyncLocal?"
    a: "No. ExecutionContext still flows unless you call ExecutionContext.SuppressFlow. ConfigureAwait is about SynchronizationContext (UI / circuit), not AsyncLocal."
  - q: "Why would AsyncLocal leak the wrong tenant across requests?"
    a: "Either leftover ThreadLocal on a reused pool thread, or a Func / DI factory captured in ConfigureServices that still reads the empty startup ExecutionContext. Set and read AsyncLocal on the request flow, not in a singleton factory built at boot."
---

**`ThreadLocal<T>`** (and `[ThreadStatic]`) stores a value **per OS thread**. **`AsyncLocal<T>`** stores a value **per async flow**, so it survives `await` even when work resumes on a different thread. After `await ToListAsync`, ASP.NET Core often continues on another ThreadPool worker. Prefer passing `tenantId` as a parameter. **`IHttpContextAccessor`** is the request-scoped way to read the current user — not a static field.

**New to this** → stay here. **Merging a PR** → [wrong vs right](#wrong-vs-right). **On-call / interview** → [AsyncLocal pattern](#asynclocal-done-as-safely-as-ambient-gets) · [if an interviewer asks](#if-an-interviewer-asks).

**Terms used here:** **Ambient context** = a hidden “current user” instead of a parameter. **ExecutionContext** = the logical call context that flows across `await` (`AsyncLocal`, culture, `Activity`). **SynchronizationContext** = which *thread* continuations run on (UI). They are not the same.

```text
Request starts on Thread 5    User.Value = "clinic-a"  (ThreadLocal)
       await ToListAsync
Request continues on Thread 12   ThreadLocal empty — or Thread 12 still has clinic-b leftover
                                 AsyncLocal still "clinic-a"
```

## Thread hop demo

```csharp
var before = Environment.CurrentManagedThreadId;
await _db.SaveChangesAsync(ct);
var after = Environment.CurrentManagedThreadId;
// before and after are often different on ASP.NET Core
```

Do not store thread ids as request ids. Use `Activity` / `HttpContext.TraceIdentifier`. Threads vs tasks: [Task vs Thread](/blog/csharp-task-vs-thread).

## Wrong vs right

I would reject `ThreadLocal` / `[ThreadStatic]` for “current user” on ASP.NET Core, and a static `CurrentUser` helper.

```csharp
private static readonly ThreadLocal<string?> User = new();

async Task HandleAsync()
{
    User.Value = "clinic-a";
    await _db.SaveChangesAsync();
    Log(User.Value); // often null — different thread
}
```

Worse: you never clear `ThreadLocal` on a pool thread. The next request that lands on that worker inherits a user. That is how ambient context becomes a wrong-tenant incident.

```csharp
// Right — request scope
var tenant = http.User.FindFirst("tenant")?.Value;
await _orders.ListAsync(tenant, ct);

// Compromise — AsyncLocal, cleared at end of request
using (TenantContext.Push(tenant!))
    await next(http);
```

## ExecutionContext vs SynchronizationContext

_Comparison: SynchronizationContext versus ExecutionContext across await._

| | Flows across `await` by default? | What it is for |
|---|---|---|
| **SynchronizationContext** | If captured (`ConfigureAwait(true)`) | UI dispatcher / classic ASP.NET affinity |
| **ExecutionContext** | **Yes** | `AsyncLocal`, security, culture, `Activity` |

ASP.NET Core has **no** sync context, but it **does** flow ExecutionContext. [ConfigureAwait(false)](/blog/csharp-configureawait-false-library) does not clear `AsyncLocal`.

## AsyncLocal done as safely as ambient gets

```csharp
public static class TenantContext
{
    private static readonly AsyncLocal<string?> Current = new();

    public static IDisposable Push(string tenantId)
    {
        var previous = Current.Value;
        Current.Value = tenantId;
        return new Pop(previous);
    }

    public static string? Value => Current.Value;

    private sealed class Pop(string? previous) : IDisposable
    {
        public void Dispose() => Current.Value = previous;
    }
}
```

Still ambient. Still easy to leak into a singleton cache key if you forget `TenantContext.Value` in the key. I prefer **explicit `tenantId` parameters**. `AsyncLocal` is for logging you cannot thread through 15 layers this sprint — with a deadline to remove it.

`IHttpContextAccessor` is request-scoped reality. Don’t cache `HttpContext` in a singleton. Tenant keys on maps: [ConcurrentDictionary](/blog/csharp-concurrentdictionary-lock).

## The factory captured at startup

**Advanced.** A delegate built once at boot can freeze the empty `ExecutionContext`.

```csharp
services.AddSingleton<ITenantAccessor>(_ =>
    new TenantAccessor(() => TenantContext.Value)); // runs at startup
```

Build or invoke the reader **inside** `InvokeAsync`. `AsyncLocal<T>` where `T` is a **mutable** list shared across `WhenAll` is a race — store immutable values. `ExecutionContext.SuppressFlow()` exists for rare libraries; you will surprise every logger if you use it in app code.

## Common mistakes

- `[ThreadStatic] CurrentUser` in a helpers project used by Core and WPF
- Tests that pass because xUnit reused one thread
- Assuming `async` keeps `ManagedThreadId` stable

## What this is not

Task vs OS thread: [Task vs Thread](/blog/csharp-task-vs-thread). UI context vs ExecutionContext: [ConfigureAwait(false)](/blog/csharp-configureawait-false-library). Tenant keys on maps: [ConcurrentDictionary](/blog/csharp-concurrentdictionary-lock). Topic map: [async & threading hub](/learning/async-concurrency).

## If an interviewer asks

ThreadLocal vs AsyncLocal; leftovers of current user; thread id across await.

**Strong answer:** pool threads are reused; ThreadLocal lies after await; prefer parameters; AsyncLocal is a measured compromise.

If logs show the wrong clinic after an await, [contact me](/contact). We look for `ThreadStatic` and static `User` first.

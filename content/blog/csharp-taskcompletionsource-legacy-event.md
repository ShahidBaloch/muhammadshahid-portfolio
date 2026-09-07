---
title: "C# TaskCompletionSource: Wrap Legacy Events as Tasks"
description: "TaskCompletionSource creates a Task you complete yourself. Use it to wrap event-based APIs (EAP) into TAP: TrySetResult when Connected fires, then callers await instead of WaitOne."
date: "2026-09-07"
updated: "2026-09-07"
category: "async-concurrency"
tags: ["C#", ".NET", "Asynchronous Programming", "Threading", "Concurrency"]
related:
  - csharp-async-await-aspnet-core
  - csharp-cancellationtoken-aspnet-core
  - csharp-configureawait-false-library
faq:
  - q: "How do I wrap a legacy event-based API into a Task with TaskCompletionSource?"
    a: "Create a TaskCompletionSource, subscribe once, TrySetResult / TrySetException / TrySetCanceled in the handler, return tcs.Task, and unsubscribe in a finally. Use RunContinuationsAsynchronously so the vendor event thread is not hijacked by your awaiters."
  - q: "Why TrySetResult instead of SetResult?"
    a: "SetResult throws if the Task is already completed. Events can double-fire, and a timeout or cancel can complete the Task first. TrySet* is idempotent and race-safe."
  - q: "What is TAP versus EAP?"
    a: "TAP is the Task-based Asynchronous Pattern (await). EAP is the Event-Based Asynchronous Pattern (FooCompleted). APM is Begin/End. TaskCompletionSource is the bridge. Do not .Result that Task on a UI thread (deadlock) or an ASP.NET Core request (starvation)."
---

**`TaskCompletionSource<T>`** creates a `Task` **you** control. When the legacy `Connected` event fires, you call `TrySetResult()` and anyone `await`ing that task continues. That is the bridge from **EAP** (Event-based Asynchronous Pattern: `FooCompleted`) to **TAP** (Task-based Asynchronous Pattern: `await`). **APM** is the even older `Begin`/`End` pair.

**New to this** → stay here. **Merging a PR** → [wrong vs right](#wrong-vs-right). **On-call / interview** → [vendor connect](#one-shot-connect) · [if an interviewer asks](#if-an-interviewer-asks).

**Terms used here:** **`RunContinuationsAsynchronously`** = do not run your `await` continuation **on the vendor’s event thread** (that thread can deadlock their lock).

```text
Legacy Connected event  →  handler  →  tcs.TrySetResult()
                                          ↓
                               caller: await tcs.Task
```

## Smallest example

```csharp
var tcs = new TaskCompletionSource<int>(
    TaskCreationOptions.RunContinuationsAsynchronously);

tcs.TrySetResult(42);
var n = await tcs.Task; // 42
```

In a unit test, a fake completes the TCS instead of raising a real event.

## Wrong vs right

I would reject `SetResult` on a vendor event that can double-fire, and wrapping then calling `.Result` on Kestrel or a UI thread.

```csharp
tcs.SetResult();     // throws if already completed (double-fire, cancel raced)
tcs.TrySetResult();  // Right — no-op if already done
```

Do not wrap then call `.Result` on an API thread ([starvation](/blog/csharp-threadpool-starvation-sync-over-async)) or a UI thread (deadlock).

A **stream** of `MessageReceived` is not a `Task`. That is [IAsyncEnumerable](/blog/csharp-iasyncenumerable-yield-return) or a [Channel](/blog/csharp-channel-producer-consumer). TCS is **one completion**.

## One-shot connect

The vendor SDK had `Connected` / `Faulted` and no `Task`. Samples used `AutoResetEvent.WaitOne`. We needed `await ConnectAsync(ct)`.

```csharp
public Task ConnectAsync(Uri endpoint, CancellationToken ct)
{
    var tcs = new TaskCompletionSource(
        TaskCreationOptions.RunContinuationsAsynchronously);

    void OnOk(object? sender, EventArgs e)
    {
        Cleanup();
        tcs.TrySetResult();
    }

    void OnFail(object? sender, ExceptionEventArgs e)
    {
        Cleanup();
        tcs.TrySetException(e.Exception);
    }

    void Cleanup()
    {
        _client.Connected -= OnOk;
        _client.Faulted -= OnFail;
    }

    ct.Register(() =>
    {
        Cleanup();
        tcs.TrySetCanceled(ct);
        try { _client.Abort(); } catch { /* vendor */ }
    });

    _client.Connected += OnOk;
    _client.Faulted += OnFail;
    _client.Connect(endpoint);

    return tcs.Task;
}
```

Rules:

1. **`RunContinuationsAsynchronously`** — `SetResult` on the vendor thread otherwise runs `await` continuations **inline** on that thread.
2. **`TrySet*`** — cancel, timeout, and the event race.
3. **Unsubscribe** — handlers on a long-lived client are leaks.
4. **Register cancellation** that actually aborts the SDK.

Linked timeout: `CreateLinkedTokenSource` per operation; dispose it. Do not store a CTS on a singleton and cancel it from two requests.

## Request/reply

```csharp
public Task<Reply> SendAsync(Request request, CancellationToken ct)
{
    var tcs = new TaskCompletionSource<Reply>(
        TaskCreationOptions.RunContinuationsAsynchronously);

    _pending[request.Id] = tcs;
    ct.Register(() =>
    {
        if (_pending.TryRemove(request.Id, out var pending))
            pending.TrySetCanceled(ct);
    });

    _client.Send(request);
    return tcs.Task;
}
```

`ConcurrentDictionary` for `_pending` — use `TryAdd`, not [GetOrAdd](/blog/csharp-concurrentdictionary-lock).

Libraries still need [ConfigureAwait(false)](/blog/csharp-configureawait-false-library). Tokens: [CancellationToken](/blog/csharp-cancellationtoken-aspnet-core).

## Common mistakes

- Completing on the event thread without `RunContinuationsAsynchronously`
- `async void` event handler that you *could* have turned into TCS at the boundary
- Fire-and-forget `_ = ConnectAsync()` with no observation of faults

## What this is not

A stream of events is not a `Task`: [IAsyncEnumerable](/blog/csharp-iasyncenumerable-yield-return) or a [Channel](/blog/csharp-channel-producer-consumer). Tokens: [CancellationToken](/blog/csharp-cancellationtoken-aspnet-core). Libraries still need [ConfigureAwait(false)](/blog/csharp-configureawait-false-library).

## If an interviewer asks

TAP; wrapping EAP; testing async code by completing a TCS in a fake.

**Strong answer:** TrySet, RunContinuationsAsynchronously, unsubscribe, cancel aborts the SDK.

If you are stuck with an event-only vendor SDK on a Kestrel host, [contact me](/contact). Bring the event list. One-shot vs stream is the whole design.

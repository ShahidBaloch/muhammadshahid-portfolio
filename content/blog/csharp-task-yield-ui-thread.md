---
title: "C# Task.Yield: Keep WPF and MAUI UI Threads Responsive"
description: "Skip this if you only write ASP.NET Core APIs. await Task.Yield() lets the WPF/MAUI message pump run, then continues on the UI thread. Prefer Task.Run for CPU. Yield is not a Core performance trick."
date: "2026-09-07"
updated: "2026-09-07"
category: "async-concurrency"
tags: ["C#", ".NET", "Asynchronous Programming", "Threading"]
related:
  - csharp-configureawait-false-library
  - csharp-task-vs-thread
  - csharp-threadpool-starvation-sync-over-async
faq:
  - q: "When should I use Task.Yield on a UI thread?"
    a: "When a chunk of synchronous work is already on the dispatcher and the screen must paint. await Task.Yield() posts the continuation back to the captured SynchronizationContext after returning to the message pump. Prefer Task.Run for CPU. Yield is the scalpel when you must stay on the STA thread between steps."
  - q: "Is Task.Yield useful in ASP.NET Core?"
    a: "Rarely. There is no UI message pump. Yielding just requeues work on the ThreadPool. Prefer not blocking. If you have CPU work on an API, offload with a bounded worker or a Channel, not Yield in a controller."
  - q: "Task.Yield vs Task.Delay(0) vs ConfigureAwait(false)?"
    a: "Yield always continues asynchronously (forces a post back to the UI context). Delay(0) may complete synchronously depending on timer version. ConfigureAwait(false) leaves the UI context — the opposite of coming back to the dispatcher so you can touch controls."
---

**Skip this if you only write ASP.NET Core APIs.** There is no window to paint. `await Task.Yield()` in a controller just requeues you on the ThreadPool. It does not make SQL faster.

**`await Task.Yield()`** returns to the caller immediately and posts the rest of the method onto the captured **SynchronizationContext**. On WPF/MAUI that context is the **UI thread** (dispatcher). The **message pump** can run (paint, clicks). Then your method continues **on the UI thread**, which is what you want if the next line touches controls.

```text
[UI thread] HashFile (CPU)  →  frozen window
[UI thread] HashFile → await Task.Yield() → pump paints Progress → back on UI
Better: await Task.Run(() => HashAll()) → UI never hashes
```

`async` alone does not slice a tight CPU loop. It only yields at `await`.

**New to this** → stay here. **Merging a PR** → [wrong vs right](#wrong-vs-right). **On-call / interview** → [ASP.NET Core](#asp-net-core) · [if an interviewer asks](#if-an-interviewer-asks).

**Terms used here:** **UI thread / dispatcher** = the one thread allowed to touch controls. **Message pump** = the loop that paints and handles clicks; a tight CPU loop on that thread freezes the window. **`async void`** is normally dangerous (exceptions unobserved, host cannot await). The **exception** is a UI event handler — there is no `Task` return slot. Still prefer `async Task` everywhere else.

## Smallest example

```csharp
private async void OnExportClicked(object sender, RoutedEventArgs e)
{
    ExportButton.IsEnabled = false;
    StatusText.Text = "Exporting…";

    var files = _pending.ToArray();
    for (var i = 0; i < files.Length; i++)
    {
        HashFile(files[i]);
        Progress.Value = i + 1;
        await Task.Yield(); // let the dispatcher paint Progress
    }

    StatusText.Text = "Done";
    ExportButton.IsEnabled = true;
}
```

`Yield` produces an awaitable that **is not complete**. Because you did not `ConfigureAwait(false)`, the continuation is posted to the UI thread.

## Wrong vs right

I would reject `await Task.Yield()` in an ASP.NET Core controller “to stay responsive.”

Prefer `Task.Run` for a two-second hash of **one** file: the UI thread never hashes.

```csharp
ExportButton.IsEnabled = false;
try
{
    await Task.Run(() => HashAll(_pending), ct);
    StatusText.Text = "Done";
}
finally
{
    ExportButton.IsEnabled = true;
}
```

Yield is for when you **must** stay on the UI thread between steps (legacy COM, STA-only control APIs) or you are slicing a loop that already owns the dispatcher.

_Comparison: Task.Yield versus Delay versus Task.Run versus ConfigureAwait(false)._

| Call | Typical intent |
|---|---|
| `await Task.Yield()` | Always yield; resume on captured context (UI) |
| `await Task.Delay(1)` | Timed pause; still UI if you capture context |
| `await Task.Delay(0)` | **Do not rely on this** as Yield — completion can be synchronous |
| `await Task.Run(() => HashFile(f))` | Run CPU on the **pool**, then come back to UI on `await` |
| `.ConfigureAwait(false)` | Resume on the pool — **cannot** touch `StatusText` after |

Libraries leaving the UI thread: [ConfigureAwait(false)](/blog/csharp-configureawait-false-library).

## ASP.NET Core

No dispatcher. If a controller is CPU-heavy, you have an architecture problem: [Channel worker](/blog/csharp-channel-producer-consumer) or a real job. [Starvation](/blog/csharp-threadpool-starvation-sync-over-async) comes from blocking, not from missing Yield.

`.NET 8` `ConfigureAwaitOptions.ForceYielding` is the library version of “always yield” on a `Task`. Still not an API performance tool.

Worker loops that used `while + Delay` can overlap ticks; `PeriodicTimer` is the better periodic wait — a timer topic, not a substitute for Yield inside a hash loop.

## Common mistakes

- Yield after `ConfigureAwait(false)` then touching UI
- Yield in ASP.NET “to be responsive”
- `Thread.Sleep` on the UI thread — Sleep freezes the pump

## What this is not

Libraries leaving the UI thread: [ConfigureAwait(false)](/blog/csharp-configureawait-false-library). Idle-CPU 504s on APIs: [thread pool starvation](/blog/csharp-threadpool-starvation-sync-over-async). CPU off the request path: [Channel worker](/blog/csharp-channel-producer-consumer). Topic map: [async & threading hub](/learning/async-concurrency).

## If an interviewer asks

Purpose of `await Task.Yield()`; Sleep vs Delay; async void on a button.

**Strong answer:** Yield posts back to the UI pump. Prefer `Task.Run` for CPU. Core APIs almost never need Yield.

. The fix is usually `Task.Run` plus progress marshalled back.

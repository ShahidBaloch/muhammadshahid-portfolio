---
title: "C# Task.Run vs await on ASP.NET Core"
description: "Task.Run queues CPU work on the ThreadPool; await yields the worker during I/O. On ASP.NET Core the request is already on the pool — wrapping ToListAsync makes 504s worse."
date: "2026-09-07"
updated: "2026-09-07"
category: "async-concurrency"
tags: ["C#", ".NET", "Asynchronous Programming", "Threading", "Concurrency", "ASP.NET Core", "Performance"]
related:
  - csharp-threadpool-starvation-sync-over-async
  - csharp-task-vs-thread
  - csharp-channel-producer-consumer
faq:
  - q: "Should I use Task.Run in ASP.NET Core?"
    a: "Almost never for I/O. Kestrel already runs the action on a ThreadPool thread. await ToListAsync or HttpClient gives that worker back during the wait. Task.Run around SQL schedules a second worker, then the first waits. Use Task.Run only for measured CPU work (hash, encode) and cap it so every request does not stampede the pool."
  - q: "What is the difference between Task.Run and await?"
    a: "await is a state machine: the worker is free while I/O is in flight, then a continuation runs. Task.Run queues CPU work onto the ThreadPool and occupies a worker until that CPU finishes. On an API, await is the default. Task.Run is an offload, not 'more async.'"
  - q: "Is Task.Run fire-and-forget safe after an HTTP request?"
    a: "No. After return Ok() the request CancellationToken is already canceled, exceptions are unobserved, and you compete with Kestrel for workers. Enqueue on a bounded Channel plus a BackgroundService, or a durable queue if process recycle cannot drop the message."
---

**`Task.Run` queues CPU work onto the ThreadPool.** `await` gives the current worker back during I/O. They are not the same. On ASP.NET Core the action **already runs on the pool**, so wrapping `ToListAsync` in `Task.Run` does not make the API “multithreaded.” It steals a second worker for the same SQL wait.

**New to this** → stay here. **Merging a PR** → [wrong vs right](#wrong-vs-right). **On-call / interview** → [when Task.Run is right](#when-task-run-is-the-right-tool) · [fire-and-forget](#fire-and-forget-is-not-task-run) · [if an interviewer asks](#if-an-interviewer-asks).

**Terms used here:** **I/O-bound** = SQL, HTTP, blobs, disk. **CPU-bound** = hash, image encode, tight parse. **Fire-and-forget** = starting work you do not await before `return Ok()`. **Kestrel** = the ASP.NET Core web server.

```text
await ToListAsync                     await Task.Run(() => ToListAsync())

  [this request's worker]               [this request's worker] waits
       yields during SQL                      │
       FREE for other HTTP                    └── [second pool worker] also waits on SQL
                                                 two workers, one query
```

Microsoft’s ASP.NET Core best-practices page: do not call `Task.Run` and immediately await it. Do not use `Task.Run` to make a synchronous API look asynchronous.

## Wrong vs right

I would reject a PR titled “make it multithreaded” that wraps EF in `Task.Run`.

```csharp
[HttpGet("{id:guid}")]
public async Task<ActionResult<OrderDto>> Get(Guid id, CancellationToken ct)
{
    // Wrong — already a pool thread; this only queues extra work
    var order = await Task.Run(() => _orders.GetByIdAsync(id, ct), ct);

    // Right — unwrap; one worker, yielded during SQL
    var order = await _orders.GetByIdAsync(id, ct);

    return order is null ? NotFound() : Ok(order);
}
```

The inner `GetByIdAsync` is I/O. `Task.Run` does not make SQL faster.

Do not wrap `.Result` either:

```csharp
public OrderDto GetById(Guid id) =>
    Task.Run(() => _orders.GetByIdAsync(id).Result).GetAwaiter().GetResult();
```

That is [starvation](/blog/csharp-threadpool-starvation-sync-over-async) with extra steps. Change the signature to async, or keep the leftover sync call **off** the request path.

## When Task.Run is the right tool

CPU that would freeze a UI thread, or a rare on-request hash you measured. Read the file with `await`; hash on the pool:

```csharp
[HttpPost("hash")]
public async Task<ActionResult<string>> HashAsync(IFormFile file, CancellationToken ct)
{
    await using var stream = file.OpenReadStream();
    var bytes = new byte[file.Length];
    await stream.ReadExactlyAsync(bytes, ct); // I/O — await, no Task.Run

    var hex = await Task.Run(() => Sha256Hex(bytes), ct); // CPU — offload
    return Ok(hex);
}
```

_Comparison: await versus Task.Run on ASP.NET Core._

| Work | Use |
|---|---|
| EF, `HttpClient`, blobs, disk I/O | `await` — no `Task.Run` |
| Measured CPU (hash, image encode) | `Task.Run` + a cap so Kestrel is not the thread source |
| Email / notify after checkout | [Channel](/blog/csharp-channel-producer-consumer) or a bus — not `Task.Run` per POST |
| Sync SDK you cannot change this sprint | Isolate off the request path; do not wrap `.Result` in `Task.Run` |

Unlimited `Task.Run` of CPU on every Kestrel request is still a stampede. Bound it, or move it to a worker.

## Fire-and-forget is not Task.Run

**Fire-and-forget** means you start work and do not wait for it before the HTTP response. After `return Ok()` the request `CancellationToken` is already canceled, exceptions are unobserved, and you compete with Kestrel for workers.

```csharp
_ = Task.Run(() => NotifyAsync(orderId)); // lost exceptions, dying token, stolen workers
```

`Task.Run(async () => await NotifyAsync())` does not fix it. You still queued pool work the request does not own. Use a bounded [Channel](/blog/csharp-channel-producer-consumer) and a `BackgroundService`, or a durable queue if recycle cannot drop the message.

## Task.Run vs await vs new Thread

_Comparison: Task.Run versus await versus new Thread._

| | What it does | On an API |
|---|---|---|
| `await ioAsync` | Yields the worker during I/O | Default |
| `await Task.Run(cpu)` | Occupies a **different** pool worker for CPU | Rare, measured |
| `new Thread` | Dedicated OS thread | Almost never per request |

`Task.Run` vs `new Thread` lives on [Task vs Thread](/blog/csharp-task-vs-thread). This page is the ASP.NET Core mistake: treating `Task.Run` as “more async.”

## Common mistakes

- `Task.Run(() => db.ToListAsync().Result)` to “unblock” a sync interface
- `await Task.Run(() => http.GetStringAsync(url))` because a blog said offload
- Fire-and-forget `Task.Run` for email after `return Ok()`
- Using `Task.Run` as a substitute for [WhenAll + a cap](/blog/csharp-task-whenall-vs-parallel-foreach)

## What this is not

Idle-CPU 504s: [thread pool starvation](/blog/csharp-threadpool-starvation-sync-over-async). Per-request notify: [Channel](/blog/csharp-channel-producer-consumer).

## If an interviewer asks

Task.Run vs await; why Task.Run on I/O starves Kestrel; when CPU offload is legal; why fire-and-forget is a Channel.

**Strong answer:** the request is already on the pool. Await I/O. Task.Run is CPU. Do not wrap `.Result`.

If a PR “made it multithreaded” and p95 got worse, [contact me](/contact). Bring the helper.

---
title: "C# Channel<T> Producer-Consumer vs BlockingCollection"
description: "Producer-consumer means one part of the app enqueues work and another processes it. Channel<T> waits without parking a thread; BlockingCollection.Take does. Bounded backpressure vs a durable bus."
date: "2026-09-07"
updated: "2026-09-07"
category: "async-concurrency"
tags: ["Asynchronous Programming", "Concurrency", "Threading", "C#", ".NET", "ASP.NET Core"]
related:
  - csharp-backgroundservice-hosted-service-async
  - csharp-task-run-aspnet-core
  - csharp-threadpool-starvation-sync-over-async
faq:
  - q: "Why is Channel<T> better than BlockingCollection for producer-consumer in C#?"
    a: "BlockingCollection.Take parks a ThreadPool worker until an item arrives. Channel.ReadAsync yields that worker and resumes as a continuation. Bounded channels also give FullMode backpressure without a dedicated OS thread."
  - q: "Is an in-process Channel durable?"
    a: "No. An App Service recycle empties the buffer. Compliance emails, claims, and payments belong on a durable queue or an outbox. Channels smooth in-process work (notify, thumbnail, cache warm)."
  - q: "What bounded Channel FullMode should I use?"
    a: "Wait when losing work is unacceptable and producers can slow down. DropOldest or DropNewest only with a metric you watch. Never CreateUnbounded for request-path publish — that is an unbounded memory leak."
---

**Producer-consumer** means one part of your app **adds** work items (producer) and another part **processes** them in the background (consumer). **`Channel<T>`** is an async in-process queue for that. **Backpressure** means when the queue is full, the producer slows down instead of memory growing forever.

```text
HTTP POST checkout
   → WriteAsync(OrderNotify)  →  [ bounded Channel buffer ]
                                   ReadAsync
                                      → BackgroundService SendEmail
```

**New to this** → stay here. **Merging a PR** → [wrong vs right](#wrong-vs-right). **On-call / interview** → [hosted service](#hosted-service-shape) · [if an interviewer asks](#if-an-interviewer-asks).

**Terms used here:** **Fire-and-forget** = `Task.Run` after `return Ok()` with nobody awaiting it. **Hosted service / `BackgroundService`** = a long-running process the generic host starts and stops. **`IServiceScopeFactory`** = create a DI scope per message so each gets its own `DbContext`. **Durable queue** = RabbitMQ / Service Bus — survives process recycle.

## Smallest example

```csharp
var channel = Channel.CreateBounded<int>(4);
await channel.Writer.WriteAsync(1, ct);
var item = await channel.Reader.ReadAsync(ct);
```

`WriteAsync` / `ReadAsync` yield the worker. `await foreach` on `ReadAllAsync` is the consumer loop.

## Wrong vs right

I would reject per-request `Task.Run` for notify. That is how a flash sale [starves the pool](/blog/csharp-threadpool-starvation-sync-over-async) while checkout still returns HTTP 200 (slowly).

```csharp
// Wrong — stolen workers, lost exceptions, dying request token
_ = Task.Run(() => NotifyAsync(orderId));

// Right — enqueue; a hosted worker owns the I/O
await notify.Writer.WriteAsync(new OrderNotify(order.Id), ct);
return Ok(order);
```

`BlockingCollection.Take` parks a worker until an item arrives — fine for a console app with dedicated threads, not for Kestrel.

```csharp
var bag = new BlockingCollection<OrderNotify>(boundedCapacity: 256);
var item = bag.Take(ct); // worker sits here
```

## Bounded vs unbounded

Unbounded channels grow until the process dies.

_Comparison: what a bounded Channel does when it is full._

| FullMode | When the channel is full |
|---|---|
| `Wait` | Writer awaits (backpressure). Default I want for notify-that-must-happen-in-process |
| `DropOldest` | Overwrite; **increment a counter you alert on** |
| `DropNewest` | Keep old work |
| `DropWrite` | Reject this write |

`Wait` on the **request path** means a slow consumer slows checkout. That is honest. If checkout cannot wait, you needed a durable queue, not silent `DropWrite`.

Drop modes without a metric are silent data loss. Count them:

```csharp
private static long _dropped;

public bool TryEnqueue(OrderNotify msg)
{
    if (_channel.Writer.TryWrite(msg))
        return true;

    Interlocked.Increment(ref _dropped); // alert if this climbs
    return false;
}
```

`DropOldest` still needs a counter on the wrap/overwrite path. **Process recycle is not durable** — an App Service restart empties the buffer. Claims, payments, and compliance email belong on an outbox or Service Bus.

`SingleReader` / `SingleWriter` enable faster paths. Lie about them and you race. One hosted service reader → `SingleReader = true`. Many publishers from HTTP → `SingleWriter = false`.

## Hosted service shape

A `BackgroundService` is a class the host runs for the life of the process. Register the channel as **singleton**, the worker as hosted service. Pass **ids** in the payload; resolve scoped services inside `CreateAsyncScope()` — do not capture a request `DbContext`.

```csharp
public sealed class OrderNotifyChannel
{
    private readonly Channel<OrderNotify> _channel = Channel.CreateBounded<OrderNotify>(
        new BoundedChannelOptions(256) { FullMode = BoundedChannelFullMode.Wait });

    public ChannelWriter<OrderNotify> Writer => _channel.Writer;
    public ChannelReader<OrderNotify> Reader => _channel.Reader;
}

public sealed class OrderNotifyWorker(
    OrderNotifyChannel channel,
    IServiceScopeFactory scopes,
    ILogger<OrderNotifyWorker> logger) : BackgroundService
{
    private long _poison;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var msg in channel.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var mail = scope.ServiceProvider.GetRequiredService<IOrderMailer>();
                await mail.SendAsync(msg, stoppingToken);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Notify failed for {OrderId}", msg.OrderId);
                Interlocked.Increment(ref _poison); // alert; do not crash the loop
            }
        }
    }
}
```

If the process dies after `Ok` and before send, the email is gone. For “we billed the card,” that is an **outbox**. Complete the writer on shutdown so `ReadAllAsync` ends: `Writer.Complete()` from `IHostApplicationLifetime`.

## Channel vs BlockingCollection vs bus

_Comparison: Channel versus BlockingCollection versus a durable message bus._

| Need | Tool |
|---|---|
| Async in-process, backpressure | `Channel<T>` |
| Dedicated sync worker threads | `BlockingCollection` still fine |
| Survive recycle, other services, retries | RabbitMQ / Service Bus / SQS |
| CPU pipeline stages | Channel chain, or TPL Dataflow if you already have it |

## Common mistakes

- `CreateUnbounded` “until we know the size”
- Consuming on the request with `ReadAsync` (you just blocked checkout on the worker)
- `Task.Run` per message **inside** the consumer
- Forgetting `Complete()` and hanging shutdown

## What this is not

The hosted worker itself: [BackgroundService](/blog/csharp-backgroundservice-hosted-service-async). Per-request `Task.Run`: [Task.Run vs await](/blog/csharp-task-run-aspnet-core). Fan-out cap: [WhenAll](/blog/csharp-task-whenall-vs-parallel-foreach). Topic map: [async & threading hub](/learning/async-concurrency).

## If an interviewer asks

Bounded worker queue inside a .NET process; fire-and-forget after checkout.

**Strong answer:** bounded channel + hosted service + “not durable.”

. Bring the notify method.

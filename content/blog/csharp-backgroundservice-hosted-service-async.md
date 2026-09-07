---
title: "C# BackgroundService in ASP.NET Core: Scopes and stoppingToken"
description: "A BackgroundService is a hosted worker the generic host starts and stops. Use stoppingToken, not RequestAborted. Create a DI scope per message. Task.Run after Ok() is not a worker."
date: "2026-09-07"
updated: "2026-09-07"
category: "async-concurrency"
tags: ["C#", ".NET", "Asynchronous Programming", "Threading", "Concurrency", "ASP.NET Core"]
related:
  - csharp-channel-producer-consumer
  - csharp-task-run-aspnet-core
  - csharp-cancellationtoken-aspnet-core
faq:
  - q: "What is a BackgroundService in ASP.NET Core?"
    a: "A long-running IHostedService the generic host starts with the process and stops on shutdown. ExecuteAsync is your loop. It is not an HTTP request and it is not Task.Run after return Ok()."
  - q: "Should a hosted service use HttpContext.RequestAborted?"
    a: "No. After the response, that token is already canceled. Use the stoppingToken ExecuteAsync receives — it fires when the host is shutting down. A Channel worker reads that token on ReadAllAsync."
  - q: "Why can't I inject DbContext into a BackgroundService?"
    a: "The worker is a singleton. DbContext is scoped. Inject IServiceScopeFactory, create a scope per message or per tick, resolve DbContext from that scope, and dispose it. Capturing the request context leaks tenants and throws ObjectDisposedException."
  - q: "Is Task.Run after Ok() a BackgroundService?"
    a: "No. Nobody owns the work, exceptions are unobserved, and you compete with Kestrel for pool threads. Enqueue on a bounded Channel plus a hosted worker, or a durable bus if an App Service recycle cannot drop the message."
---

A **`BackgroundService`** is a class the generic host **starts with the process** and **stops on shutdown**. `ExecuteAsync` is the loop. It is not an HTTP request. **`_ = NotifyAsync()` after `return Ok()` is not a worker** — nobody owns the exceptions, and `RequestAborted` is already canceled.

**New to this** → stay here. **Merging a PR** → [wrong vs right](#wrong-vs-right). **On-call / interview** → [stoppingToken](#stoppingtoken-vs-requestaborted) · [scope](#one-scope-per-message) · [if an interviewer asks](#if-an-interviewer-asks).

**Terms used here:** **`IHostedService`** = the interface; `BackgroundService` is the usual base class. **`stoppingToken`** = host shutdown flag passed into `ExecuteAsync`. **`IServiceScopeFactory`** = create a DI scope so each message gets its own `DbContext`. **Durable queue** = Service Bus / RabbitMQ — survives recycle. In-process buffer: [Channel](/blog/csharp-channel-producer-consumer).

```text
HTTP POST checkout
  await Writer.WriteAsync(orderId)     ← request path, then Ok()
           │
           ▼
  BackgroundService.ExecuteAsync
    stoppingToken (shutdown, not Angular)
    CreateAsyncScope() → DbContext → send
```

## Smallest example

```csharp
builder.Services.AddSingleton<OrderNotifyChannel>();
builder.Services.AddHostedService<OrderNotifyWorker>();
```

```csharp
public sealed class OrderNotifyWorker(
    OrderNotifyChannel channel,
    IServiceScopeFactory scopes,
    ILogger<OrderNotifyWorker> logger) : BackgroundService
{
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
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Notify failed for {OrderId}", msg.OrderId);
                // do not crash the loop — one poison message is not a process death
            }
        }
    }
}
```

Register the channel as **singleton**. The worker is a hosted service. Pass **ids** in the payload, not a request `DbContext`.

## Wrong vs right

I would reject `_ = Task.Run(() => NotifyAsync(orderId))` after checkout. That is [fire-and-forget](/blog/csharp-task-run-aspnet-core), not a hosted service.

```csharp
// Wrong — dying RequestAborted, lost exceptions, stolen Kestrel workers
[HttpPost]
public async Task<ActionResult<OrderDto>> Checkout(CheckoutRequest body, CancellationToken ct)
{
    var order = await _orders.PlaceAsync(body, ct);
    _ = Task.Run(() => _mail.SendAsync(order.Id, ct)); // ct dies with the response
    return Ok(order);
}

// Right — enqueue; the worker owns send and shutdown
await _notify.Writer.WriteAsync(new OrderNotify(order.Id), ct);
return Ok(order);
```

`AddHostedService` is how the host **sees** the work. `Task.Run` is how it **disappears**.

## stoppingToken vs RequestAborted

_Comparison: which token a worker may use._

| Token | Meaning | In a BackgroundService |
|---|---|---|
| `HttpContext.RequestAborted` | Angular left this request | **Never** — already canceled after `Ok()` |
| Action `CancellationToken` captured into `Task.Run` | Same as abort | **Never** |
| `ExecuteAsync(stoppingToken)` | Process is shutting down | **Yes** — pass it to `ReadAllAsync`, EF, HttpClient |
| `CancellationToken.None` | Ignore shutdown | Only if you accept work after SIGTERM |

A clinic checkout that passed `RequestAborted` into `Task.Run` “so email cancels if they leave” canceled the email on every success. The tab already navigated. Use `stoppingToken` for host lifetime. If the **business** must cancel a job, give that job its own `CancellationTokenSource` stored by id — not the HTTP token.

## One scope per message

The worker is a **singleton**. `DbContext` is **scoped**. Injecting `AppDbContext` into the worker is a [captive dependency](/blog/aspnet-core-dependency-injection): first tenant’s context lives for the process.

```csharp
// Wrong — singleton holds scoped DbContext
public sealed class NightlyReportWorker(AppDbContext db) : BackgroundService { }

// Right — new scope per tick or per message
await using var scope = scopes.CreateAsyncScope();
var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
await db.Orders.Where(o => o.Open).ExecuteUpdateAsync(..., stoppingToken);
```

Same rule for `IOrderMailer` if it takes `DbContext`. Resolve it **inside** the scope. Do not close over a request-scoped service from the controller.

## Shutdown

Honor `stoppingToken`. Complete the channel writer so `ReadAllAsync` ends:

```csharp
public sealed class ChannelShutdown(OrderNotifyChannel channel, IHostApplicationLifetime life)
    : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken)
    {
        life.ApplicationStopping.Register(() => channel.Writer.TryComplete());
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
```

If the process dies after `Ok` and before send, the email is gone. Cards, claims, and compliance mail need an **outbox** or a durable bus — not a bigger in-memory buffer.

## PeriodicTimer vs Delay

A nightly job should not `while (!stoppingToken.IsCancellationRequested) { await Task.Delay(TimeSpan.FromHours(24), stoppingToken); }` if ticks can overlap. Prefer `PeriodicTimer`:

```csharp
using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
while (await timer.WaitForNextTickAsync(stoppingToken))
{
    await using var scope = scopes.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<IFeeImport>().RunAsync(stoppingToken);
}
```

`Thread.Sleep` in a worker parks a pool thread for the whole interval. That is the same class of bug as [Sleep vs Delay](/blog/csharp-task-vs-thread#thread-sleep-vs-task-delay-wrong-vs-right).

## Common mistakes

- `Task.Run` after `Ok()` and calling it a “background job”
- Injecting `DbContext` or `IHttpContextAccessor` into the worker
- Passing `RequestAborted` into the loop
- Crashing `ExecuteAsync` on the first poison message
- Forgetting `Writer.Complete()` so shutdown hangs
- Treating a Channel as durable across App Service recycle

## What this is not

The in-process queue: [Channel](/blog/csharp-channel-producer-consumer). Per-request CPU offload: [Task.Run vs await](/blog/csharp-task-run-aspnet-core). Request tokens: [CancellationToken](/blog/csharp-cancellationtoken-aspnet-core). Captive DI: [lifetimes](/blog/aspnet-core-dependency-injection). Topic map: [async & threading hub](/learning/async-concurrency).

## If an interviewer asks

What a hosted service is; why `RequestAborted` is wrong after `Ok()`; how you get a `DbContext` in a singleton worker; Channel vs bus.

**Strong answer:** host-owned loop, `stoppingToken`, scope per message, not `Task.Run`.

If checkout “sends email” with `Task.Run` and nights drop notifies on recycle, [contact me](/contact). Bring the worker class.

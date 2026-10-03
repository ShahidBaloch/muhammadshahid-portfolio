---
title: "Azure Functions Service Bus Trigger for the .NET Isolated Worker"
description: "Azure Functions Service Bus trigger on the .NET isolated worker: bind the queue and settle each message with complete, abandon, or dead-letter."
date: "2026-10-03"
category: "architecture"
tags: ["Azure Functions", "Azure Service Bus", ".NET Isolated", "C#", "Messaging"]
related:
  - azure-functions-isolated-worker-dotnet-api
  - azure-service-bus-aspnet-core
  - transactional-outbox-ef-core
  - csharp-backgroundservice-hosted-service-async
faq:
  - q: "How do I trigger a .NET isolated Azure Function from Service Bus?"
    a: "Use Microsoft.Azure.Functions.Worker.Extensions.ServiceBus and a ServiceBusTrigger on a function that takes ServiceBusReceivedMessage. Set AutoCompleteMessages to false when you complete, abandon, or dead-letter the message yourself with ServiceBusMessageActions."
  - q: "Why does the function complete the message even when host.json says autoCompleteMessages false?"
    a: "On the isolated worker, an explicit AutoCompleteMessages value on the trigger attribute is what you should set. host.json alone has been the wrong lever on some extension versions. Put false on the attribute when you settle messages in code."
  - q: "When does an Azure Functions Service Bus trigger dead-letter a message?"
    a: "Dead-letter when your code calls DeadLetterMessageAsync for a poison body, or when Service Bus hits MaxDeliveryCount. Abandon puts the message back for another delivery. The host.json retry policy is not that counter."
---

**An Azure Functions Service Bus trigger on the .NET isolated worker** is a function the Functions host invokes when a message is available, using the worker process (`dotnet-isolated`) rather than the in-process model. Your code settles the message: complete, abandon, or dead-letter. Service Bus, not the function, decides when a poison message has been tried enough times.


```text
API / outbox
    -> queue "orders"
         -> Functions host (isolated)
              ServiceBusTrigger
              peek-lock
              your handler
              Complete / Abandon / Dead-letter
         -> DLQ when DeliveryCount exceeds the queue max
```

Metaphor: the trigger is a doorbell, not the locksmith. Peek-lock means you opened the door and are holding it; complete means you signed for the package. If you walk away without signing, the lock expires and the doorbell rings again, louder (`DeliveryCount`).

**New to this** stay here. **The isolated worker itself** (HTTP triggers, `Program.cs`, deployment) see [isolated worker Functions](/blog/azure-functions-isolated-worker-dotnet-api). **Publishing from ASP.NET Core** see [Service Bus in ASP.NET Core](/blog/azure-service-bus-aspnet-core). **Not losing the message when the database commits** see [transactional outbox](/blog/transactional-outbox-ef-core). **A processor inside the API host instead of Functions** see [BackgroundService](/blog/csharp-backgroundservice-hosted-service-async).

## How to wire an Azure Functions Service Bus trigger

Target the isolated worker (`Microsoft.NET.Sdk.Functions` style function app with `dotnet-isolated` in `local.settings.json` / `FUNCTIONS_WORKER_RUNTIME`). Package:

```bash
dotnet add package Microsoft.Azure.Functions.Worker.Extensions.ServiceBus
```

Use a current 5.x extension. Versions before 5.17 made `AutoCompleteMessages` hard to control from configuration. Set it on the attribute anyway so a host upgrade does not surprise you.

`Program.cs` can stay the default worker host. Register your handler as a normal service:

```csharp
var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .ConfigureServices(s => s.AddSingleton<OrderHandler>())
    .Build();

host.Run();
```

Do not reference the in-process package `Microsoft.Azure.WebJobs.Extensions.ServiceBus` in this app. Mixing the two models produces a function that builds and does not run.

## Function: settle the message yourself

> **Watch:** Auto-complete left on while you also call CompleteMessageAsync settles twice. Isolated worker code uses ServiceBusMessageActions, not in-process MessageReceiver samples.

```csharp
public sealed class OrderFunctions
{
    private readonly OrderHandler _handler;

    public OrderFunctions(OrderHandler handler) => _handler = handler;

    [Function(nameof(ProcessOrder))]
    public async Task ProcessOrder(
        [ServiceBusTrigger("orders", Connection = "ServiceBus", AutoCompleteMessages = false)]
        ServiceBusReceivedMessage message,
        ServiceBusMessageActions actions,
        CancellationToken ct)
    {
        OrderMessage? order;
        try
        {
            order = message.Body.ToObjectFromJson<OrderMessage>();
        }
        catch (JsonException)
        {
            await actions.DeadLetterMessageAsync(
                message,
                deadLetterReason: "BadJson",
                deadLetterErrorDescription: "Body was not OrderMessage",
                cancellationToken: ct);
            return;
        }

        if (order is null || order.OrderId == Guid.Empty)
        {
            await actions.DeadLetterMessageAsync(message, deadLetterReason: "InvalidPayload", cancellationToken: ct);
            return;
        }

        try
        {
            await _handler.HandleAsync(order, message.MessageId, ct);
            await actions.CompleteMessageAsync(message, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            await actions.AbandonMessageAsync(message, cancellationToken: ct);
            throw;
        }
    }
}
```

`AutoCompleteMessages = false` means a successful return does **not** complete the message for you. You must call `CompleteMessageAsync`. If you forget, the lock expires, the message reappears, and you process it again. That is better than losing it, and it is still a bug.

Abandon returns the message to the queue and increments delivery count. Dead-letter moves it to the dead-letter queue immediately. Use dead-letter for poison you will never parse. Use abandon (or a thrown exception with auto-complete on) for a transient database blip.

Throwing after abandon is optional. It marks the invocation failed in Application Insights, which you want. Do not also rely on the runtime to abandon again while auto-complete is false: if you already abandoned, a second settlement throws. One settlement per message.

JSON you cannot parse must not abandon forever. That is an infinite loop until `MaxDeliveryCount`. Dead-letter it on the first bad body.

## host.json

> **Watch:** A Functions retry policy and Service Bus delivery count stack. A lock shorter than the work, plus a non-idempotent email, sends the email twice.

```json
{
  "version": "2.0",
  "extensions": {
    "serviceBus": {
      "prefetchCount": 0,
      "autoCompleteMessages": false,
      "maxAutoLockRenewalDuration": "00:05:00",
      "maxConcurrentCalls": 8,
      "maxConcurrentSessions": 8
    }
  }
}
```

Keep `autoCompleteMessages` false here **and** on the attribute. The attribute is the one the isolated worker has actually honored when the two disagreed.

`prefetchCount: 0` avoids holding invisible messages on a function instance that then scales in and lets locks expire. Raise prefetch only after you have measured loss under scale-in.

`maxAutoLockRenewalDuration` must cover your worst honest handler. The queue lock duration (often 30 seconds to a minute, set on the queue, not in host.json) is renewed up to this cap. A handler that runs longer than the renewal cap will have the lock stolen and a second worker will run the same message. Make the handler idempotent anyway. Renewal is not a transaction.

`maxConcurrentCalls` is per instance. Eight slow SQL calls per instance times twenty instances is a lot of database sessions. Size it from the database, not from a demo.

## Sessions

When one order's messages must not run in parallel:

```csharp
[ServiceBusTrigger("orders", Connection = "ServiceBus", IsSessionsEnabled = true, AutoCompleteMessages = false)]
```

The queue (or subscription) must be created with sessions required. `SessionId` is set by the publisher, usually the order id or tenant id. Concurrency becomes `maxConcurrentSessions`. This post does not choose your topology; the [ASP.NET Core Service Bus guide](/blog/azure-service-bus-aspnet-core) covers queues versus topics versus sessions from the producer side. The trigger only mirrors that choice. A session-enabled trigger on a non-session queue fails at startup. Fix the queue or the attribute. Do not "try both".

## Connection and managed identity

> **Watch:** A connection string with Manage rights does not belong in a slot setting. Log MessageId and DeliveryCount, not the body.

`Connection = "ServiceBus"` reads settings named `ServiceBus`. For a connection string (local emulator or a dev namespace):

```json
{
  "ServiceBus": "Endpoint=sb://...;SharedAccessKeyName=...;SharedAccessKey=..."
}
```

Prefer managed identity in Azure. The setting name the extension looks for is the fully qualified namespace form:

```text
ServiceBus__fullyQualifiedNamespace = your-namespace.servicebus.windows.net
```

Grant the function app's managed identity **Azure Service Bus Data Receiver** on the queue (and Data Sender only if this function also sends). A connection string with `Manage` rights in production is how a stolen setting becomes a deleted queue. Locally, the Service Bus emulator or a dev namespace with a secret in `local.settings.json` (gitignored) is fine. Azurite does not speak Service Bus. Do not point this trigger at a storage emulator and call the failure mysterious.

`local.settings.json` values are not production configuration. App settings in Azure override them.

## Idempotency and the outbox

Service Bus is at-least-once. Complete can succeed and the function host can still crash before the log line. The next delivery runs your handler again. `HandleAsync` must tolerate that.

Store `message.MessageId` (or a business id inside the body) in a unique row before side effects. If the insert conflicts, complete the message and return. The [outbox](/blog/transactional-outbox-ef-core) is the publisher's tool so the API does not commit an order without a message. The consumer still needs its own idempotency. Outbox does not deduplicate deliveries.

Do not hold a SQL transaction open across `CompleteMessageAsync`. Commit your work, then complete. If complete fails, the retry hits your idempotency key. If you complete first and then the database fails, you have acknowledged a message you did not apply. That is the worse order.

## Dead-letter operations

`MaxDeliveryCount` on the queue is the backstop for abandons. Inspect the dead-letter sub-queue (`orders/$DeadLetterQueue`) when a function "loses" messages. They are often there with `BadJson` or `MaxDeliveryCountExceeded`.

A replay tool should send a **new** message or resubmit carefully. Fix the handler before you replay a thousand poison bodies. Replay is an operational act, not a catch block.

## Delivery count is not the Functions retry policy

Service Bus counts a delivery every time a lock is released without a complete: abandon, lock expiry, or a handler that crashed before settlement. The queue's MaxDeliveryCount is the number that moves the message to the dead-letter sub-queue. The Functions host can also retry an invocation based on its own retry settings. Those are two clocks.

If both are aggressive, one poison payload burns the delivery count and the host retries, and you look at a dead-letter reason that does not match the exception you logged. Pick one owner for transient failure. For this trigger, prefer Service Bus redelivery: abandon (or let the lock expire) on a transient error, set MaxDeliveryCount on the queue to the number of attempts you mean, and do not also enable a long host retry that re-enters the function while the same lock is held.

A host retry that runs before you settle can call the handler twice under one delivery. Idempotency still saves you. It does not make the metrics honest. Log DeliveryCount from the message, not a local attempt counter, when you decide whether this attempt should dead-letter.

## Pitfalls

- **Auto-complete left true while you also call `CompleteMessageAsync`.** The second complete throws `MessageLockLost` or a settlement conflict and you treat success as failure.
- **In-process attribute samples** (`[ServiceBusTrigger]` plus `MessageReceiver` from an old article) pasted into an isolated worker. Use `ServiceBusMessageActions`.
- **Lock shorter than the work**, and a handler that emails the customer non-idempotently. They get two emails.
- **Prefetch plus scale-in** dropping locked messages back, inflating delivery count, dead-lettering good work.
- **Connection string in app settings with root manage claims**, copied into a slot that is public in a screenshot.
- **Assuming Functions retries replace Service Bus delivery count.** host.json retry policies and Service Bus redelivery stack. Know which one moved the message or you will retry squared.
- **Logging the body** when the body has patient or payment data. Log `MessageId` and `DeliveryCount`.

## Verification

Local, with a dev namespace or the Service Bus emulator:

1. Start the function. Confirm the log says the trigger is listening on `orders`. A wrong connection fails here, not on the first message.
2. Send one JSON message from Service Bus Explorer or a tiny publisher. The function completes. The active queue count returns to zero. The message is not in the dead-letter queue.
3. Send `{` as the body. Exactly one dead-letter with reason `BadJson`. Delivery count does not climb to the maximum.
4. Make `HandleAsync` throw once. The message is abandoned and redelivered. The second attempt succeeds and completes. Your idempotency row exists once.
5. With sessions on, send two messages with the same `SessionId`. They do not overlap. Two `SessionId`s can.

Azure: the function app identity can receive. Turn off the shared access key in a staging namespace and confirm the function still peeks. Application Insights shows failed invocations when you throw, and the dead-letter count is the business metric you alert on, not CPU.

If you also run the ASP.NET Core publisher, a test that writes via the outbox and waits for the function's idempotency row is the contract test. This page does not replace that publisher test.

## What this page does not cover

HTTP-triggered functions, deployment slots, and the isolated hosting model are the worker post. Topics, subscriptions, and `ServiceBusClient` inside a web app are the ASP.NET Core Service Bus post. Use a `BackgroundService` processor instead of Functions when the consumer must live in the same process as the API and you do not want a second billable host. That tradeoff is the background-service article, not a second trigger sample.

**Related:** [Isolated worker Functions](/blog/azure-functions-isolated-worker-dotnet-api) | [Service Bus in ASP.NET Core](/blog/azure-service-bus-aspnet-core) | [Transactional outbox](/blog/transactional-outbox-ef-core) | [BackgroundService](/blog/csharp-backgroundservice-hosted-service-async)


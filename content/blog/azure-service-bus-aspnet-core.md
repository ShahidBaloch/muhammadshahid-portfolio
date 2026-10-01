---
title: "Azure Service Bus with ASP.NET Core: Queues, Topics, and Sessions"
description: "Use Azure Service Bus from ASP.NET Core — ServiceBusClient, processors in BackgroundService, queues vs topics vs sessions, JSON pitfalls, peek-lock, and where the transactional outbox fits. Not an outbox theory rewrite."
date: "2026-10-01"
category: "azure"
tags: ["Azure Service Bus", "ASP.NET Core", "Messaging", "C#", "BackgroundService"]
related:
  - transactional-outbox-ef-core
  - csharp-backgroundservice-hosted-service-async
  - csharp-channel-producer-consumer
faq:
  - q: "How do I use Azure Service Bus with ASP.NET Core?"
    a: "Register a Singleton ServiceBusClient, publish from application services, and consume with ServiceBusProcessor inside a BackgroundService (or Functions). Choose queues for single workers, topics for fan-out, and sessions when you need ordered per-key processing."
  - q: "Should messaging replace the transactional outbox?"
    a: "No. Outbox solves 'DB commit and message publish atomically.' Service Bus is the transport. Use both: outbox writer + dispatcher that sends to ASB."
  - q: "When do I need Service Bus sessions?"
    a: "When messages for the same SessionId must process in order (one clinic’s claim batch, one patient’s workflow steps). Without sessions, competing consumers can reorder."
---

**Azure Service Bus with ASP.NET Core** means publishing and processing messages with `ServiceBusClient` in a web host or worker — queues for competing consumers, topics for pub/sub, sessions for ordered per-tenant work — without confusing the broker with the [transactional outbox](/blog/transactional-outbox-ef-core).

```text
ASP.NET Core API
   │  (domain save + outbox row)
   ▼
Dispatcher ──publish──► Service Bus queue/topic
                              │
                              ▼
                    Processor BackgroundService
                              │
                              ▼
                         Handlers / DB
```

**New to this** → stay here. **Atomic publish with EF** → [transactional outbox](/blog/transactional-outbox-ef-core). **Hosted service patterns** → [BackgroundService](/blog/csharp-backgroundservice-hosted-service-async).

Search intent for **azure service bus asp.net core** is how-to clients/processors/sessions — not SKU marketing and not outbox theory alone.

## Queues vs topics vs sessions for ASP.NET Core domains

| Pattern | Use when | Example |
|---|---|---|
| **Queue** | One logical worker pool; each message handled once | `claims-export` jobs |
| **Topic + subscriptions** | Multiple independent consumers need the same event | `encounter-closed` → billing + analytics + notify |
| **Sessions** | Ordered processing per key | All messages for `clinic:{id}` in order |

Default for “send work to a background worker” is a **queue**. Reach for topics when a second team needs the same event without coupling. Add **sessions** when order matters per business key.

## ServiceBusClient and processor hosted services

Register the client as singleton (it is thread-safe and heavy):

```csharp
builder.Services.AddSingleton(sp =>
{
    var cfg = sp.GetRequiredService<IConfiguration>();
    // Prefer Managed Identity in Azure; connection string for local only
    var cred = new DefaultAzureCredential();
    var fqns = cfg["ServiceBus:FullyQualifiedNamespace"]!;
    return new ServiceBusClient(fqns, cred);
});

builder.Services.AddHostedService<ClaimExportProcessor>();
builder.Services.AddSingleton<IMessagePublisher, ServiceBusMessagePublisher>();
```

Publisher:

```csharp
public sealed class ServiceBusMessagePublisher : IMessagePublisher
{
    private readonly ServiceBusClient _client;
    private readonly ILogger<ServiceBusMessagePublisher> _logger;

    public ServiceBusMessagePublisher(ServiceBusClient client, ILogger<ServiceBusMessagePublisher> logger)
    {
        _client = client;
        _logger = logger;
    }

    public async Task PublishAsync<T>(string queueOrTopic, T payload, CancellationToken ct)
    {
        await using var sender = _client.CreateSender(queueOrTopic);
        var body = BinaryData.FromObjectAsJson(payload, JsonOptions.Default);
        var msg = new ServiceBusMessage(body)
        {
            ContentType = "application/json",
            MessageId = Guid.NewGuid().ToString("N"),
            Subject = typeof(T).Name,
        };
        await sender.SendMessageAsync(msg, ct);
        _logger.LogInformation("Published {Type} to {Destination}", typeof(T).Name, queueOrTopic);
    }
}
```

Processor hosted service:

```csharp
public sealed class ClaimExportProcessor : BackgroundService
{
    private readonly ServiceBusClient _client;
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<ClaimExportProcessor> _logger;
    private ServiceBusProcessor? _processor;

    public ClaimExportProcessor(
        ServiceBusClient client,
        IServiceScopeFactory scopes,
        ILogger<ClaimExportProcessor> logger)
    {
        _client = client;
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _processor = _client.CreateProcessor("claims-export", new ServiceBusProcessorOptions
        {
            AutoCompleteMessages = false,
            MaxConcurrentCalls = 4,
            PrefetchCount = 8,
        });

        _processor.ProcessMessageAsync += OnMessageAsync;
        _processor.ProcessErrorAsync += OnErrorAsync;

        await _processor.StartProcessingAsync(stoppingToken);

        try
        {
            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
        catch (OperationCanceledException) { }
    }

    private async Task OnMessageAsync(ProcessMessageEventArgs args)
    {
        await using var scope = _scopes.CreateAsyncScope();
        var handler = scope.ServiceProvider.GetRequiredService<IClaimExportHandler>();

        try
        {
            var dto = args.Message.Body.ToObjectFromJson<ClaimExportMessage>(JsonOptions.Default)
                ?? throw new InvalidOperationException("Empty body");

            await handler.HandleAsync(dto, args.CancellationToken);
            await args.CompleteMessageAsync(args.Message, args.CancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed message {MessageId}", args.Message.MessageId);
            // Abandon for transient; dead-letter for poison after inspection
            await args.AbandonMessageAsync(args.Message, cancellationToken: args.CancellationToken);
        }
    }

    private Task OnErrorAsync(ProcessErrorEventArgs args)
    {
        _logger.LogError(args.Exception, "Processor error source {Source}", args.ErrorSource);
        return Task.CompletedTask;
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        if (_processor is not null)
        {
            await _processor.StopProcessingAsync(cancellationToken);
            await _processor.DisposeAsync();
        }
        await base.StopAsync(cancellationToken);
    }
}
```

**DI scopes:** create a scope per message. Do not inject scoped DbContext into the hosted service fields. Same rule as Functions. See [BackgroundService](/blog/csharp-backgroundservice-hosted-service-async).

## JSON serialization with System.Text.Json pitfalls

Agree options between publisher and processor:

```csharp
public static class JsonOptions
{
    public static readonly JsonSerializerOptions Default = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}
```

Pitfalls:

- **DateTime Kind** mismatches across services  
- **Polymorphic payloads** without discriminators  
- **Encoding:** prefer `BinaryData.FromObjectAsJson` / `ToObjectFromJson` with the same options  
- **Huge bodies:** Service Bus has size limits (SKU-dependent); put blobs in storage and send pointers for large clinical attachments  

## Peek-lock, abandon, complete, and MaxDeliveryCount

With `AutoCompleteMessages = false`:

1. Message is locked while you process  
2. **Complete** → remove from queue  
3. **Abandon** → unlock for retry  
4. **DeadLetter** → send to DLQ with reason  

When delivery count hits `MaxDeliveryCount`, Service Bus dead-letters automatically. Monitor DLQ — do not only log and abandon forever.

Transient SQL timeouts → abandon. Invalid JSON forever → dead-letter immediately.

## Sessions for ordered tenant/clinic work

```csharp
var processor = _client.CreateProcessor("clinic-jobs", new ServiceBusProcessorOptions
{
    AutoCompleteMessages = false,
    MaxConcurrentCalls = 8, // concurrent sessions
    ReceiveMode = ServiceBusReceiveMode.PeekLock,
});
// For sessions use CreateSessionProcessor:
var sessionProcessor = _client.CreateSessionProcessor("clinic-jobs", new ServiceBusSessionProcessorOptions
{
    AutoCompleteMessages = false,
    MaxConcurrentSessions = 8,
    MaxConcurrentCallsPerSession = 1, // ordered within session
});
```

Publish with session id:

```csharp
var msg = new ServiceBusMessage(body) { SessionId = $"clinic:{clinicId}" };
```

Use sessions when reorder would corrupt state (ledger-like steps). Do not enable sessions “just in case” — they constrain throughput and require session-aware APIs.

## Where transactional outbox fits (link, do not rewrite)

If you `SaveChanges` then `SendMessage` separately, a crash between them loses or doubles side effects.

Pattern:

1. API writes domain rows + outbox row in one EF transaction  
2. Background dispatcher reads outbox and publishes to Service Bus  
3. Mark outbox dispatched  

Full design: [transactional outbox EF Core](/blog/transactional-outbox-ef-core). Service Bus does not replace that reliability layer.

Idempotent handlers still matter when at-least-once delivery redelivers ([idempotency keys](/blog/idempotency-key-aspnet-core) for HTTP; handler-side dedupe by `MessageId` for bus).

## Local/dev credentials and Managed Identity pointer

- Local: connection string in user secrets / `dotnet user-secrets`  
- Azure: fully qualified namespace + `DefaultAzureCredential` / Managed Identity with Azure RBAC data roles on the namespace  

Never commit connection strings. Rotate keys if you must use SAS for partners.

For high-volume in-process fan-in before the bus, some teams buffer with channels ([Channel producer/consumer](/blog/csharp-channel-producer-consumer)) then batch publish — optional optimization, not required to start.

## Standard vs Premium (honest notes, no fake CPC)

- **Standard:** familiar queues/topics; shared offerings; fine for many SaaS apps  
- **Premium:** dedicated resources, larger messages, geo features, stricter latency isolation  

Choose based on message size, throughput isolation, and compliance needs — measure your payload sizes and peak send rates. Do not pick Premium because a blog said “enterprise.”

## Operational checklist

1. Singleton `ServiceBusClient`; dispose on shutdown  
2. Processor as `BackgroundService` with graceful stop  
3. Scope-per-message for EF handlers  
4. Shared JSON options  
5. Peek-lock + explicit complete/dead-letter  
6. DLQ alarms  
7. Outbox for DB-coupled publishes  
8. SessionId only when order required  
9. Managed Identity in Azure  
10. Idempotent consumers (`MessageId` / business key)  

## Common mistakes I still see

1. **Scoped DbContext on the hosted service** — intermittent EF errors  
2. **AutoComplete true** while still trying to dead-letter manually — confusing outcomes  
3. **Publishing inside the web request without outbox** — lost messages on crash  
4. **Topic with one subscription forever** — should have been a queue  
5. **Logging full PHI payloads** from message bodies  

## Verification

- Send one message from API; processor completes; side effect visible once  
- Kill processor mid-handler; message redelivers; handler idempotent  
- Poison JSON ends in DLQ with reason  
- Session messages for same clinic never process in parallel (`MaxConcurrentCallsPerSession = 1`)  
- Metrics: active messages, DLQ length, processor errors  

## If an interviewer asks

Queues vs topics vs sessions in ASP.NET Core?

**Strong answer:** Queue for competing consumers; topic for fan-out; sessions for ordered per-key work. Use singleton client, BackgroundService processor, scope-per-message, and transactional outbox when publishing must follow EF commits.

**Related:** [Transactional outbox](/blog/transactional-outbox-ef-core) · [BackgroundService](/blog/csharp-backgroundservice-hosted-service-async) · [Channels](/blog/csharp-channel-producer-consumer) · [Idempotency](/blog/idempotency-key-aspnet-core)


## End-to-end example: claim export job

**API action** enqueues work after saving:

```csharp
[Authorize(Policy = "BillingOps")]
[HttpPost("{claimId:guid}/export")]
public async Task<IActionResult> Export(Guid claimId, CancellationToken ct)
{
    await _claims.MarkExportRequestedAsync(claimId, ct);
    // Prefer outbox; direct publish only for demos
    await _publisher.PublishAsync("claims-export", new ClaimExportMessage(claimId), ct);
    return Accepted();
}
```

**Handler** in the processor scope:

```csharp
public sealed class ClaimExportHandler : IClaimExportHandler
{
    private readonly AppDbContext _db;
    private readonly IBlobExportWriter _blobs;

    public async Task HandleAsync(ClaimExportMessage msg, CancellationToken ct)
    {
        var claim = await _db.Claims.SingleOrDefaultAsync(c => c.Id == msg.ClaimId, ct)
            ?? throw new InvalidOperationException("Claim missing"); // dead-letter after retries

        if (claim.ExportStatus == ExportStatus.Completed)
            return; // idempotent

        var bytes = await BuildFileAsync(claim, ct);
        await _blobs.WriteAsync(claim.Id, bytes, ct);
        claim.ExportStatus = ExportStatus.Completed;
        await _db.SaveChangesAsync(ct);
    }
}
```

## Duplicate detection and MessageId

Set `MessageId` to a business-stable value when the publisher may retry:

```csharp
MessageId = $"claim-export:{claimId}"
```

Enable duplicate detection on the queue (requires configuring the entity with a history window). Still write idempotent handlers — duplicate detection is best-effort relative to your window.

## Correlation across API → bus → processor

Copy `Activity.Current?.Id` or your correlation id into `ApplicationProperties`:

```csharp
msg.ApplicationProperties["correlationId"] = correlationId;
```

In the processor, restore logging scopes so support can join Angular’s error report to the export job. Pair with [correlation IDs](/blog/aspnet-core-correlation-id) and OpenTelemetry if you export bus spans.

## Topic filter sketches

```csharp
// Subscription Billing only receives subject EncounterClosed
// Create rules in IaC (Bicep/Terraform), not ad-hoc in prod portals without review
```

Keep filter syntax in infrastructure-as-code. Document event contracts like API DTOs — version `Subject` or schema property when payloads change.

## Multi-instance App Service processors

Horizontal scale means multiple processor instances compete on a queue (desired) or duplicate topic subscription work if you misconfigure (one subscription per consumer group/team). For sessions, Service Bus ensures a session is locked to one receiver at a time.

Test with two API instances locally to ensure no sticky assumptions.

## Unit/integration testing strategies

- **Publisher:** assert `ServiceBusSender` mock received JSON with expected MessageId  
- **Handler:** test idempotency with WebApplicationFactory-level DB ([WAF](/blog/aspnet-core-webapplicationfactory)) without the real bus  
- **Smoke:** emulator or dedicated dev namespace for one end-to-end message  

Do not require the real bus for every PR if CI is flaky; keep a scheduled integration job.

## Go-live runbook additions

1. Dashboards: queue depth, DLQ depth, server errors  
2. Alert when DLQ > 0 for 15 minutes  
3. Document who drains DLQ and how to replay  
4. Capacity: MaxConcurrentCalls tuned under load (start low)  
5. Firewall/VNet rules if using Premium private endpoints  

## Practitioner closing

On healthcare SaaS systems I treat Service Bus as the async rim around a modular monolith API: exports, notifications, and payer callbacks. The Angular app stays synchronous for user-facing CRUD; the bus absorbs slow work. When teams skip outbox and scopes, they get phantom exports and EF concurrency exceptions that look like “Service Bus is unreliable.” Fix the app patterns first.


## Scheduling and deferred messages

Service Bus supports scheduled enqueue times for “send this claim at 2am”:

```csharp
msg.ScheduledEnqueueTime = DateTimeOffset.UtcNow.AddHours(6);
```

Still keep business calendars in your domain — do not invent a second scheduler platform unless needed. Timer Functions + queues is another valid shape ([isolated worker](/blog/azure-functions-isolated-worker-dotnet-api)).

## Poison message playbook

1. Alert on DLQ depth  
2. Inspect body + dead letter reason  
3. Fix handler or publisher  
4. Replay with a tool/script that resubmits cleaned messages  
5. Document whether replay is safe (idempotency)  

Without idempotent handlers, replay doubles billing exports.

## Naming conventions

```text
sb-clinic-prod
  queue: claims-export
  topic: encounter-events
    sub: billing
    sub: notifications
```

Include environment in namespace or resource group, not only in queue names, so prod tools cannot point at dev by accident.


## Forwarding user identity safely

When a message causes work “on behalf of” a user, put a stable subject id / tenant id in application properties — not access tokens. The processor uses a managed identity to talk to Azure resources and applies domain authorization using those ids.

## Batching sends

```csharp
var batch = await sender.CreateMessageBatchAsync(ct);
foreach (var item in items)
{
    var msg = new ServiceBusMessage(BinaryData.FromObjectAsJson(item, JsonOptions.Default));
    if (!batch.TryAddMessage(msg))
    {
        await sender.SendMessagesAsync(batch, ct);
        batch = await sender.CreateMessageBatchAsync(ct);
        if (!batch.TryAddMessage(msg)) throw new InvalidOperationException("Message too large");
    }
}
await sender.SendMessagesAsync(batch, ct);
```

Useful for fan-out jobs; still consider outbox for DB-coupled publishes.

## Compact operational metrics

Track: send failures, processor exceptions, average settle time, DLQ count. Alert on DLQ and on processor restart loops.

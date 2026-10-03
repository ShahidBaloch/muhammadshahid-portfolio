---
title: "Apache Kafka with .NET: When ASP.NET Core Teams Should Adopt It"
description: "Kafka on .NET for ASP.NET Core: adopt it for replay and many consumers, commit the outbox with the row, and commit offsets after the write. Not from the controller."
date: "2026-10-03"
category: "architecture"
tags: ["Kafka", "ASP.NET Core", ".NET", "Azure Service Bus", "C#"]
faq:
  - q: "When should an ASP.NET Core team adopt Kafka?"
    a: "Adopt Kafka when several consumers must read the same history, you need replay to rebuild a read model, or throughput and retention are the product. Do not adopt it to replace one Azure Service Bus queue or an in-process channel."
  - q: "Does Kafka remove the need for a transactional outbox?"
    a: "No. A SQL commit and a Kafka produce are still two systems. If the business fact must exist only when the database row exists, write an outbox row in the same transaction and publish from a worker. Kafka does not enlist in your EF Core transaction."
  - q: "How does this differ from the Azure Service Bus post?"
    a: "That post is how to use queues, topics, and sessions on Service Bus. This page is the adopt-or-not decision for Kafka, including when Service Bus or an outbox is the smaller system."
---

**Kafka on .NET, from ASP.NET Core,** is a durable, partitioned log that many independent consumers can read at their own pace. It is not a request/response bus, and it is not automatically simpler than Azure Service Bus because a slide said "event driven."

![One SQL transaction writes the order and the outbox; the worker produces; the consumer commits the Kafka offset only after ApplyAsync](/images/blog/kafka-dotnet-aspnet-core.png)

**New to this** - stay here for the decision. **Outbox mechanics** - [transactional outbox](/blog/transactional-outbox-ef-core). **Service Bus client patterns** - [Azure Service Bus](/blog/azure-service-bus-aspnet-core). **In-process workers** - [background reports](/blog/background-report-signalr-aspnet-core).

## When should an ASP.NET Core team adopt Kafka?

Search intent for **kafka .net asp.net core** on a team that already ships ASP.NET Core is "should we run this, and what does the first honest integration look like?" They are comparing Kafka to the queue they already understand. They do not need ZooKeeper history or a stream-processing certification.

This page gives the decision, the producer/consumer shape that does not lose messages you thought were committed, and the operational bill. It is a comparison with a narrow how-to, not a platform manual.

## When is this decision in front of you?

You are deciding a backbone for domain events or telemetry-like facts inside a .NET estate. Hosting might be AKS, a managed Kafka (Confluent Cloud, Azure Event Hubs for Kafka, Amazon MSK), or a broker you will actually patch. The API is ASP.NET Core. The workers can be `BackgroundService` hosts or separate processes.

If the entire system is one API and one worker on Azure, and the only need is "run this job once," stop. Use a queue or a channel. Kafka's value starts at multiple consumers, retention, and replay.

## Which broker matches which need?

| Need | Prefer |
|---|---|
| One consumer, competing workers, dead-letter, Azure ops | Azure Service Bus queue |
| Fan-out of a fact to a handful of subscribers, still Azure-native | Service Bus topic |
| Same fact read by many services, rebuild a projection from history | Kafka (or Event Hubs with the Kafka API) |
| Strict per-key ordering (one aggregate's events in order) | Kafka partition key, or Service Bus sessions |
| Request/response from Angular | HTTP, not a topic |
| Dual-write between SQL and a broker | Transactional outbox, whichever broker you pick |
| Team has no one to own disks, ACLs, lag, and schema | Managed bus you already pay for |

"Event driven" is not a criterion. Both Service Bus and Kafka move events. The split is the log: Kafka retains an ordered history and lets a new consumer start at the beginning. A queue deletes the message once a consumer completes. You can bolt retention onto a queue with extra topics and stores. You will rebuild a worse log.

## When is Kafka the wrong adoption?

> **Watch:** A single queue with delay and dead-letter is Service Bus shaped. Producing from the controller is not event driven, because Kafka does not enlist in the EF transaction.

Skip Kafka when:

- You want a background PDF. That is a job, not a stream.
- You have one downstream and a dead-letter story you already operate on Service Bus.
- Your events are commands ("Send this email now") that must be owned by one worker. Queues match competing consumers. Kafka consumer groups also compete, but the operational model is heavier than the requirement.
- You cannot explain who rotates certificates, who gets paged on consumer lag, and what the retention disk costs. A broker nobody owns becomes a silent outage.
- The payload is a file. Put the file in blob storage and put a small pointer on the topic.

Also skip "Kafka for the public API" so Angular produces records. Browsers do not speak the Kafka protocol safely, and you would be exposing a cluster as an API. The ASP.NET Core app produces; the browser calls HTTP.

## What do you still owe if you adopt Kafka?

**Ordering.** Order is per partition, not per topic. Key by a stable business id (`tenantId:orderId`), not by a random GUID per event, or two events for one order land on different partitions and the consumer sees them out of order.

**Delivery.** `Acks.All` and idempotent produce avoid the "leader said yes and then died" class of loss. Consumers should process, write their own store, then commit offsets. Committing before the database insert is how you skip a billing event forever. Auto-commit on an interval commits messages you have only read into memory.

**Duplicates.** At-least-once is the normal contract. Make the consumer idempotent (processed-event table, or a natural unique key). Do not pick Kafka because a blog promised exactly-once end to end. Exactly-once between the broker and your SQL database is a design, not a flag.

**The outbox.** `ProduceAsync` inside the HTTP request after `SaveChanges` still loses the message if the process dies in between, and it writes a ghost message if produce succeeds and the request later rolls back. Keep the outbox. The worker is the producer.

**Schemas.** A JSON string with no contract becomes a private folk API. Use a schema (JSON Schema or Avro/Protobuf with a registry) and version it. A field rename is a production incident when three consumers compile against hope.

**Secrets.** Bootstrap servers, API keys, and SASL passwords come from configuration or a secret store. Do not commit `sasl.password`.

## How do you produce without losing the SQL commit?

> **Watch:** Write the outbox row in the same database transaction as the business row. A random partition key is why one aggregate looks reordered.

The HTTP request does not call Kafka. The outbox worker does. Sketch of the produce side only:

```csharp
public sealed class OutboxMessage
{
    public long Id { get; set; }
    public string Topic { get; set; } = "";
    public string PartitionKey { get; set; } = "";
    public string Payload { get; set; } = "";
    public DateTimeOffset? SentAt { get; set; }
    public long? Offset { get; set; }
}

public static async Task SaveOrderAndOutboxAsync(
    ClinicDbContext db,
    Order order,
    CancellationToken ct)
{
    db.Orders.Add(order);
    db.Outbox.Add(new OutboxMessage
    {
        Topic = "orders.events",
        PartitionKey = $"{order.TenantId:N}:{order.Id:N}",
        Payload = JsonSerializer.Serialize(new { order.Id, order.TenantId, Type = "OrderPlaced" })
    });
    await db.SaveChangesAsync(ct);
}

public sealed class KafkaOutboxPublisher : BackgroundService
{
    private readonly IProducer<string, string> _producer;
    private readonly IServiceScopeFactory _scopes;

    public KafkaOutboxPublisher(IConfiguration config, IServiceScopeFactory scopes)
    {
        _scopes = scopes;
        _producer = new ProducerBuilder<string, string>(new ProducerConfig
        {
            BootstrapServers = config["Kafka:BootstrapServers"],
            Acks = Acks.All,
            EnableIdempotence = true,
            ClientId = "clinic-outbox"
        }).Build();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            using var scope = _scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ClinicDbContext>();
            var batch = await db.Outbox.Where(x => x.SentAt == null)
                .OrderBy(x => x.Id)
                .Take(50)
                .ToListAsync(stoppingToken);

            foreach (var row in batch)
            {
                var result = await _producer.ProduceAsync(
                    row.Topic,
                    new Message<string, string>
                    {
                        Key = row.PartitionKey, // tenantId:aggregateId
                        Value = row.Payload
                    },
                    stoppingToken);

                row.SentAt = DateTimeOffset.UtcNow;
                row.Offset = result.Offset.Value;
            }

            if (batch.Count > 0)
                await db.SaveChangesAsync(stoppingToken);
            else
                await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
        }
    }

    public override void Dispose()
    {
        _producer.Flush(TimeSpan.FromSeconds(10));
        _producer.Dispose();
        base.Dispose();
    }
}
```

Mark sent only after `ProduceAsync` returns a result you accept. Flush on shutdown so the last batch is not stuck in the client buffer. This worker can double-send if it crashes after produce and before `SaveChanges`. Consumers must tolerate that. That is the outbox contract, not a Kafka bug.

## How do you consume without committing early?

> **Watch:** EnableAutoCommit true before the database write commits an offset for work you may never finish.

```csharp
protected override async Task ExecuteAsync(CancellationToken stoppingToken)
{
    using var consumer = new ConsumerBuilder<string, string>(new ConsumerConfig
    {
        BootstrapServers = _config["Kafka:BootstrapServers"],
        GroupId = "billing-projector",
        EnableAutoCommit = false,
        AutoOffsetReset = AutoOffsetReset.Earliest
    }).Build();

    consumer.Subscribe("orders.events");

    while (!stoppingToken.IsCancellationRequested)
    {
        var cr = consumer.Consume(stoppingToken);
        using var scope = _scopes.CreateScope();
        var billing = scope.ServiceProvider.GetRequiredService<IBillingProjector>();
        await billing.ApplyAsync(cr.Message.Key, cr.Message.Value, stoppingToken);
        consumer.Commit(cr);
    }
}
```

`GroupId` is the competing-consumer boundary. A second process with the same group splits partitions. A new feature that must see every event uses a new group, not a second copy of `billing-projector`.

Run consumers in a worker process. Do not `Consume` inside an HTTP request. Do not block the ASP.NET Core thread pool on `Consume` with a long timeout on a request thread.

## Which operations do you inherit?

Lag is the primary symptom. A consumer that is up but stuck on a poison message looks healthy in `kubectl get pods` and wrong in the business. You need a lag alert per group, a quarantine path (skip to a dead-letter topic after you have stored the failure), and a retention setting that matches how far back you are willing to replay. Infinite retention is a disk bill. Seven days is a guess until you know how long a rebuild takes.

ACLs should stop the API's producer identity from reading every topic, and stop a consumer from producing to the orders log. One shared connection string for the whole cluster is how a bug in search indexing rewrites billing.

Event Hubs with the Kafka endpoint is a reasonable compromise on Azure: Kafka clients, different limits, no cluster to patch. Read the limits (throughput units, feature gaps) before you treat it as full Kafka. It does not change the outbox or the idempotent consumer.

## What fails in review?

- Producing from the controller and calling it "event driven."
- Random keys, then filing a bug that "Kafka reordered my aggregate."
- `EnableAutoCommit = true` and a database write afterwards.
- Using the topic as a job queue with retries and a delay. You will invent Service Bus badly. Delay, sessions, and dead-letter counts are queue features.
- One giant topic for every event type with no key strategy, then one consumer that switches on a string.
- Logging the payload at information level. Events hold patient, payment, or address data.
- Adopting Kafka and also keeping a second unofficial copy of the same events on Service Bus "for now," with no owner of which one is source of truth.

## How do you verify the outbox and the offset?

1. Save an order. Confirm the outbox row and the orders row commit together, and that killing the process before the worker runs leaves a row with `SentAt` null and nothing on the topic.
2. Run the worker. Confirm one record, key stable for two events of the same order, both on the same partition (`result.Partition`).
3. Crash the consumer after `ApplyAsync` and before `Commit`. Restart. The handler runs again. The billing store does not double-charge.
4. Start a second group id. It reads existing retained records if `AutoOffsetReset` and retention allow it. That replay is the feature you adopted Kafka for. If you do not need this test to pass, you probably do not need Kafka.
5. Put two API instances up. Confirm you do not produce duplicates beyond the outbox crash window, and that you are not producing from the request path at all.

## Should this team adopt Kafka?

Adopt Kafka when replay and many independent consumers are requirements you can point to in a ticket, and when someone owns lag. Prefer Azure Service Bus when you want queues, dead-letters, and Azure-native ops for a modest number of workers. Prefer an in-process channel when the work dies with one deploy and that is acceptable.

Whatever you pick, keep the transactional outbox if a SQL row and a message must agree. The broker does not join that transaction for you.


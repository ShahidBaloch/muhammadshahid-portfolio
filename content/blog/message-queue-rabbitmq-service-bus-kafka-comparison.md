---
title: "RabbitMQ vs Azure Service Bus vs Kafka for .NET"
description: "Compare RabbitMQ, Azure Service Bus, and Kafka for .NET. Which message broker fits your workload — from task queues to event streaming at scale."
date: "2026-10-07"
category: "distributed-systems"
tags: ["Message Queue", "RabbitMQ", "Azure Service Bus", "Kafka", ".NET", "Event-Driven"]
---

Three years ago a team I consulted for adopted Kafka because "that's what Netflix uses." Their actual use case: an order placed in one service needs to notify another service. Daily volume: 2,000 orders. They spent six weeks configuring Kafka brokers, partition strategies, consumer groups, and offset management. RabbitMQ with MassTransit would have taken two days.

Technology choices should follow requirements, not aspirations. Here is the framework.

---

### The Core Difference: Queue vs Log

**RabbitMQ** and **Azure Service Bus** are message *queues*. Messages are delivered to consumers, acknowledged, and removed. They are designed for task distribution: "send this email," "process this order," "run this report."

**Kafka** is a distributed *log*. Messages are written to an immutable, ordered log. Consumers read from the log at their own pace without removing messages. Multiple consumer groups read the same data independently. Messages are retained for a configurable period (days, weeks, indefinitely).

This fundamental difference determines everything else.

---

### RabbitMQ: The Versatile Traditional Broker

**Best for**:
- Task queues with work distribution (send email, resize image, process payment)
- Request/reply patterns
- Dead letter queues with built-in retry logic
- Complex routing (fanout, topic, header-based routing)
- Systems where message deletion after consumption is desired
- Teams familiar with AMQP

**Key features**:
- Push-based delivery to consumers
- Competing consumers model (multiple instances share a queue)
- Flexible routing via exchanges (direct, fanout, topic, headers)
- Built-in dead letter exchange for failed messages
- Message TTL and queue length limits
- Priority queues

**.NET with MassTransit + RabbitMQ**:

```csharp
// Program.cs
builder.Services.AddMassTransit(config =>
{
    config.AddConsumer<OrderCreatedConsumer>();
    
    config.UsingRabbitMq((context, cfg) =>
    {
        cfg.Host("rabbitmq://localhost", h =>
        {
            h.Username("guest");
            h.Password("guest");
        });
        
        cfg.ReceiveEndpoint("order-processing", e =>
        {
            e.ConfigureConsumer<OrderCreatedConsumer>(context);
            
            // Retry policy before dead-lettering
            e.UseMessageRetry(r => r.Exponential(5, 
                TimeSpan.FromSeconds(1), 
                TimeSpan.FromSeconds(60), 
                TimeSpan.FromSeconds(5)));
            
            // Move failed messages to dead letter queue
            e.UseDelayedRedelivery(r => r.Intervals(
                TimeSpan.FromMinutes(5),
                TimeSpan.FromMinutes(15),
                TimeSpan.FromMinutes(30)));
        });
        
        cfg.ConfigureEndpoints(context);
    });
});

// Consumer
public class OrderCreatedConsumer : IConsumer<OrderCreatedEvent>
{
    public async Task Consume(ConsumeContext<OrderCreatedEvent> context)
    {
        // Message is auto-acknowledged when handler completes
        // Nacked (moved to DLQ) if exception is thrown after retry exhaustion
        await _orderProcessor.ProcessAsync(context.Message);
    }
}
```

**Limitations**:
- Not designed for replay — once consumed and acked, messages are gone
- High throughput (> 50k msgs/sec) requires careful cluster tuning
- No built-in long-term storage of message history
- Requeuing for all consumers is complex

---

### Azure Service Bus: The Cloud-Native Enterprise Broker

**Best for**:
- Azure-native .NET microservices
- Enterprise integration patterns (session-based ordering, duplicate detection)
- Transactional publishing (publish and database write in one transaction)
- Systems requiring message sessions (correlated message groups)
- Competing consumers with predictable SLAs

**Key features**:
- Queues and Topics/Subscriptions (pub/sub)
- Sessions for ordered processing of related messages
- Duplicate detection window (idempotent producer support)
- Scheduled message delivery
- Auto-forwarding between queues/topics
- Dead letter queue with detailed error information
- Premium tier: no message size limits, availability zones, virtual network integration

**.NET with Azure.Messaging.ServiceBus**:

```csharp
// Producer
public class OrderEventPublisher
{
    private readonly ServiceBusSender _sender;
    
    public async Task PublishAsync(OrderCreatedEvent orderEvent, CancellationToken ct)
    {
        var message = new ServiceBusMessage(
            BinaryData.FromObjectAsJson(orderEvent))
        {
            ContentType = "application/json",
            Subject = nameof(OrderCreatedEvent),
            MessageId = orderEvent.OrderId.ToString(), // Enables duplicate detection
            SessionId = orderEvent.CustomerId.ToString() // Groups messages by customer
        };
        
        await _sender.SendMessageAsync(message, ct);
    }
}

// Consumer with BackgroundService
public class OrderProcessingWorker : BackgroundService
{
    private readonly ServiceBusProcessor _processor;
    
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _processor.ProcessMessageAsync += HandleMessageAsync;
        _processor.ProcessErrorAsync += HandleErrorAsync;
        
        await _processor.StartProcessingAsync(stoppingToken);
        await Task.Delay(Timeout.Infinite, stoppingToken);
    }
    
    private async Task HandleMessageAsync(ProcessMessageEventArgs args)
    {
        var orderEvent = args.Message.Body.ToObjectFromJson<OrderCreatedEvent>();
        
        await _orderProcessor.ProcessAsync(orderEvent);
        
        // Complete the message (remove from queue)
        await args.CompleteMessageAsync(args.Message);
    }
    
    private Task HandleErrorAsync(ProcessErrorEventArgs args)
    {
        _logger.LogError(args.Exception, "Service Bus processing error");
        return Task.CompletedTask;
        // Message auto-abandoned and returns to queue for retry
    }
}
```

**Limitations**:
- Azure-only (vendor lock-in consideration)
- No true replay — premium tier has no guaranteed long-term retention for replay
- Higher latency than RabbitMQ for high-throughput scenarios
- Cost scales linearly with message volume on Standard tier

---

### Kafka: The Distributed Event Log

**Best for**:
- High-throughput event streaming (millions of events/second)
- Event sourcing backends
- Stream processing pipelines (aggregations, enrichments, joins)
- Multi-consumer scenarios where multiple systems read the same data independently
- Long-term event retention (audit logs, regulatory requirements, ML training data)
- Exact ordering guarantees within a partition

**Key concepts unique to Kafka**:
- **Topics**: Named logs of events (like a database table but append-only)
- **Partitions**: A topic is split into ordered partitions for parallelism
- **Consumer groups**: Multiple instances in a group each read from different partitions (parallelism); multiple groups read independently (fanout)
- **Offsets**: Consumers track their position in the log; can rewind and replay
- **Retention**: Messages kept for configured period regardless of consumption

**.NET with Confluent.Kafka**:

```csharp
// Producer
public class OrderEventProducer
{
    private readonly IProducer<string, string> _producer;
    
    public async Task ProduceAsync(OrderCreatedEvent orderEvent, CancellationToken ct)
    {
        var message = new Message<string, string>
        {
            Key = orderEvent.CustomerId.ToString(), // Ensures customer orders are ordered
            Value = JsonSerializer.Serialize(orderEvent),
            Headers = new Headers
            {
                { "event-type", Encoding.UTF8.GetBytes(nameof(OrderCreatedEvent)) }
            }
        };
        
        var result = await _producer.ProduceAsync("orders", message, ct);
        // result.Offset tells you where in the partition this message landed
    }
}

// Consumer with IHostedService
public class OrderEventsConsumer : BackgroundService
{
    private readonly IConsumer<string, string> _consumer;
    
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _consumer.Subscribe("orders");
        
        while (!stoppingToken.IsCancellationRequested)
        {
            var consumeResult = _consumer.Consume(TimeSpan.FromMilliseconds(100));
            
            if (consumeResult?.Message == null) continue;
            
            var orderEvent = JsonSerializer.Deserialize<OrderCreatedEvent>(
                consumeResult.Message.Value);
            
            await ProcessOrderAsync(orderEvent, stoppingToken);
            
            // Manual commit — only commit after successful processing
            _consumer.Commit(consumeResult);
        }
    }
}
```

**Why partitions matter**: Kafka parallelism comes from partitions. If "orders" has 12 partitions and your consumer group has 12 instances, each instance reads from one partition. The partition key (message key) determines which partition a message goes to — same key always goes to same partition, ensuring ordering for related messages.

**Limitations**:
- Complex infrastructure to operate (ZooKeeper/KRaft, broker replication, partition management)
- Kafka Connect and Schema Registry add operational overhead
- Consumer at-least-once delivery requires idempotent consumers
- Not suitable for simple task queue patterns (competing consumers without consumer groups is awkward)
- Cost (operational or managed service like Confluent/Azure Event Hubs)

---

### Decision Matrix

| Criterion | RabbitMQ | Azure Service Bus | Kafka |
|---|---|---|---|
| **Message pattern** | Task queue, request-reply | Task queue, pub/sub | Event log, streaming |
| **Throughput** | Up to ~50k/sec | Up to ~1M/sec (Premium) | 1M–10M+/sec |
| **Message retention** | Until consumed | Until consumed (up to 80GB) | Days to forever |
| **Replay** | No | No | Yes — any consumer group |
| **Ordering** | Per-queue | Per-session | Per-partition |
| **Complexity** | Medium | Low | High |
| **Azure integration** | Good via bridge | Native | Event Hubs as Kafka endpoint |
| **Best .NET library** | MassTransit | Azure.Messaging.ServiceBus | Confluent.Kafka or MassTransit |

---

### When to Use Each in a .NET SaaS System

**Use Azure Service Bus when:**
- You are fully Azure-native and want managed infrastructure
- You need session-based ordering (all messages for customer X processed in order)
- You need exactly-once delivery via duplicate detection
- The complexity of Kafka is not justified by your throughput

**Use RabbitMQ when:**
- You want infrastructure portability (self-hosted or cloud-agnostic)
- Complex routing logic (topic exchanges, header routing)
- Local development simplicity (Docker Compose with RabbitMQ is easy)
- Budget-conscious and managing your own infrastructure

**Use Kafka when:**
- You need replay capabilities (analytics backfill, new service catchup)
- High throughput (> 100k events/sec sustained)
- Multiple independent consumer systems reading the same events
- You are building an analytics pipeline, event sourcing backend, or change data capture stream
- Long-term event retention is a product feature

---

### If an Interviewer Asks...

**"How would you choose between Kafka and Azure Service Bus for a microservices system?"**

The primary question is: do any consumers need to replay events? If an analytics service needs to backfill historical data, or a new microservice needs to process all past events from day one, you need Kafka's log retention model. If you just need reliable task delivery between services, Azure Service Bus is simpler and fully managed. For most .NET microservices systems on Azure doing task-style messaging, Service Bus is the right starting point. Migrate to Kafka when replay, high throughput (> 50k/sec), or independent consumer group semantics become requirements.

---

## Key Concepts
- **Message queue**: A broker that stores messages until a consumer processes and acknowledges them (RabbitMQ, Service Bus)
- **Event log**: An append-only ordered log where messages are retained regardless of consumption (Kafka)
- **Consumer group**: A set of Kafka consumers that together read all partitions of a topic
- **Dead letter queue (DLQ)**: A queue where messages go after exceeding retry limits
- **Partition**: A Kafka topic subdivision that enables parallelism and ordering guarantees
- **Offset**: A consumer's position in a Kafka partition log

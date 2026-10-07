---
title: "Event-Driven Architecture in ASP.NET Core: A Practical Guide"
description: "Build event-driven systems in ASP.NET Core with MassTransit. Events vs commands, async decoupling trade-offs, and when EDA helps vs hurts."
date: "2026-10-07"
category: "architecture"
tags: ["Event-Driven Architecture", "ASP.NET Core", ".NET", "MassTransit", "Microservices", "Async"]
faq:
  - q: "What is event-driven architecture in ASP.NET Core?"
    a: "Event-driven architecture (EDA) decouples services through events published to a message broker. Service A publishes OrderPlaced and returns immediately; Service B and C consume it independently. In ASP.NET Core, MassTransit or Azure Service Bus implement this pattern — services share only event contract types, not domain models."
  - q: "What is the difference between events and commands in EDA?"
    a: "A command is a request to a specific service to do something — one handler, can be rejected. An event is a fact that happened — any number of handlers, cannot be rejected. Commands are named in the imperative (PlaceOrder); events are named in the past tense (OrderPlaced)."
  - q: "When should I NOT use event-driven architecture?"
    a: "Avoid EDA when you need synchronous responses (user login, payment confirmation UI), when the team lacks distributed systems experience, or for simple internal workflows that a direct method call handles. EDA adds operational complexity — message brokers, DLQs, idempotency requirements — that a monolith does not need."
---

## Why Use Event-Driven Architecture

Without EDA, services call each other synchronously. Service A calls Service B, waits for a response, then calls Service C. If Service B is slow, Service A is slow. If Service C is down, Service A fails. The services are temporally coupled — they must all be available and performant simultaneously.

EDA decouples services in time. Service A publishes an event to a broker ("OrderPlaced") and returns immediately. Service B and Service C consume the event independently and at their own pace. Service A does not wait. Service A does not know about B or C. If C is temporarily down, the event waits in the broker and C processes it when it recovers.

Microsoft's [event-driven architecture guidance](https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/event-driven) and the [Azure Event-Driven reference architecture](https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/serverless/event-processing) are the canonical references.

## Project Layout

```text
src/
├── Clinic.Contracts/                        # shared NuGet — event schemas only, no domain types
│   ├── AppointmentBooked.cs
│   └── PatientAdmitted.cs
├── Clinic.Booking.Service/
│   └── ...
│       └── Messaging/
│           └── IEventBus.cs                 # publish interface in Application layer
│           └── ServiceBusEventBus.cs        # Azure Service Bus implementation in Infrastructure
├── Clinic.Billing.Service/
│   └── Consumers/
│       └── AppointmentBookedConsumer.cs     # IConsumer<AppointmentBooked> (MassTransit)
└── Clinic.Notification.Service/
    └── Consumers/
        └── AppointmentBookedConsumer.cs     # independent consumer — no coupling to Billing
```

Services share only `Clinic.Contracts`. Each service owns its consumer. When the billing rule changes, only the billing consumer changes.

---

## Events, Commands, and Queries

Understanding these three message types prevents the most common EDA design mistakes:

**Commands** express intent — a request to do something. The sender expects a specific service to handle it. Commands should be named with imperative verbs.
- `PlaceOrder`, `CancelAppointment`, `ProcessPayment`
- Has one handler. Rejected if the handler rejects it.
- Often routed to a specific queue.

**Events** express facts — something that already happened. The publisher does not know who will react. Events should be named with past-tense nouns.
- `OrderPlaced`, `AppointmentCancelled`, `PaymentProcessed`
- Can have zero or many handlers.
- Published to a topic; subscribers opt in.

**Queries** request information. In EDA, these are typically synchronous HTTP calls or are served from pre-built read model projections.
- `GetOrderById`, `GetPatientRecords`
- Always has exactly one response.
- Use HTTP/gRPC, not message brokers.

```csharp
// Command — sent to a specific service
public record PlaceOrderCommand(
    Guid CustomerId,
    IReadOnlyList<OrderLineRequest> Items,
    Address ShippingAddress);

// Event — published after the fact, anyone can subscribe
public record OrderPlacedEvent(
    Guid OrderId,
    Guid CustomerId,
    decimal TotalAmount,
    string Currency,
    DateTime PlacedAt);
```

---

## Producer Side: Publishing Events

```csharp
// Application service publishes event after successful command handling
public class PlaceOrderCommandHandler : ICommandHandler<PlaceOrderCommand>
{
    private readonly IOrderRepository _orders;
    private readonly IPublishEndpoint _publishEndpoint; // MassTransit
    
    public async Task<OrderId> Handle(PlaceOrderCommand command, CancellationToken ct)
    {
        var order = Order.Create(command.CustomerId, command.Items, command.ShippingAddress);
        await _orders.SaveAsync(order, ct);
        
        // Publish event — any service that cares can subscribe
        await _publishEndpoint.Publish(new OrderPlacedEvent(
            OrderId: order.Id,
            CustomerId: order.CustomerId,
            TotalAmount: order.Total.Amount,
            Currency: order.Total.Currency,
            PlacedAt: DateTime.UtcNow), ct);
        
        return order.Id;
    }
}
```

For guaranteed delivery, use the outbox pattern — write the event to a database table atomically with the order, then a background job publishes it. See the [transactional outbox post](/blog/transactional-outbox-ef-core) for implementation.

---

## Consumer Side: Subscribing to Events

```csharp
// Inventory service subscribes to OrderPlaced — reserves stock
public class OrderPlacedConsumer : IConsumer<OrderPlacedEvent>
{
    private readonly IInventoryRepository _inventory;
    private readonly ILogger<OrderPlacedConsumer> _logger;
    
    public async Task Consume(ConsumeContext<OrderPlacedEvent> context)
    {
        var message = context.Message;
        
        // Idempotency check — broker may deliver the same event twice
        if (await _inventory.IsOrderAlreadyProcessedAsync(message.OrderId))
        {
            _logger.LogInformation("Order {OrderId} already processed, skipping", message.OrderId);
            return;
        }
        
        await _inventory.ReserveForOrderAsync(message.OrderId, message.Items);
    }
}

// Notification service subscribes to the same event independently
public class OrderPlacedNotificationConsumer : IConsumer<OrderPlacedEvent>
{
    private readonly IEmailService _email;
    
    public async Task Consume(ConsumeContext<OrderPlacedEvent> context)
    {
        await _email.SendOrderConfirmationAsync(
            context.Message.CustomerId,
            context.Message.OrderId);
    }
}
```

---

## MassTransit Wiring

```csharp
builder.Services.AddMassTransit(config =>
{
    // Register all consumers in assembly
    config.AddConsumers(typeof(OrderPlacedConsumer).Assembly);
    
    config.UsingAzureServiceBus((context, cfg) =>
    {
        cfg.Host(connectionString);
        
        // Each consumer gets its own subscription on the OrderPlaced topic
        cfg.SubscriptionEndpoint<OrderPlacedEvent>(
            "inventory-service",  // Subscription name — unique per consumer
            e => e.ConfigureConsumer<OrderPlacedConsumer>(context));
        
        cfg.SubscriptionEndpoint<OrderPlacedEvent>(
            "notification-service",
            e => e.ConfigureConsumer<OrderPlacedNotificationConsumer>(context));
        
        cfg.ConfigureEndpoints(context);
    });
});
```

---

## Async Decoupling vs Synchronous Coupling Trade-offs

EDA is not always the right choice. The benefits come with real costs:

**Temporal decoupling** means the response to the original command is "accepted, processing" not "completed successfully". The client must poll for status or accept eventual completion. In a payment flow, users expect synchronous confirmation — EDA for the payment step itself may be wrong.

**Debugging is harder**: a synchronous call stack is visible in one trace. An event-driven flow spans multiple services, multiple traces, and multiple log streams. Distributed tracing (OpenTelemetry) becomes non-optional.

**Eventual consistency is a product decision**: "Your order will be confirmed shortly" is only acceptable if the business and the users accept eventual confirmation. For financial transactions or medical records, immediate consistency may be required.

---

## When to Use EDA

- Long-running background work (image processing, document generation, email sending) — do not block the HTTP request
- Fanout: one event must trigger actions in multiple independent services
- Decoupling teams: different teams own different consumers, and you want them to deploy independently
- Fire-and-forget notifications and analytics — low-latency acknowledgement, best-effort delivery is acceptable
- Workflows where steps execute over seconds or minutes (order processing pipeline)

## When NOT to Use EDA

- When the caller needs a synchronous result ("is this credit card valid?") — use HTTP/gRPC
- When cross-service consistency must be immediate, not eventual
- Simple internal service coordination where direct method calls are clearer
- Small codebases where the message broker overhead exceeds the benefit
- When your team lacks the operational maturity to debug distributed failures

## Trade-offs

| Benefit | Cost / Risk |
|---|---|
| Services are temporally decoupled — independent availability and scale | Eventual consistency — clients cannot rely on immediate completion |
| Adding a new subscriber does not require changing the publisher | Message broker is a new infrastructure component to operate |
| Services fail independently — one consumer's failure does not affect others | Debugging requires distributed tracing and correlated log aggregation |
| High throughput — broker absorbs spikes without overwhelming services | Idempotency is mandatory — at-least-once delivery guarantees |
| Natural audit trail of what happened and when | Event schema evolution must be backward compatible |

---

## Observability: What You Cannot Skip

EDA makes observability non-optional. Configure correlation IDs and distributed tracing from the start:

```csharp
// Ensure correlation ID flows through all events
builder.Services.AddMassTransit(config =>
{
    config.AddOpenTelemetryInstrumentation(); // Propagates trace context to consumers
    
    config.UsingAzureServiceBus((context, cfg) =>
    {
        cfg.PropagateActivityTracingContext(); // Carries W3C trace context in message headers
        cfg.ConfigureEndpoints(context);
    });
});
```

---

## If an Interviewer Asks...

**"When would you choose event-driven architecture over synchronous HTTP calls?"**

I use events when I want to decouple the publisher from the subscribers — when multiple services need to react to the same business event, or when the work should happen asynchronously without blocking the user. The key question is whether the caller needs a synchronous result. If they do (payment confirmation, credit check), use synchronous HTTP. If the work can complete later (send confirmation email, update analytics, reserve inventory), publish an event. I also consider the team structure — events let independent teams subscribe without touching the publisher's code.

---

## Key Concepts
- **Event**: An immutable fact about something that happened; published to any interested subscriber
- **Command**: An instruction to do something; directed at one specific handler
- **Consumer**: A service or component that subscribes to and processes events
- **Topic/Exchange**: A broker construct where events are published; consumers subscribe to topics
- **At-least-once delivery**: The broker guarantees delivery but may deliver the same message multiple times
- **Temporal decoupling**: Publisher and consumer do not need to be available simultaneously

---
title: "Domain Events in .NET: Raising and Dispatching with MediatR"
description: "Implement domain events in .NET aggregates and dispatch with MediatR. Domain events vs integration events, dispatch timing, and the outbox pattern."
date: "2026-10-07"
category: "architecture"
tags: ["Domain Events", "DDD", "MediatR", ".NET", "Event-Driven", "Domain-Driven Design"]
faq:
  - q: "What are domain events in .NET?"
    a: "Domain events represent something significant that happened in the domain — OrderSubmitted, PatientAdmitted. They are raised inside aggregates and dispatched after the transaction commits. In .NET with MediatR, domain events implement INotification and are dispatched with IPublisher."
  - q: "What is the difference between domain events and integration events?"
    a: "Domain events are in-process — raised in the same transaction, handled in the same application. Integration events cross service or process boundaries — serialized to a message broker. Domain events can have synchronous side effects; integration events must be async and idempotent. The outbox pattern bridges the two."
  - q: "Should domain events be dispatched before or after SaveChanges?"
    a: "Dispatch after SaveChanges to ensure events only fire for committed data. A SaveChangesInterceptor or a wrapper around SaveChangesAsync is the standard .NET pattern. Dispatching before risks sending events for transactions that later roll back."
---

## Why Use Domain Events

Without domain events, side effects of business operations (sending an email after an order is placed, updating read models after a payment is confirmed, notifying another service) are handled by application services that call other services directly. This couples the application service to every downstream concern: the order service handler must know about emails, inventory, notifications, and analytics.

Domain events decouple this. The aggregate raises an event representing something that happened in the domain ("OrderSubmitted"). The application service dispatches those events. Multiple handlers respond independently without the original service knowing about them.

Microsoft's [microservices guide](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/domain-events-design-implementation) documents domain event design and implementation in .NET.

## Project Layout

```text
src/
├── Clinic.Domain/
│   ├── Shared/
│   │   ├── Entity.cs                        # base with List<IDomainEvent> DomainEvents
│   │   └── IDomainEvent.cs                  # : INotification (MediatR)
│   └── Orders/
│       ├── Order.cs                          # calls AddDomainEvent(new OrderSubmitted(...))
│       └── Events/
│           └── OrderSubmitted.cs
├── Clinic.Application/
│   └── Orders/
│       └── Handlers/
│           ├── SendConfirmationOnOrderSubmitted.cs   # INotificationHandler<OrderSubmitted>
│           └── UpdateInventoryOnOrderSubmitted.cs    # INotificationHandler<OrderSubmitted>
└── Clinic.Infrastructure/
    └── Dispatch/
        └── DomainEventDispatcher.cs          # ISaveChangesInterceptor: publish after commit
```

Domain events are raised in aggregates, dispatched by infrastructure after the transaction commits. Handlers live in Application and have no coupling to each other.

---

## Domain Events vs Integration Events

This distinction is critical and commonly confused:

**Domain events** are in-process events, raised within a single bounded context, dispatched within the same transaction. They are used to trigger side effects that should happen as part of the same database transaction (updating a read model, updating aggregate state based on another aggregate's action).

**Integration events** cross service or bounded context boundaries. They are published to a message broker (RabbitMQ, Azure Service Bus) after the transaction commits. They carry only the information that consumers need — not the full domain model.

```
Same transaction boundary         Cross service/process boundary
┌────────────────────────┐        ┌─────────────────────────────┐
│ Order aggregate        │        │                             │
│  → OrderSubmitted      │──────→│  Integration event published│──→ Notification Service
│    (domain event)      │  after │  to message broker          │──→ Analytics Service
│                        │  commit│                             │──→ Loyalty Service
└────────────────────────┘        └─────────────────────────────┘
```

---

## Raising Domain Events from Aggregate Roots

```csharp
// Base domain event
public abstract record DomainEvent
{
    public Guid EventId { get; init; } = Guid.NewGuid();
    public DateTime OccurredAt { get; init; } = DateTime.UtcNow;
}

// Concrete domain event — names are past tense (something happened)
public record OrderSubmittedEvent(
    Guid OrderId,
    Guid CustomerId,
    Money Total,
    IReadOnlyList<OrderLineDto> Lines) : DomainEvent;

// In the aggregate root
public class Order : Entity
{
    private readonly List<DomainEvent> _domainEvents = new();
    public IReadOnlyList<DomainEvent> DomainEvents => _domainEvents.AsReadOnly();
    
    public void Submit()
    {
        if (Status != OrderStatus.Draft)
            throw new DomainException($"Cannot submit order in {Status} state");
        
        Status = OrderStatus.Submitted;
        SubmittedAt = DateTime.UtcNow;
        
        // Raise domain event — the aggregate does not know who handles it
        _domainEvents.Add(new OrderSubmittedEvent(
            Id,
            CustomerId,
            Total,
            Lines.Select(l => new OrderLineDto(l.ProductId, l.Quantity, l.UnitPrice)).ToList()));
    }
    
    public void ClearDomainEvents() => _domainEvents.Clear();
}
```

---

## Dispatching Domain Events with MediatR

There are two dispatch timing strategies. The most common is **dispatch after SaveChanges** — let EF Core persist the aggregate, then dispatch events.

```csharp
// Override SaveChangesAsync to dispatch events automatically
public class AppDbContext : DbContext
{
    private readonly IPublisher _mediator;
    
    public override async Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        var result = await base.SaveChangesAsync(ct);
        
        // Collect all domain events from tracked aggregates
        var aggregates = ChangeTracker.Entries<Entity>()
            .Where(e => e.Entity.DomainEvents.Any())
            .Select(e => e.Entity)
            .ToList();
        
        var events = aggregates
            .SelectMany(a => a.DomainEvents)
            .ToList();
        
        // Clear events BEFORE dispatching to prevent infinite loops
        foreach (var aggregate in aggregates)
            aggregate.ClearDomainEvents();
        
        // Dispatch each event — handlers run in the same process
        foreach (var domainEvent in events)
            await _mediator.Publish(domainEvent, ct);
        
        return result;
    }
}
```

**Domain event handlers** — in-process, synchronous within the request:

```csharp
// Handler runs after SaveChanges, in the same request
public class OrderSubmittedHandler : INotificationHandler<OrderSubmittedEvent>
{
    private readonly IInventoryService _inventory;
    
    public async Task Handle(OrderSubmittedEvent notification, CancellationToken ct)
    {
        // Reserve inventory as part of the same request
        await _inventory.ReserveAsync(
            notification.OrderId,
            notification.Lines,
            ct);
    }
}

// Another handler — decoupled, does not need to be added to the application service
public class OrderSubmittedAuditHandler : INotificationHandler<OrderSubmittedEvent>
{
    private readonly IAuditRepository _audit;
    
    public async Task Handle(OrderSubmittedEvent notification, CancellationToken ct)
    {
        await _audit.LogAsync(new AuditEntry
        {
            Event = "OrderSubmitted",
            OrderId = notification.OrderId,
            OccurredAt = notification.OccurredAt
        }, ct);
    }
}
```

---

## Dispatching Before SaveChanges (Alternative)

Some teams dispatch domain events before SaveChanges to include the effects in the same database transaction. This is appropriate for read model updates in the same database:

```csharp
// Dispatch events, then save everything in one transaction
public async Task<int> SaveChangesAsync(CancellationToken ct = default)
{
    // Collect events first
    var events = ChangeTracker.Entries<Entity>()
        .SelectMany(e => e.Entity.DomainEvents)
        .ToList();
    
    foreach (var entity in ChangeTracker.Entries<Entity>())
        entity.Entity.ClearDomainEvents();
    
    // Dispatch — handlers can modify tracked entities
    foreach (var @event in events)
        await _mediator.Publish(@event, ct);
    
    // Save everything — original aggregate + handler side effects — atomically
    return await base.SaveChangesAsync(ct);
}
```

**Trade-off**: Dispatching before save means read model updates are part of the same transaction (atomic). Dispatching after save means handlers cannot affect the save, which is simpler to reason about.

---

## Converting Domain Events to Integration Events

Domain events stay in-process. To notify other services, convert them to integration events and publish via the outbox pattern:

```csharp
// Integration event handler — publishes to message broker via outbox
public class OrderSubmittedIntegrationEventHandler 
    : INotificationHandler<OrderSubmittedEvent>
{
    private readonly AppDbContext _db;
    
    public async Task Handle(OrderSubmittedEvent notification, CancellationToken ct)
    {
        // Write to outbox table — published reliably by background job
        _db.OutboxMessages.Add(new OutboxMessage
        {
            Id = Guid.NewGuid(),
            EventType = nameof(OrderSubmittedIntegrationEvent),
            Payload = JsonSerializer.Serialize(new OrderSubmittedIntegrationEvent
            {
                OrderId = notification.OrderId,
                CustomerId = notification.CustomerId,
                TotalAmount = notification.Total.Amount,
                TotalCurrency = notification.Total.Currency
            }),
            CreatedAt = DateTime.UtcNow
        });
        // The outbox table gets saved in the same SaveChanges call as the order
    }
}
```

See the [transactional outbox post](/blog/transactional-outbox-ef-core) for the full outbox implementation.

---

## When to Use Domain Events

- Side effects that are logically part of the same business operation (updating a read model, reserving inventory, recording in audit log)
- Decoupling application service logic — when the number of concerns the command handler must manage grows beyond 2-3 items
- Enabling multiple handlers to respond to the same business event without coupling them

## When NOT to Use Domain Events

- Simple CRUD where there are no meaningful side effects
- When the handler must run in a separate transaction (use integration events and a message broker instead)
- When the chain of event → handler → event → handler spans more than one or two hops (debugging becomes difficult)
- When a direct method call is clearer than an event (do not use events as a pattern just to follow DDD)

## Trade-offs

| Benefit | Cost / Risk |
|---|---|
| Decouples application service from side effect handlers | Implicit flow — harder to trace than direct method calls |
| Multiple handlers can respond without changing the aggregate or command | Handler execution order is not guaranteed by default |
| New handlers can be added without modifying existing code | Errors in handlers can be harder to attribute to the original command |
| Events document what happened in the domain (audit value) | Dispatching after SaveChanges means handlers cannot participate in the same transaction |

---

## If an Interviewer Asks...

**"What is the difference between a domain event and an integration event?"**

Domain events are in-process notifications raised by aggregates to signal that something happened within a bounded context. They are dispatched by MediatR (or a similar in-process mediator), handled synchronously within the same request, and can be part of the same database transaction. Integration events cross service boundaries — they are published to a message broker after the transaction commits and consumed asynchronously by other services. A domain event triggers an integration event handler that publishes to the broker via the outbox pattern.

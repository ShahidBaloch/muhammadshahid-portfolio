---
title: "Event Sourcing vs CRUD: When to Use Event Sourcing"
description: "Compare event sourcing and CRUD for .NET. When the audit trail and temporal queries justify event sourcing's complexity, with C# implementation patterns."
date: "2026-10-07"
category: "architecture"
tags: ["Event Sourcing", "CQRS", ".NET", "Architecture", "Domain-Driven Design"]
faq:
  - q: "What is event sourcing in .NET?"
    a: "Event sourcing stores every state change as an immutable event rather than updating a current-state row. An Order aggregate stores OrderCreated, PaymentConfirmed, and Shipped events. Current state is derived by replaying events. In .NET, aggregates have Apply() methods for each event type."
  - q: "When should I use event sourcing instead of CRUD?"
    a: "Use event sourcing when you need a full audit trail, temporal queries (what was the state at a past time?), or event replay. Good fits: financial ledgers, healthcare records, booking systems with complex workflows. Avoid it for simple CRUD, reporting databases, and teams unfamiliar with eventual consistency."
  - q: "Does event sourcing replace a relational database?"
    a: "No. Event sourcing replaces the write model. You still need read models — projected from events into SQL tables or Redis — for queries. CQRS pairs with event sourcing because you cannot run SQL queries against an event stream."
---

Event sourcing stores every state change as an immutable event, rather than storing the current state directly. Instead of updating a `Balance` column, you store an `AccountCredited` event. The current state is derived by replaying all events from the beginning.

Microsoft documents the pattern in the [Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing).

## Project Layout

```text
src/
├── Clinic.Domain/
│   └── Orders/
│       ├── Order.cs                         # aggregate: Apply(OrderCreated), Apply(Shipped)
│       └── Events/
│           ├── OrderCreated.cs
│           ├── PaymentConfirmed.cs
│           └── OrderShipped.cs
├── Clinic.Infrastructure/
│   └── EventStore/
│       ├── IEventStore.cs                   # AppendAsync, LoadAsync
│       └── SqlEventStore.cs                 # or EventStoreDB client
└── Clinic.Application/
    └── Orders/
        ├── OrderProjection.cs               # builds read model by replaying events
        └── GetOrderQueryHandler.cs          # reads from projection, not event stream
```

The event store is an infrastructure concern. Aggregates in Domain have no reference to it — they only produce and apply events.

```
CRUD: Orders table
┌─────┬──────────┬─────────┬──────────────────┐
│ ID  │ Status   │ Total   │ UpdatedAt        │
├─────┼──────────┼─────────┼──────────────────┤
│ 1   │ Shipped  │ £49.99  │ 2026-10-07 14:33 │
└─────┴──────────┴─────────┴──────────────────┘
(History gone — you see only the current state)

Event Sourcing: Order event stream
┌────────────────────┬───────────────────────────────────┐
│ OrderCreated       │ {id:1, items:[...], total:£49.99} │
│ PaymentConfirmed   │ {orderId:1, txId:"px_abc"}        │
│ WarehousePicked    │ {orderId:1, warehouse:"LON-3"}    │
│ Shipped            │ {orderId:1, trackingNo:"FX9182"}  │
└────────────────────┴───────────────────────────────────┘
(Full history preserved — current state derived by replaying)
```

---

### What Event Sourcing Actually Solves

Event sourcing is justified when one or more of these are true:

**1. Auditability is a regulatory requirement**  
Healthcare, financial services, and legal systems often must demonstrate exactly what happened, when, and why. Event sourcing makes this trivial — the audit trail is the source of truth. With CRUD, audit logging is often bolted on as an afterthought (EF Core interceptors, SQL triggers) and is frequently incomplete.

**2. Temporal queries are a core product feature**  
"What was the inventory level on June 15th at 2 PM?" is trivial with event sourcing (replay events up to that timestamp). With CRUD, you would need a separate history table or full point-in-time restores.

**3. Projections and read models diverge significantly**  
Complex analytics, different view models for different user types, and integration exports are all projections in event sourcing. New projections can be built by replaying historical events without touching the write side.

**4. Business process debugging**  
When something goes wrong in a complex business process, event sourcing lets you replay the exact sequence of events that led to the state. With CRUD, the evidence is often overwritten.

---

### What Event Sourcing Costs

**Development complexity**: Every operation that used to be `order.Status = "Shipped"` is now `order.Apply(new OrderShipped { ... })`. Writing, testing, and evolving event schemas requires significant discipline.

**Schema evolution**: Changing an event's structure after it is in production is non-trivial. If you rename a field in `OrderCreated`, all event replay logic must handle both the old and new schema. This is manageable but requires versioning strategies.

**Querying**: You cannot do `SELECT * FROM Orders WHERE Status = 'Shipped' AND Total > 100`. You must maintain denormalized read model projections. Every query requires a projection; otherwise you are replaying event streams for every read.

**Snapshots**: For aggregates with thousands of events, replaying from the beginning on every read is too slow. Snapshots capture the current state periodically so replay starts from a recent snapshot, not event 1.

**Tooling**: Most .NET teams are familiar with EF Core + SQL Server. Event sourcing requires event stores (EventStoreDB, Marten, or a custom implementation) and projection infrastructure (EventStoreDB subscriptions, Azure Functions, etc.).

---

### Simple C# Event Sourcing Implementation

```csharp
// Domain events
public abstract record DomainEvent
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public DateTime OccurredAt { get; init; } = DateTime.UtcNow;
    public int Version { get; init; }
}

public record OrderCreated(Guid OrderId, Guid CustomerId, Money Total) : DomainEvent;
public record PaymentConfirmed(Guid OrderId, string TransactionId) : DomainEvent;
public record OrderShipped(Guid OrderId, string TrackingNumber) : DomainEvent;
public record OrderCancelled(Guid OrderId, string Reason) : DomainEvent;

// Aggregate root — state derived from events
public class Order
{
    public Guid Id { get; private set; }
    public Guid CustomerId { get; private set; }
    public OrderStatus Status { get; private set; }
    public Money Total { get; private set; }

    private readonly List<DomainEvent> _uncommittedEvents = new();
    public IReadOnlyList<DomainEvent> UncommittedEvents => _uncommittedEvents;

    // Reconstitute from event stream
    public static Order Reconstitute(IEnumerable<DomainEvent> events)
    {
        var order = new Order();
        foreach (var @event in events)
            order.Apply(@event);
        return order;
    }

    // Command methods
    public static Order Create(Guid customerId, Money total)
    {
        var order = new Order();
        var @event = new OrderCreated(Guid.NewGuid(), customerId, total);
        order.Raise(@event);
        return order;
    }

    public void ConfirmPayment(string transactionId)
    {
        if (Status != OrderStatus.PendingPayment)
            throw new InvalidOperationException($"Cannot confirm payment for order in {Status} state");
        
        Raise(new PaymentConfirmed(Id, transactionId));
    }

    // Internal event application (state mutation from event)
    private void Apply(DomainEvent @event)
    {
        switch (@event)
        {
            case OrderCreated e:
                Id = e.OrderId;
                CustomerId = e.CustomerId;
                Total = e.Total;
                Status = OrderStatus.PendingPayment;
                break;
            case PaymentConfirmed:
                Status = OrderStatus.Processing;
                break;
            case OrderShipped e:
                Status = OrderStatus.Shipped;
                break;
            case OrderCancelled:
                Status = OrderStatus.Cancelled;
                break;
        }
    }

    private void Raise(DomainEvent @event)
    {
        Apply(@event);
        _uncommittedEvents.Add(@event);
    }
}

// Repository — loads and persists events
public class OrderEventSourcedRepository
{
    private readonly IEventStore _eventStore;

    public async Task<Order> GetByIdAsync(Guid orderId, CancellationToken ct)
    {
        var events = await _eventStore.LoadEventsAsync($"order-{orderId}", ct);
        return Order.Reconstitute(events);
    }

    public async Task SaveAsync(Order order, CancellationToken ct)
    {
        await _eventStore.AppendEventsAsync(
            $"order-{orderId}",
            order.UncommittedEvents,
            ct);
    }
}
```

---

### CRUD with Audit: The Often-Correct Alternative

For most business requirements that cite "we need an audit trail," EF Core interceptors or change tracking provides 90% of the benefit at 10% of the complexity:

```csharp
// EF Core audit interceptor — simpler than event sourcing for most audit needs
public class AuditInterceptor : SaveChangesInterceptor
{
    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, 
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        var context = eventData.Context!;
        var userId = _currentUserService.UserId;
        
        foreach (var entry in context.ChangeTracker.Entries()
            .Where(e => e.State is EntityState.Modified or EntityState.Added))
        {
            context.AuditLogs.Add(new AuditLog
            {
                EntityType = entry.Entity.GetType().Name,
                EntityId = entry.Property("Id").CurrentValue?.ToString(),
                Action = entry.State.ToString(),
                OldValues = entry.State == EntityState.Modified 
                    ? JsonSerializer.Serialize(entry.OriginalValues.ToObject())
                    : null,
                NewValues = JsonSerializer.Serialize(entry.CurrentValues.ToObject()),
                ChangedBy = userId,
                ChangedAt = DateTime.UtcNow
            });
        }
        
        return await base.SavingChangesAsync(eventData, result, cancellationToken);
    }
}
```

This covers: who changed what, when, and what the before/after values were — which satisfies most compliance requirements without the overhead of a full event sourcing implementation.

**Use event sourcing when:**
- Temporal queries are a core feature (not just audit logging)
- The domain has complex state machines with many valid transitions
- You need multiple independent projections of the same data
- You are building an integration hub where other systems need the event history
- Your team has the expertise and the system justifies the complexity

**Use CRUD + audit interceptor when:**
- Audit logging is the primary driver (not temporal queries)
- The domain is CRUD-heavy with simple state
- The team needs to move fast
- The system is the primary authority for current state, not historical analysis

---

### If an Interviewer Asks...

**"When would you choose event sourcing over standard CRUD?"**

I'd choose event sourcing when temporal queries are a first-class product requirement (not just audit needs), when I need multiple independent read projections built from the same write side, or when the domain has complex state machines where understanding how state was reached is as important as the state itself — financial systems, insurance claims, healthcare workflows. I would not use it just for auditability — EF Core interceptors or temporal tables in SQL Server handle that at a fraction of the complexity cost.

---

## Trade-offs Covered
- Event sourcing audit capability vs CRUD + audit interceptor simplicity
- Event replay correctness vs current-state query performance
- Temporal query power vs projection maintenance overhead
- Schema evolution difficulty vs current state migration simplicity
- Event store tooling cost vs EF Core familiarity

## Key Concepts
- **Event sourcing**: Storing state changes as immutable events; current state is derived by replaying events
- **Aggregate**: The domain object whose state is managed by an event stream
- **Projection**: A denormalized read model derived from event streams
- **Snapshot**: A cached state checkpoint to avoid replaying all events from the beginning
- **CRUD**: Create, Read, Update, Delete — the standard database interaction pattern where only current state is stored

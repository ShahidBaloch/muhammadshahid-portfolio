---
title: "DDD Interview Questions: Aggregates, Events, and Contexts"
description: "DDD interview prep for .NET engineers — aggregate root, bounded context, domain events vs integration events, and the anemic domain model anti-pattern."
date: "2026-10-07"
category: "interview-prep"
tags: ["DDD", "Domain-Driven Design", ".NET", "Interview Questions", "Architecture"]
---

## Question 1: "What Is a Domain Model, and Why Does It Matter?"

### 30-Second Answer
A domain model is code that represents the business concepts, rules, and behaviour of the system. It is the authoritative place where business logic lives — not in controllers, not in service classes, not in stored procedures. It matters because when the model accurately reflects the business, changes to business rules map directly to code changes.

### Strong Answer
Most enterprise applications develop an "anemic" model over time — entities are data bags, and business logic lives scattered in service classes, controllers, and stored procedures. When requirements change, engineers must hunt through multiple files to find every place a rule is applied, and inevitably miss one.

A rich domain model places rules inside the objects they govern. An `Order` that can only be submitted when it has at least one line and is in Draft status enforces that rule in its `Submit()` method — not in every service that might call it. The invariant has one home.

This also makes the domain testable without infrastructure. You can unit-test `Order.Submit()` without a database, HTTP layer, or message bus.

---

## Question 2: "What Is an Aggregate Root?"

### 30-Second Answer
An aggregate root is the entry point for a cluster of entities and value objects. External code can only hold references to the root, not to the internal entities. The root enforces all invariants for the cluster and is the unit of persistence.

### Strong Answer
Consider an `Order` aggregate: it contains `OrderLines`. The rules are:
- You cannot add an `OrderLine` to a submitted order
- The order total must always equal the sum of line totals
- An `OrderLine` only makes sense in the context of an `Order`

These rules are enforced by the aggregate root (`Order`). External code calls `order.AddLine(...)` — it cannot directly manipulate `_lines` because the collection is private. The root maintains the invariant.

**Why only reference the root**: If you could hold a reference to `OrderLine` and modify it directly, the order total could become inconsistent without the `Order` knowing. The root needs to be in control of all state changes.

**Persistence**: The entire aggregate is loaded and saved as a unit. You do not load just `OrderLine` entities independently — you always load `Order` and its lines together.

### Common Follow-up Questions
- "How do you size an aggregate?" — Small. An aggregate that is too large causes concurrency conflicts (everyone updating the same aggregate root hits optimistic concurrency errors). If two operations that must be independent are touching the same aggregate root, consider splitting.
- "Can two aggregates reference each other?" — Only by ID, never by object reference. If `Order` needs customer data, it stores `CustomerId`, not a `Customer` reference.

### Red Flags
- "An aggregate is just a group of related entities" — missing the invariant enforcement responsibility
- Not mentioning that external code interacts only with the root

---

## Question 3: "What Is a Bounded Context?"

### 30-Second Answer
A bounded context is a boundary within which a specific domain model is internally consistent. The same word (like "Customer") can mean different things in different bounded contexts — each context has its own model optimised for its purposes.

### Strong Answer
In a healthcare system: 
- The **Scheduling** context has a "Patient" with appointment history and contact details
- The **Clinical** context has a "Patient" with medical records, diagnoses, and prescriptions
- The **Billing** context has a "Patient" as a billing account with payment method and invoice address

These are three different classes, all called "Patient" but with different fields and behaviour. Rather than one monolithic `Patient` class that satisfies all three contexts poorly, each context has its own model.

**How to find boundaries**: Follow where the language shifts. When a business expert uses the same word differently in two conversations, that is a boundary. Follow team ownership — each team should fully own their context without coordinating with other teams for internal changes.

**Bounded contexts and microservices**: They are different things. A bounded context is a model boundary. A microservice is a deployment boundary. Start with a modular monolith where each module is a bounded context. Extract to microservices when independent deployment or scaling becomes necessary.

### Red Flags
- Treating a bounded context as the same thing as a microservice
- Not explaining that the same word can have different meanings in different contexts

---

## Question 4: "What Is the Difference Between a Domain Event and an Integration Event?"

### 30-Second Answer
Domain events are in-process notifications that something happened within a single bounded context — dispatched in the same transaction, handled by MediatR. Integration events cross service or context boundaries — published to a message broker after the transaction commits, consumed asynchronously.

### Strong Answer
When an `Order` is submitted:

**Domain event** (`OrderSubmittedEvent`):
- Raised by the `Order` aggregate in-process
- Dispatched by MediatR notification handlers
- Runs in the same database transaction (before SaveChanges) or immediately after
- Can update read models in the same database atomically
- Never leaves the process

**Integration event** (`OrderSubmittedIntegrationEvent`):
- Derived from the domain event by a handler
- Written to the outbox table in the same transaction as the order
- Published to Azure Service Bus / RabbitMQ by a background job
- Consumed by Inventory, Notification, Analytics services independently
- Crosses service boundaries

The practical path: domain event handler writes an outbox message → background job publishes it to the broker → other services consume the integration event.

```csharp
// Domain event handler that converts to integration event
public class OrderSubmittedIntegrationEventDispatcher 
    : INotificationHandler<OrderSubmittedEvent>
{
    public async Task Handle(OrderSubmittedEvent notification, CancellationToken ct)
    {
        // Runs inside the same SaveChanges call as the order
        // Outbox message committed atomically with the order
        _db.OutboxMessages.Add(new OutboxMessage
        {
            EventType = nameof(OrderSubmittedIntegrationEvent),
            Payload = JsonSerializer.Serialize(new OrderSubmittedIntegrationEvent(
                notification.OrderId,
                notification.CustomerId,
                notification.Total.Amount))
        });
    }
}
```

### Red Flags
- Treating domain events and integration events as the same thing
- Publishing directly to the message broker from the domain event handler (not transactional — can lose events if the broker call fails)

---

## Question 5: "What Is the Anemic Domain Model and How Do You Fix It?"

### 30-Second Answer
An anemic domain model is one where entities are data structures with public getters and setters, and all business logic lives in service classes. The fix: move behaviour into the aggregate, use private setters, and make state transitions explicit methods that enforce invariants.

### Strong Answer

**Anemic (problematic)**:
```csharp
public class Order
{
    public Guid Id { get; set; }
    public OrderStatus Status { get; set; }   // Anyone can set anything
    public List<OrderLine> Lines { get; set; } = new();
}

public class OrderService
{
    public void Submit(Order order) {
        if (!order.Lines.Any()) throw new Exception("Empty order");
        if (order.Status != OrderStatus.Draft) throw new Exception("Wrong state");
        order.Status = OrderStatus.Submitted;  // Business rule buried in service
    }
}
```

**Rich domain model (correct)**:
```csharp
public class Order : Entity
{
    private readonly List<OrderLine> _lines = new();
    public IReadOnlyList<OrderLine> Lines => _lines.AsReadOnly();
    public OrderStatus Status { get; private set; }  // Private setter
    
    public void Submit()   // Intent-revealing method, enforces invariants
    {
        if (Status != OrderStatus.Draft)
            throw new DomainException($"Cannot submit order in {Status} state");
        if (!_lines.Any())
            throw new DomainException("Cannot submit an empty order");
        
        Status = OrderStatus.Submitted;
        _domainEvents.Add(new OrderSubmittedEvent(Id, CustomerId));
    }
}
```

**Why it matters**: With the rich model, the business rule about draft status lives in one place and can be unit-tested without the database. With the anemic model, the rule may be duplicated across multiple service methods and drift over time.

### Red Flags
- "Anemic models are fine if you have good service classes" — misses the point about testability and single source of truth
- Not being able to articulate what goes wrong with anemic models in practice

---

## Question 6: "How Do You Design Value Objects in .NET?"

### 30-Second Answer
A value object is defined by its attributes, not its identity. In C#, use records — they provide structural equality out of the box. Include validation in the primary constructor. Map to EF Core using OwnsOne for multi-property value objects or HasConversion for single-value types.

### Strong Answer
```csharp
// Money as a C# record — structural equality, immutability
public record Money(decimal Amount, string Currency)
{
    public Money  // Validation in constructor body
    {
        if (Amount < 0) throw new ArgumentException("Amount cannot be negative");
        if (string.IsNullOrWhiteSpace(Currency)) throw new ArgumentException("Currency required");
    }
    
    public Money Add(Money other) {
        if (Currency != other.Currency) 
            throw new InvalidOperationException("Currency mismatch");
        return this with { Amount = Amount + other.Amount };
    }
}
```

Two Money instances with the same Amount and Currency are equal — `==` returns true. This is the correct semantics for a value object.

**EF Core mapping**:
```csharp
builder.OwnsOne(o => o.Total, money => {
    money.Property(m => m.Amount).HasColumnName("TotalAmount").HasPrecision(18,2);
    money.Property(m => m.Currency).HasColumnName("TotalCurrency").HasMaxLength(3);
});
```

**When to use a value object vs entity**: If you would ever ask "is this the same money *instance*?" you have an entity. If "same value = same thing" is always correct, it is a value object.

---

## Quick-Fire Answers

**"What is ubiquitous language?"**
The shared vocabulary between developers and domain experts, reflected in the code. If the business calls it a "Referral" not a "Recommendation", the code should have a `Referral` class, not a `Recommendation` class. Mismatches between code names and business names are a constant source of miscommunication.

**"What is the difference between DDD and Clean Architecture?"**
Clean Architecture is a project structure pattern — it defines layers (domain, application, infrastructure, presentation) and dependency rules (inner layers don't depend on outer layers). DDD is a design philosophy for the domain layer — how to model aggregates, entities, value objects, and domain services. They complement each other: DDD tells you what goes in the domain layer, Clean Architecture tells you how to structure the project.

**"When is DDD overkill?"**
CRUD applications with thin business logic. If your domain is mostly "store this form data and display it", DDD ceremony adds cost without benefit. The signal DDD is worth it: complex state transitions, rich invariants, multiple development teams, long-lived system where the business rules evolve frequently.

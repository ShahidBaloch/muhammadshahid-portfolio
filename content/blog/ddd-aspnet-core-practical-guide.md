---
title: "Domain-Driven Design in ASP.NET Core: A Practical Guide"
description: "Apply DDD in ASP.NET Core with aggregates, value objects, domain services, and application services. Know when it is worth the complexity."
date: "2026-10-07"
category: "architecture"
tags: ["DDD", "Domain-Driven Design", "ASP.NET Core", ".NET", "Architecture", "Clean Architecture"]
faq:
  - q: "What is Domain-Driven Design in .NET?"
    a: "DDD is a software approach where code directly models the business domain. In .NET, aggregates enforce business invariants, value objects carry domain concepts like Money, and application handlers orchestrate without containing business logic. The domain project has no EF Core or ASP.NET Core references."
  - q: "What is the difference between an entity and a value object in DDD?"
    a: "An entity has identity — two orders are the same order if they share an ID. A value object has no identity — two Money(49.99, GBP) are equal because their values match. In C#, entities are classes with private setters; value objects are records."
  - q: "When should I NOT use DDD in ASP.NET Core?"
    a: "Avoid DDD for CRUD-heavy systems with minimal business logic, small MVPs, data pipelines, and reporting tools. The ceremony of aggregates costs more than it earns when there are no complex business rules to enforce."
---

## Why Use DDD

Without DDD, business logic migrates into controllers, service classes, and stored procedures — wherever code happens to be written. The domain model (the entities, rules, and processes that represent the business) becomes scattered and implicit. When requirements change, nobody knows where the logic lives or what will break.

DDD solves this by making business rules explicit in a dedicated domain layer. The code becomes a model of the business: the names match the business language, the rules live in the objects they govern, and changes to business rules map directly to code changes in the domain layer.

Microsoft's [microservices guidance](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/ddd-oriented-microservice) documents DDD patterns extensively. The eShopOnContainers reference app is the canonical .NET DDD example.

## Project Layout

```text
src/
├── Clinic.Domain/
│   ├── Shared/
│   │   ├── Entity.cs                        # base class with Id + domain events list
│   │   └── ValueObject.cs                   # base with structural equality
│   ├── Patients/
│   │   ├── Patient.cs                       # aggregate root
│   │   ├── PatientId.cs                     # strongly-typed value object
│   │   └── Events/
│   │       └── PatientRegistered.cs
│   └── Appointments/
│       └── Appointment.cs                   # separate aggregate — no cross-reference to Patient
├── Clinic.Application/
│   └── Patients/
│       ├── RegisterPatientCommand.cs
│       └── RegisterPatientHandler.cs        # loads aggregate, calls domain, saves
├── Clinic.Infrastructure/
│   └── Patients/
│       └── PatientRepository.cs
└── Clinic.Data/
    └── Patients/
        └── PatientConfiguration.cs          # EF Core Fluent API — domain project has no EF ref
```

Domain project has no EF Core, no ASP.NET Core, no MediatR references. It is pure C# business logic.

---

## The Core Building Blocks

### Entities

An entity is an object with a unique identity that persists over time. Two entities are the same if they have the same ID, regardless of their other attributes.

```csharp
// Entity base class — identity-based equality
public abstract class Entity
{
    public Guid Id { get; protected set; }
    
    protected Entity() => Id = Guid.NewGuid();
    protected Entity(Guid id) => Id = id;
    
    public override bool Equals(object? obj) =>
        obj is Entity other && GetType() == other.GetType() && Id == other.Id;
    
    public override int GetHashCode() => HashCode.Combine(GetType(), Id);
}

// An entity: Patient has identity, state changes over time
public class Patient : Entity
{
    public string NhsNumber { get; private set; }
    public string FullName { get; private set; }
    public DateOnly DateOfBirth { get; private set; }
    
    private Patient() { } // EF Core
    
    public Patient(string nhsNumber, string fullName, DateOnly dateOfBirth)
    {
        NhsNumber = nhsNumber;
        FullName = fullName;
        DateOfBirth = dateOfBirth;
    }
}
```

### Value Objects

A value object has no identity — two value objects are equal if all their properties are equal. A postal address, a money amount, an NHS number format are all value objects.

```csharp
// Value object: equality by value, not identity
public record Money(decimal Amount, string Currency)
{
    public static Money GBP(decimal amount) => new(amount, "GBP");
    public static Money USD(decimal amount) => new(amount, "USD");
    
    public Money Add(Money other)
    {
        if (Currency != other.Currency)
            throw new InvalidOperationException(
                $"Cannot add {Currency} and {other.Currency}");
        return new Money(Amount + other.Amount, Currency);
    }
    
    // Validation in constructor
    public Money
    {
        if (Amount < 0)
            throw new ArgumentException("Money amount cannot be negative");
        if (string.IsNullOrWhiteSpace(Currency))
            throw new ArgumentException("Currency is required");
    }
}

// Usage — no need to check if two Money amounts are "the same object"
var price = Money.GBP(49.99m);
var tax = Money.GBP(10.00m);
var total = price.Add(tax); // Money.GBP(59.99)
```

### Aggregate Roots

An aggregate is a cluster of entities and value objects treated as a single unit for data changes. The aggregate root is the entry point — the only object that external code can hold a reference to.

Rules:
- External code interacts only with the aggregate root
- The root enforces all invariants for the aggregate
- Persistence loads and saves the entire aggregate as one unit

```csharp
public class Order : Entity  // Order is the aggregate root
{
    public Guid CustomerId { get; private set; }
    public OrderStatus Status { get; private set; }
    public Money Total { get; private set; }
    
    private readonly List<OrderLine> _lines = new();
    public IReadOnlyList<OrderLine> Lines => _lines.AsReadOnly();
    
    private readonly List<DomainEvent> _domainEvents = new();
    public IReadOnlyList<DomainEvent> DomainEvents => _domainEvents.AsReadOnly();
    
    private Order() { } // EF Core
    
    public static Order Create(Guid customerId, IEnumerable<OrderLineRequest> lines)
    {
        if (!lines.Any())
            throw new DomainException("Order must have at least one line");
        
        var order = new Order
        {
            CustomerId = customerId,
            Status = OrderStatus.Draft
        };
        
        foreach (var line in lines)
            order.AddLine(line.ProductId, line.Quantity, line.UnitPrice);
        
        order._domainEvents.Add(new OrderCreatedEvent(order.Id, customerId));
        return order;
    }
    
    public void AddLine(Guid productId, int quantity, Money unitPrice)
    {
        if (Status != OrderStatus.Draft)
            throw new DomainException("Cannot add lines to a non-draft order");
        
        var existing = _lines.FirstOrDefault(l => l.ProductId == productId);
        if (existing != null)
        {
            existing.IncreaseQuantity(quantity);
        }
        else
        {
            _lines.Add(new OrderLine(productId, quantity, unitPrice));
        }
        
        RecalculateTotal();
    }
    
    public void Submit()
    {
        if (Status != OrderStatus.Draft)
            throw new DomainException($"Cannot submit order in {Status} state");
        if (!_lines.Any())
            throw new DomainException("Cannot submit an empty order");
        
        Status = OrderStatus.Submitted;
        _domainEvents.Add(new OrderSubmittedEvent(Id, CustomerId, Total));
    }
    
    private void RecalculateTotal()
    {
        Total = _lines.Aggregate(
            Money.GBP(0),
            (acc, line) => acc.Add(line.LineTotal));
    }
    
    public void ClearDomainEvents() => _domainEvents.Clear();
}

// OrderLine is an entity inside the Order aggregate
// External code cannot hold a reference to OrderLine directly
public class OrderLine : Entity
{
    public Guid ProductId { get; private set; }
    public int Quantity { get; private set; }
    public Money UnitPrice { get; private set; }
    public Money LineTotal => new(UnitPrice.Amount * Quantity, UnitPrice.Currency);
    
    private OrderLine() { } // EF Core
    
    internal OrderLine(Guid productId, int quantity, Money unitPrice)
    {
        ProductId = productId;
        Quantity = quantity;
        UnitPrice = unitPrice;
    }
    
    internal void IncreaseQuantity(int additional)
    {
        if (additional <= 0) throw new DomainException("Quantity must be positive");
        Quantity += additional;
    }
}
```

---

## Application Services vs Domain Services

### Application Services

Application services (command handlers in a CQRS system) orchestrate domain objects to fulfil a use case. They:
- Receive a command (DTO from the API layer)
- Load the aggregate from the repository
- Call domain methods
- Persist changes
- Dispatch domain events
- Do NOT contain business rules

```csharp
// Application service (command handler)
public class SubmitOrderCommandHandler : ICommandHandler<SubmitOrderCommand>
{
    private readonly IOrderRepository _orders;
    private readonly IPublishEndpoint _eventBus;
    
    public async Task Handle(SubmitOrderCommand command, CancellationToken ct)
    {
        var order = await _orders.GetByIdAsync(command.OrderId, ct)
            ?? throw new NotFoundException($"Order {command.OrderId} not found");
        
        // Business rule lives in the domain, not here
        order.Submit();
        
        await _orders.SaveAsync(order, ct);
        
        // Dispatch domain events as integration events
        foreach (var domainEvent in order.DomainEvents)
            await _eventBus.Publish(domainEvent, ct);
        
        order.ClearDomainEvents();
    }
}
```

### Domain Services

A domain service contains business logic that involves multiple aggregates or does not naturally belong to a single entity. If a business rule requires checking data from two different aggregates, it belongs in a domain service.

```csharp
// Domain service: pricing logic that spans Product and Customer aggregates
public class OrderPricingDomainService
{
    private readonly ICustomerRepository _customers;
    private readonly IPromotionRepository _promotions;
    
    public async Task<Money> CalculateTotalAsync(Order order, CancellationToken ct)
    {
        var customer = await _customers.GetByIdAsync(order.CustomerId, ct);
        var promotions = await _promotions.GetActiveForCustomerAsync(order.CustomerId, ct);
        
        var baseTotal = order.Lines.Sum(l => l.LineTotal.Amount);
        
        // Business rule: NHS staff get 10% discount
        if (customer.IsNhsStaff)
            baseTotal *= 0.9m;
        
        // Business rule: first order discount
        var applicablePromotion = promotions
            .Where(p => p.IsApplicableTo(order))
            .OrderByDescending(p => p.DiscountAmount)
            .FirstOrDefault();
        
        if (applicablePromotion != null)
            baseTotal -= applicablePromotion.DiscountAmount.Amount;
        
        return Money.GBP(Math.Max(0, baseTotal));
    }
}
```

---

## Anemic Domain Model Anti-Pattern

The most common DDD mistake: entities are data bags (public getters and setters only) and all logic lives in service classes. This is CRUD with DDD terminology.

```csharp
// ANEMIC — do not do this
public class Order
{
    public Guid Id { get; set; }
    public OrderStatus Status { get; set; }  // Any code can set this directly
    public List<OrderLine> Lines { get; set; } = new();  // Any code can manipulate
}

// All logic in service class — business rules scattered, hard to find, easy to break
public class OrderService
{
    public void SubmitOrder(Order order)
    {
        if (order.Status != OrderStatus.Draft) throw new Exception("...");
        if (!order.Lines.Any()) throw new Exception("...");
        order.Status = OrderStatus.Submitted; // Duplicated in every service method
    }
}
```

The fix: move business rules into the aggregate. Properties have private setters. State can only change through intent-revealing methods that enforce invariants.

---

## EF Core Mapping for DDD Aggregates

EF Core can map DDD aggregates without compromising the domain model. Key techniques:

```csharp
public class OrderConfiguration : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.HasKey(o => o.Id);
        
        // Value object: Money mapped as owned type
        builder.OwnsOne(o => o.Total, money =>
        {
            money.Property(m => m.Amount).HasColumnName("TotalAmount");
            money.Property(m => m.Currency).HasColumnName("TotalCurrency").HasMaxLength(3);
        });
        
        // Private collection: EF Core uses field-based access
        builder.HasMany(o => o.Lines)
            .WithOne()
            .HasForeignKey("OrderId");
        
        builder.Navigation(o => o.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);
        
        // Ignore domain events — they are not persisted
        builder.Ignore(o => o.DomainEvents);
    }
}
```

---

## When to Use DDD

- Complex domain with rich business rules, workflows, and state transitions
- Multiple development teams where shared language prevents miscommunication
- Long-lived system where the domain will evolve over years
- Healthcare, finance, insurance, logistics — domains where getting business rules wrong has real consequences

## When NOT to Use DDD

- CRUD-heavy systems with minimal business logic (form → database → response)
- Small teams or startup MVPs where delivery speed matters more than architecture
- Data pipeline systems, reporting tools, admin backends — no complex domain model
- When the team is not familiar with DDD — ceremony without understanding creates more problems than it solves

## Trade-offs

| Benefit | Cost / Risk |
|---|---|
| Business rules live in one place and are testable in isolation | Steep learning curve for teams new to DDD |
| Ubiquitous language reduces communication gaps between devs and domain experts | More code and ceremony than CRUD |
| Aggregates enforce consistency boundaries — easier to reason about correctness | Wrong aggregate boundaries are expensive to fix later |
| Domain model survives technology changes (EF Core is persistence detail) | EF Core mapping complexity for DDD-correct models |

---

## If an Interviewer Asks...

**"What is the difference between an entity and a value object?"**

An entity has an identity that persists over time — two orders are the same order if they have the same ID, even if their status changed. A value object has no identity — two Money(49.99, GBP) instances are equal because their values are equal, regardless of which object reference you have. In C#, value objects are best modelled as records; entities as classes with private setters and a domain-controlled lifecycle.

---

## Key Concepts
- **Aggregate**: A cluster of entities and value objects with a root that controls all access and enforces invariants
- **Aggregate root**: The entry point for an aggregate; the only object external code holds a reference to
- **Value object**: An object defined by its attributes, not its identity; immutable in C#
- **Domain service**: Business logic involving multiple aggregates that does not belong to a single entity
- **Application service**: Orchestration layer that loads aggregates, calls domain methods, and persists changes
- **Ubiquitous language**: A shared vocabulary between developers and domain experts that is reflected in the code
- **Anemic domain model**: Anti-pattern where entities are data bags and all logic lives in service classes

---
title: "Domain Services vs Application Services in .NET"
description: "Understand domain services vs application services in .NET DDD. Fix the anemic domain model and know where each type of business logic belongs."
date: "2026-10-07"
category: "architecture"
tags: ["DDD", "Domain Services", "Application Services", ".NET", "Clean Architecture", "CQRS"]
---

## Why This Distinction Matters

Without clear rules for where logic belongs, every developer puts business logic wherever feels convenient. Some in the controller, some in an `OrderService`, some in a stored procedure, some in the aggregate. The result is duplicated logic, logic that is difficult to test (because it is coupled to HTTP or database), and logic that silently diverges as the codebase grows.

Understanding the three layers — domain objects, domain services, and application services — means every business rule has exactly one home.

Microsoft's [DDD microservices guidance](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design) covers application service design and the distinction from domain services.

## Project Layout

```text
src/
├── Clinic.Domain/
│   └── Services/
│       └── PricingDomainService.cs          # multi-aggregate business rule; no HTTP, no EF Core
├── Clinic.Application/
│   └── Orders/
│       ├── CreateOrderCommand.cs
│       └── CreateOrderHandler.cs            # application service: loads, calls domain, saves, publishes
└── Clinic.Infrastructure/
    └── ExternalPricing/
        └── PricingApiClient.cs              # infrastructure service: HTTP call, maps to domain Money type
```

Domain services live in `Clinic.Domain/Services`. They depend only on other domain types. Application handlers orchestrate — they call domain services and repositories but contain no business rules themselves.

---

## The Three Layers and What Belongs Where

```
┌─────────────────────────────────────────────────────────┐
│  Application Layer (Command Handlers)                   │
│  - Orchestration: load aggregate, call domain, save     │
│  - No business logic                                    │
│  - Depends on repositories and message bus              │
├─────────────────────────────────────────────────────────┤
│  Domain Services                                        │
│  - Business logic involving multiple aggregates         │
│  - Stateless; no HTTP, no EF Core                       │
│  - Depends only on domain objects and interfaces        │
├─────────────────────────────────────────────────────────┤
│  Domain Objects (Entities, Aggregates, Value Objects)   │
│  - Business rules for a single aggregate                │
│  - Invariants, state transitions, calculations          │
│  - No infrastructure dependencies                      │
└─────────────────────────────────────────────────────────┘
```

---

## Domain Objects: Single-Aggregate Business Rules

Rules that govern a single aggregate belong in the aggregate itself. The aggregate enforces its own invariants.

```csharp
public class Appointment : Entity
{
    public Guid PatientId { get; private set; }
    public Guid CliniciandId { get; private set; }
    public DateTimeOffset ScheduledAt { get; private set; }
    public AppointmentStatus Status { get; private set; }
    
    // Business rule: cannot cancel a completed appointment
    // Business rule: must notify if cancellation is within 24 hours
    public CancellationResult Cancel(string reason, DateTimeOffset now)
    {
        if (Status == AppointmentStatus.Completed)
            throw new DomainException("Cannot cancel a completed appointment");
        
        if (Status == AppointmentStatus.Cancelled)
            throw new DomainException("Appointment is already cancelled");
        
        var isLateNotice = (ScheduledAt - now).TotalHours < 24;
        
        Status = AppointmentStatus.Cancelled;
        CancelledAt = now;
        CancellationReason = reason;
        
        _domainEvents.Add(new AppointmentCancelledEvent(
            Id, PatientId, ScheduledAt, reason, isLateNotice));
        
        return new CancellationResult(IsLateNotice: isLateNotice);
    }
}
```

**Rule**: If the logic only needs data from one aggregate, it belongs in that aggregate.

---

## Domain Services: Multi-Aggregate Business Rules

A domain service contains business logic that inherently involves multiple aggregates and cannot naturally belong to any one of them.

```csharp
// Booking availability logic requires both Clinician and Appointment aggregates
public class AppointmentAvailabilityDomainService
{
    private readonly IAppointmentRepository _appointments;
    private readonly IClinicianRepository _clinicians;
    
    // Business rule: clinician must be active, slot must be within their schedule,
    // and no overlapping appointments within 30 minutes
    public async Task<bool> IsSlotAvailableAsync(
        Guid clinicianId,
        DateTimeOffset proposedTime,
        CancellationToken ct)
    {
        var clinician = await _clinicians.GetByIdAsync(clinicianId, ct)
            ?? throw new DomainException($"Clinician {clinicianId} not found");
        
        if (!clinician.IsAvailableAt(proposedTime))
            return false;
        
        var windowStart = proposedTime.AddMinutes(-30);
        var windowEnd = proposedTime.AddMinutes(30);
        
        var conflictingAppointments = await _appointments
            .GetForClinicianInRangeAsync(clinicianId, windowStart, windowEnd, ct);
        
        return !conflictingAppointments.Any(a => 
            a.Status != AppointmentStatus.Cancelled);
    }
}
```

**Rule**: If the logic needs data from multiple aggregates, extract it to a domain service. The domain service is stateless — it does not hold any state between calls.

---

## Application Services: Orchestration Without Business Logic

Application services (command handlers) are the use case layer. They orchestrate: load the right aggregates, call the right domain methods, save changes, and dispatch events. They contain no business rules themselves.

```csharp
public class CancelAppointmentCommandHandler 
    : ICommandHandler<CancelAppointmentCommand, CancellationResult>
{
    private readonly IAppointmentRepository _appointments;
    private readonly IPublishEndpoint _eventBus;
    
    public async Task<CancellationResult> Handle(
        CancelAppointmentCommand command, 
        CancellationToken ct)
    {
        // Orchestration step 1: load
        var appointment = await _appointments.GetByIdAsync(command.AppointmentId, ct)
            ?? throw new NotFoundException($"Appointment {command.AppointmentId} not found");
        
        // Orchestration step 2: authorise
        if (appointment.PatientId != command.RequestingPatientId)
            throw new UnauthorisedException("You cannot cancel another patient's appointment");
        
        // Orchestration step 3: call domain — business rule lives in the aggregate
        var result = appointment.Cancel(command.Reason, DateTime.UtcNow);
        
        // Orchestration step 4: persist
        await _appointments.SaveAsync(appointment, ct);
        
        // Orchestration step 5: dispatch events
        foreach (var @event in appointment.DomainEvents)
            await _eventBus.Publish(@event, ct);
        
        appointment.ClearDomainEvents();
        
        return result;
    }
}
```

**What an application service should NOT contain:**
- `if (appointment.ScheduledAt - now < TimeSpan.FromHours(24))` — that is a domain rule
- Complex calculations over aggregate properties — that belongs in the aggregate or domain service
- Direct database queries that compute business answers — that belongs in a query handler or domain service

---

## The Anemic Domain Model Anti-Pattern

An anemic domain model is one where entities are pure data structures with no behaviour. All logic lives in service classes. The domain model is effectively a DTO.

```csharp
// ANEMIC — entities are data bags
public class Order
{
    public Guid Id { get; set; }
    public OrderStatus Status { get; set; }  // Direct setter — anyone can set any state
    public decimal Total { get; set; }
    public List<OrderLine> Lines { get; set; } = new();
}

// All logic scattered in service classes — duplicated, no single home
public class OrderService
{
    public void SubmitOrder(Order order)
    {
        if (!order.Lines.Any()) throw new Exception("No lines");
        if (order.Status != OrderStatus.Draft) throw new Exception("Not draft");
        order.Status = OrderStatus.Submitted; // Setting state from outside
    }
    
    public bool CanBeSubmitted(Order order)
    {
        return order.Status == OrderStatus.Draft && order.Lines.Any();
        // This logic is DUPLICATED from SubmitOrder — two sources of truth
    }
}
```

**Symptoms of an anemic model:**
- Methods in your service classes that take an entity and set its properties
- The same business rule appears in multiple service methods
- Entities have only public getters and setters
- Business logic cannot be tested without database access

**The fix**: Move behaviour into the aggregate. Use private setters. Make state transitions explicit methods that enforce invariants.

---

## Practical Placement Decision

Ask these questions to find where logic belongs:

| Question | Where it belongs |
|---|---|
| Does it only touch one aggregate's data? | Inside the aggregate method |
| Does it coordinate between multiple aggregates? | Domain service |
| Does it load aggregates, call methods, and save? | Application service (command handler) |
| Does it read data for display purposes? | Query handler (read side) |
| Is it infrastructure (email, HTTP, file system)? | Infrastructure layer, behind an interface |

---

## When to Use Domain Services (vs Not)

## When to Use

- Pricing logic that spans products, promotions, and customer tier
- Conflict detection across multiple aggregates (booking availability)
- Business rules that require reading data from multiple domain objects before deciding

## When NOT to Use

- Putting every bit of domain logic in a "domain service" (anemic model via services)
- Putting infrastructure concerns (email, SMS) in the domain service (use application services and interfaces instead)
- Using domain services as a dumping ground for logic that does not fit neatly — question whether the aggregate is designed correctly

## Trade-offs

| Benefit | Cost / Risk |
|---|---|
| Clear boundaries — every rule has one home | Requires discipline to maintain (easy to slip logic into wrong layer) |
| Domain logic is testable without infrastructure | More layers to navigate and understand |
| Application services are thin and readable | Some judgment calls are not obvious — team needs shared understanding |
| Domain model survives framework/ORM changes | Initial ceremony is higher than a simple service class |

---

## If an Interviewer Asks...

**"What is the anemic domain model and how do you fix it?"**

An anemic domain model is one where the entities are just data structures with getters and setters, and all the business logic lives in service classes that operate on those entities. The problem is that business rules are duplicated, scattered, and easy to miss — there is no single place to look for what an Order can and cannot do. The fix is to move business rules into the aggregate itself: use private setters, make state transitions explicit methods, and enforce invariants in those methods. The aggregate becomes the authoritative source for what is and is not valid — you cannot put it in an invalid state from outside.

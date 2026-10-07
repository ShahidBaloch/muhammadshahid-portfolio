---
title: "Bounded Contexts in .NET: Drawing the Right Boundaries"
description: "Define bounded contexts in .NET with context maps, anti-corruption layers, and the relationship between bounded contexts and microservices."
date: "2026-10-07"
category: "architecture"
tags: ["Bounded Contexts", "DDD", ".NET", "Microservices", "Domain-Driven Design", "Architecture"]
faq:
  - q: "What is a bounded context in .NET DDD?"
    a: "A bounded context is an explicit boundary within which a specific domain model is consistent and unambiguous. In .NET, this is often a separate project or module with its own DbContext, entities, and migrations. The Sales context has an Account; the Billing context has a BillingAccount — same real-world thing, different models for different purposes."
  - q: "Is a bounded context the same as a microservice?"
    a: "No. A bounded context is a logical model boundary; a microservice is a deployment boundary. One microservice can contain multiple bounded contexts as modules. Extract a bounded context to its own microservice only when the deployment, scaling, or team ownership requirements demand it."
  - q: "How do bounded contexts communicate in .NET?"
    a: "Through integration events (published on a message bus) or Anti-Corruption Layer adapters (for synchronous calls). Bounded contexts must never share entity classes or DbContexts directly. Shared code belongs in a Contracts project containing only event schemas."
---

## Why Bounded Contexts Exist

Without explicit boundaries, different parts of a system use the same word to mean different things. "Customer" to the sales team means a lead that became a paying account. "Customer" to the billing team means a legal entity with a payment method and invoicing address. "Customer" to the support team means a contact record with a ticket history.

When a single `Customer` class tries to satisfy all three, it accumulates every field any context needs. It becomes a God Object that satisfies no context particularly well and couples all three contexts to the same change cycle.

Bounded contexts solve this by giving each context its own model. The sales context has a `Prospect` that becomes an `Account`. The billing context has a `BillingAccount` with payment terms. The support context has a `Contact`. Each model is optimised for its context, owned by its team, and evolved independently.

Microsoft's [microservices architecture guide](https://learn.microsoft.com/en-us/azure/architecture/microservices/model/bounded-context) covers bounded context identification and mapping in .NET systems.

## Project Layout

Three bounded contexts as modules in a modular monolith (can extract to separate services later):

```text
src/
├── Clinic.Sales/
│   ├── Clinic.Sales.csproj
│   └── Accounts/
│       ├── Account.cs                       # "Customer" in sales language — becomes paying account
│       └── AccountRepository.cs
├── Clinic.Billing/
│   ├── Clinic.Billing.csproj
│   └── Accounts/
│       ├── BillingAccount.cs               # "Customer" in billing — has payment terms and invoices
│       └── BillingAccountRepository.cs
├── Clinic.Support/
│   ├── Clinic.Support.csproj
│   └── Contacts/
│       ├── Contact.cs                       # "Customer" in support — contact history + tickets
│       └── ContactRepository.cs
└── Clinic.Contracts/                        # integration events crossing context boundaries
    └── AccountActivated.cs                  # published by Sales; consumed by Billing + Support
```

Each context has its own `DbContext`, its own migrations, and its own team ownership. `Clinic.Contracts` is the only shared assembly — it contains only integration events, never domain types.

---

## What a Bounded Context Is

A bounded context is a boundary within which a specific domain model is consistent and unambiguous. Inside the boundary, terms have precise meanings. Outside the boundary, the same term may mean something different, and that is correct — they are different models.

```
┌─────────────────────────────────────────────────────────┐
│  Sales Context          │  Billing Context              │
│                         │                               │
│  "Customer" =           │  "Customer" =                 │
│  Account with           │  BillingAccount with          │
│  lead source,           │  payment method,              │
│  opportunity stage,     │  VAT number,                  │
│  contract value         │  credit limit                 │
│                         │                               │
└─────────────────────────────────────────────────────────┘
```

The same real-world concept maps to different models because each context needs different information and behaviour.

---

## Context Maps: How Contexts Relate

A context map documents the relationships between bounded contexts. The main patterns:

### Shared Kernel
Two contexts share a subset of the domain model. Changes to the shared kernel require coordination between both teams. Use it when the duplication cost is high and the contexts are closely related.

```
┌──────────────┐    Shared Kernel    ┌──────────────┐
│  Order       │◄──────────────────►│  Inventory   │
│  Context     │  (ProductId,        │  Context     │
│              │   Sku types)        │              │
└──────────────┘                     └──────────────┘
```

### Customer-Supplier
One context (upstream) produces data that another (downstream) consumes. The downstream context adapts to the upstream's model. Works when the upstream is a platform team and the downstream must accept what they provide (e.g., an internal identity service).

### Anti-Corruption Layer (ACL)
The downstream context creates a translation layer that converts the upstream model into the downstream's own model. Prevents the upstream model's concepts from polluting the downstream domain.

```csharp
// ACL: Translates legacy CRM model into our domain model
public class LegacyCrmAntiCorruptionLayer : ICustomerRepository
{
    private readonly LegacyCrmClient _crmClient;
    
    public async Task<Customer?> GetByIdAsync(CustomerId customerId, CancellationToken ct)
    {
        // Call legacy CRM (upstream model)
        var legacyRecord = await _crmClient.GetContactAsync(customerId.Value, ct);
        if (legacyRecord == null) return null;
        
        // Translate to OUR domain model — upstream concepts do not leak in
        return new Customer(
            id: CustomerId.From(legacyRecord.ContactId),
            name: $"{legacyRecord.FirstName} {legacyRecord.Surname}",
            email: EmailAddress.From(legacyRecord.PrimaryEmail),
            tier: MapTier(legacyRecord.AccountCategory));
    }
    
    private CustomerTier MapTier(string legacyCategory) => legacyCategory switch
    {
        "PREM" => CustomerTier.Premium,
        "STD" => CustomerTier.Standard,
        _ => CustomerTier.Standard
    };
}
```

### Conformist
The downstream context adapts to the upstream without a translation layer. No ACL. Use when translation cost is higher than the cost of adopting the upstream model (e.g., integrating with a well-designed partner API you cannot influence).

### Open Host Service / Published Language
The upstream context publishes a stable API and schema specifically for downstream consumers to use. Bounded context publishes integration events with a schema that consumers can depend on.

---

## Bounded Contexts and Microservices

A common mistake: assuming one bounded context = one microservice. This is not always correct.

**A bounded context is a model boundary.** A microservice is a deployment boundary. They are orthogonal concerns.

A single microservice can contain multiple bounded contexts (a monolith contains many). A bounded context can span multiple microservices (rare, but possible when scaling requires splitting a context). The correct starting point is a modular monolith where each module is a bounded context. Decompose into microservices when you have a specific reason (independent deployment, scaling, team autonomy).

```
┌──────────────────────────────────────────────────────────┐
│ Monolith / Modular Monolith                              │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  Orders     │  │  Inventory  │  │  Billing    │     │
│  │  Context    │  │  Context    │  │  Context    │     │
│  │             │  │             │  │             │     │
│  │  /Orders/   │  │  /Inventory │  │  /Billing/  │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│                                                          │
│  Clear boundaries, shared process, separate models       │
└──────────────────────────────────────────────────────────┘
```

---

## Identifying Bounded Context Boundaries

Practical techniques:

**Follow the language boundaries**: When the business experts use a word differently in two conversations, you have a boundary. "Patient" means different things to scheduling and to clinical care — that is a boundary.

**Follow the team boundaries**: Each team should own their context fully, without needing permission from another team to make changes.

**Follow the data lifecycle**: Who creates it? Who updates it? Who is the system of record? Ownership defines the context boundary.

**Transactions as a signal**: If two operations must always succeed or fail together, they probably belong in the same context. If they can eventually be consistent, they can be in different contexts.

---

## In Code: Enforcing Context Boundaries

In a modular monolith, enforce context isolation by project or namespace boundaries:

```
/src
  /Orders           ← Orders bounded context
    /Domain
    /Application
    /Infrastructure
  /Inventory        ← Inventory bounded context (its own model)
    /Domain
    /Application
    /Infrastructure
  /Shared
    /IntegrationEvents  ← Cross-context contracts only
```

Cross-context communication goes through integration events or explicit API contracts, never through direct repository access across modules:

```csharp
// WRONG: Inventory context directly depends on Orders domain model
// This breaks the boundary — Inventory now knows about Order internals
public class InventoryService
{
    private readonly IOrderRepository _orderRepo; // Cross-context dependency!
    
    public async Task ReserveForOrderAsync(Order order) { ... }
}

// CORRECT: Inventory context responds to an integration event with its own model
public class OrderSubmittedIntegrationEventHandler 
    : IConsumer<OrderSubmittedIntegrationEvent>
{
    public async Task Consume(ConsumeContext<OrderSubmittedIntegrationEvent> context)
    {
        // Integration event is the contract — does not expose Orders domain model
        var reservation = new InventoryReservation(
            orderId: context.Message.OrderId,
            items: context.Message.Items.Select(i => 
                new ReservationItem(i.Sku, i.Quantity)).ToList());
        
        await _inventory.ReserveAsync(reservation, context.CancellationToken);
    }
}
```

---

## When to Use Bounded Contexts (Explicit Boundary Design)

- Systems with more than 2-3 development teams where unintentional coupling causes coordination overhead
- Domains where the same word means genuinely different things in different parts of the business
- When integrating with legacy systems or external APIs that should not pollute the internal model
- Before decomposing a monolith into microservices — define the boundaries first in the monolith

## When NOT to Invest Heavily in Bounded Context Design

- Small teams (1-3 developers) where informal coordination works
- Simple CRUD applications where the domain model is thin
- Early-stage products where the domain is not yet stable — boundaries change as the business learns
- Systems that are pure integrations/adapters without significant business logic

## Trade-offs

| Benefit | Cost / Risk |
|---|---|
| Teams work independently — no cross-team coordination for internal changes | Each context has its own model — some duplication of concepts |
| Domain model is optimised for its context (no God Objects) | Context maps and ACLs add design overhead |
| Integration events create stable contracts between contexts | Eventual consistency between contexts — cross-context queries require projections |
| Modular structure enables independent deployment when needed | Wrong boundaries are expensive to fix — context design requires upfront investment |

---

## If an Interviewer Asks...

**"How do you decide where to draw microservice boundaries?"**

I start with bounded contexts, not deployment units. I look at where the business language shifts — where the same word means something different to different teams or processes. Those language boundaries are usually the right service boundaries. I avoid splitting a bounded context across multiple services because that reintroduces the distributed transaction problem without the benefit of independent deployment. Better to have a single service per context initially, in a modular monolith, and extract to microservices only when there is a clear scaling, deployment, or team autonomy reason.

---
title: "Aggregate Design in .NET: Sizing and Boundaries"
description: "Design aggregates in .NET DDD — how to size them, avoid concurrency conflicts, when to split, and implement optimistic concurrency with EF Core."
date: "2026-10-07"
category: "architecture"
tags: ["DDD", "Aggregates", ".NET", "EF Core", "Domain-Driven Design", "Concurrency"]
---

## Why Aggregate Size Matters

The biggest practical mistake in DDD aggregate design is making aggregates too large. A large aggregate that encompasses too many concepts causes:

1. **Concurrency conflicts**: Two users editing different parts of the same aggregate fail with optimistic concurrency exceptions because they are updating the same row
2. **Performance**: Loading the entire aggregate (including all its children) for every operation, even operations that touch only one part
3. **Transactional coupling**: Unrelated business operations become a single transaction

The rule: make aggregates as small as possible while still maintaining invariants.

---

## Project Structure

```
src/
  Orders/
    Domain/
      Aggregates/
        Order.cs              ← aggregate root
        OrderLine.cs          ← entity within Order aggregate
      ValueObjects/
        Money.cs
        OrderStatus.cs        ← strongly-typed status
      Events/
        OrderCreated.cs
        OrderSubmitted.cs
        OrderLineAdded.cs
      Exceptions/
        DomainException.cs
      Repositories/
        IOrderRepository.cs   ← interface, defined in domain
    Infrastructure/
      Persistence/
        OrderConfiguration.cs ← EF Core mapping
        EfCoreOrderRepository.cs
```

---

## Invariants Define Aggregate Boundaries

An aggregate exists to enforce a set of invariants — business rules that must always be true. The aggregate root is responsible for all invariants within its boundary.

**The right boundary question**: "Which objects must change together to maintain consistency?"

For an `Order`:
- An `OrderLine` cannot exist without its `Order`
- Adding a line to a submitted order is invalid
- The order total must equal the sum of line totals

All three invariants require coordinated changes. `Order` and `OrderLine` must be in the same aggregate.

**The wrong boundary**: Including `Customer` in the `Order` aggregate because "an order belongs to a customer." The customer's data does not need to change when an order line is added. They are different aggregates that reference each other by ID.

```csharp
public class Order : Entity
{
    public CustomerId CustomerId { get; private set; }  // Reference by ID only — not Customer object
    public OrderStatus Status { get; private set; }
    
    private readonly List<OrderLine> _lines = new();
    public IReadOnlyList<OrderLine> Lines => _lines.AsReadOnly();
    
    // Row version for optimistic concurrency
    public byte[]? RowVersion { get; private set; }
}
```

---

## The Too-Large Aggregate Problem

Consider a naive `ShoppingCart` aggregate that includes all active promotions, recently viewed items, and saved addresses:

```csharp
// PROBLEMATIC: Too large
public class Cart : Entity
{
    private readonly List<CartItem> _items = new();
    private readonly List<SavedAddress> _savedAddresses = new();   // Unrelated to cart invariants
    private readonly List<RecentlyViewedItem> _recentlyViewed = new(); // Unrelated to cart invariants
    private readonly List<AppliedPromotion> _promotions = new();
}
```

Problems:
- User A adds an item (modifies `_items`) while User B updates a saved address (modifies `_savedAddresses`) — same aggregate root, optimistic concurrency conflict, one user's update is rejected
- Loading a cart loads all addresses and all recently viewed items — expensive
- "Apply promotion" and "add item" are coupled in the same transaction

**Split by invariant boundary**:
```csharp
public class Cart : Entity          // Invariant: total = sum of items
{
    private readonly List<CartItem> _items = new();
    // Reference SavedAddress by ID, not object
    public AddressId? SelectedShippingAddressId { get; private set; }
}

public class CustomerProfile : Entity  // Separate aggregate — no overlap with Cart invariants
{
    private readonly List<SavedAddress> _savedAddresses = new();
    private readonly List<RecentlyViewedItem> _recentlyViewed = new();
}
```

Now users can update addresses and add cart items concurrently without conflict.

---

## Optimistic Concurrency with EF Core

EF Core `[Timestamp]` or `IsConcurrencyToken()` implements optimistic concurrency for aggregates.

```csharp
public class Order : Entity
{
    // ... properties
    
    [Timestamp]  // EF Core automatically includes this in WHERE clause on UPDATE
    public byte[]? RowVersion { get; private set; }
}

// EF Core mapping (alternative to attribute)
builder.Property(o => o.RowVersion)
    .IsRowVersion()   // SQL Server ROWVERSION / TIMESTAMP type
    .IsConcurrencyToken();
```

When two requests load the same order and both try to save:
1. Request A saves: `UPDATE Orders SET Status='Submitted', RowVersion=0x... WHERE Id=X AND RowVersion=0xABCD`
2. Request B tries to save: `UPDATE Orders SET ... WHERE Id=X AND RowVersion=0xABCD` — fails (RowVersion changed)
3. EF Core throws `DbUpdateConcurrencyException`

```csharp
public async Task SubmitOrderAsync(Guid orderId, CancellationToken ct)
{
    var order = await _db.Orders
        .Include(o => o.Lines)
        .FirstOrDefaultAsync(o => o.Id == orderId, ct)
        ?? throw new NotFoundException();
    
    order.Submit();
    
    try
    {
        await _db.SaveChangesAsync(ct);
    }
    catch (DbUpdateConcurrencyException)
    {
        // Another request modified this order — reload and retry, or return conflict
        throw new DomainException("The order was modified by another request. Please try again.");
    }
}
```

---

## Aggregate Reference Rules

Two rules for referencing between aggregates:

**Rule 1**: Never hold an object reference to another aggregate — only reference by ID.
```csharp
// WRONG: Order holds a Customer object — now Order and Customer are tightly coupled
public class Order
{
    public Customer Customer { get; private set; }  // Cross-aggregate object reference
}

// CORRECT: Reference by ID
public class Order
{
    public CustomerId CustomerId { get; private set; }  // ID only
}
```

**Rule 2**: Load one aggregate at a time. Application services load each aggregate from its own repository. No joining across aggregate boundaries in the repository.

---

## Sizing Guidelines

| Signal | What to do |
|---|---|
| "This operation only touches part of the aggregate" | Consider splitting the aggregate |
| Concurrent users keep getting concurrency exceptions | Aggregate is too large; split the contentious section |
| Loading the aggregate is slow due to large child collections | Consider splitting or using lazy loading at the boundary |
| Two operations that sound related rarely need to be atomic | They may belong to different aggregates |
| A child entity has its own business identity and lifecycle | It might be a separate aggregate root |

---

## When to Use Aggregates (vs Simple CRUD)

- Complex state transitions with enforced invariants (orders, appointments, prescriptions)
- When concurrent modifications must be detected and handled
- Rich domain with behaviour in entities (not just data bags)

## When NOT to Use Full Aggregates

- Simple lookup/reference data (categories, countries, settings) — no invariants to enforce
- Log tables and audit entries — append-only, no state machine
- Report models and read projections — no mutations, no invariants

## Trade-offs

| Benefit | Cost / Risk |
|---|---|
| Invariants enforced at the code level — no inconsistent state | More code than simple CRUD |
| Optimistic concurrency prevents lost updates | Wrong boundaries cause constant concurrency conflicts or performance issues |
| Domain logic is unit-testable without database | Aggregate size requires careful thought — not obvious for beginners |
| Aggregates survive ORM changes (EF Core is an implementation detail) | EF Core mapping for private collections and value objects is more complex |

---

## If an Interviewer Asks...

**"How do you decide the boundaries of an aggregate?"**

I ask: which objects must change together to maintain a business invariant? If two things must always be consistent within a single operation, they belong in the same aggregate. If they can eventually be consistent, they are separate aggregates that communicate through domain events or IDs. The practical test: if two concurrent users updating different parts of my "aggregate" are causing concurrency exceptions, the aggregate is probably too large and should be split.

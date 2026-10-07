---
title: "CQRS + Event Sourcing in .NET: When to Use Them Together"
description: "Combine CQRS and event sourcing in .NET — projections, read models, eventual consistency on the read side, and when to use one without the other."
date: "2026-10-07"
category: "architecture"
tags: ["CQRS", "Event Sourcing", ".NET", "Architecture", "Projections", "Read Models"]
---

## Why Use CQRS and Event Sourcing Together

CQRS and event sourcing are independent patterns — you can use either without the other. But they fit together naturally: event sourcing provides the write-side consistency model (state derived from events), and CQRS provides the read-side solution to event sourcing's querying problem.

**The querying problem in pure event sourcing**: You cannot run `SELECT * FROM Orders WHERE Status = 'Shipped'` against an event store. Events are streams, not queryable rows. CQRS solves this: project events into optimised read models (denormalized SQL tables, Elasticsearch indexes, Redis hashes) that are designed for specific queries.

---

## Project Structure

```
src/
  Orders/
    WriteModel/                    ← Event-sourced write side
      Aggregates/
        Order.cs                   ← aggregate root with Apply/Raise
        OrderEvents.cs             ← all Order domain events
      Repositories/
        IOrderEventRepository.cs
      Handlers/
        PlaceOrderCommandHandler.cs
    ReadModel/                     ← Projected read side
      Projections/
        OrderSummaryProjection.cs  ← handles events, updates read tables
        ActiveOrdersProjection.cs
      Queries/
        GetOrderSummaryQuery.cs
        GetActiveOrdersQuery.cs
        GetOrderSummaryHandler.cs
    Infrastructure/
      EventStore/
        MartenEventStore.cs        ← Marten PostgreSQL event store
      Persistence/
        ReadDbContext.cs           ← Read-only EF Core context for read tables
```

---

## The Write Side: Event-Sourced Aggregate

```csharp
// Domain events — named past tense
public abstract record OrderEvent
{
    public Guid OrderId { get; init; }
    public DateTime OccurredAt { get; init; } = DateTime.UtcNow;
}

public record OrderPlaced(Guid OrderId, Guid CustomerId, Money Total, 
    IReadOnlyList<OrderLineDto> Lines) : OrderEvent;
public record OrderShipped(Guid OrderId, string TrackingNumber) : OrderEvent;
public record OrderCancelled(Guid OrderId, string Reason) : OrderEvent;

// Aggregate — state derived from event replay
public class Order
{
    public Guid Id { get; private set; }
    public Guid CustomerId { get; private set; }
    public OrderStatus Status { get; private set; }
    public Money Total { get; private set; }
    
    private readonly List<OrderEvent> _uncommittedEvents = new();
    public IReadOnlyList<OrderEvent> UncommittedEvents => _uncommittedEvents;
    
    private Order() { }  // For event replay
    
    // Factory method — raises event, state derived from Apply
    public static Order Place(Guid customerId, IReadOnlyList<OrderLineDto> lines, Money total)
    {
        var order = new Order();
        order.Raise(new OrderPlaced(
            OrderId: Guid.NewGuid(),
            CustomerId: customerId,
            Total: total,
            Lines: lines));
        return order;
    }
    
    public void Ship(string trackingNumber)
    {
        if (Status != OrderStatus.Processing)
            throw new DomainException($"Cannot ship order in {Status} state");
        Raise(new OrderShipped(Id, trackingNumber));
    }
    
    // Reconstitute from stored events
    public static Order Reconstitute(IEnumerable<OrderEvent> events)
    {
        var order = new Order();
        foreach (var @event in events)
            order.Apply(@event);
        return order;
    }
    
    private void Apply(OrderEvent @event)
    {
        switch (@event)
        {
            case OrderPlaced e:
                Id = e.OrderId;
                CustomerId = e.CustomerId;
                Total = e.Total;
                Status = OrderStatus.Pending;
                break;
            case OrderShipped:
                Status = OrderStatus.Shipped;
                break;
            case OrderCancelled:
                Status = OrderStatus.Cancelled;
                break;
        }
    }
    
    private void Raise(OrderEvent @event)
    {
        Apply(@event);
        _uncommittedEvents.Add(@event);
    }
}
```

---

## The Read Side: Projections

Projections listen to events and update denormalized read model tables. Each read model is optimised for a specific query, not a general representation.

```csharp
// Read model table — optimised for dashboard display
public class OrderSummaryReadModel
{
    public Guid OrderId { get; set; }
    public string CustomerName { get; set; }
    public decimal TotalAmount { get; set; }
    public string Status { get; set; }
    public DateTime PlacedAt { get; set; }
    public string? TrackingNumber { get; set; }
}

// Projection — subscribes to events, updates read tables
public class OrderSummaryProjection
{
    private readonly ReadDbContext _readDb;
    
    public async Task HandleAsync(OrderPlaced @event, CancellationToken ct)
    {
        // Read customer name from customer service or denormalized snapshot
        var customerName = await _customerReadRepository.GetNameAsync(@event.CustomerId, ct);
        
        _readDb.OrderSummaries.Add(new OrderSummaryReadModel
        {
            OrderId = @event.OrderId,
            CustomerName = customerName,
            TotalAmount = @event.Total.Amount,
            Status = "Pending",
            PlacedAt = @event.OccurredAt
        });
        
        await _readDb.SaveChangesAsync(ct);
    }
    
    public async Task HandleAsync(OrderShipped @event, CancellationToken ct)
    {
        var summary = await _readDb.OrderSummaries
            .FirstAsync(o => o.OrderId == @event.OrderId, ct);
        
        summary.Status = "Shipped";
        summary.TrackingNumber = @event.TrackingNumber;
        
        await _readDb.SaveChangesAsync(ct);
    }
    
    public async Task HandleAsync(OrderCancelled @event, CancellationToken ct)
    {
        var summary = await _readDb.OrderSummaries
            .FirstAsync(o => o.OrderId == @event.OrderId, ct);
        
        summary.Status = "Cancelled";
        await _readDb.SaveChangesAsync(ct);
    }
}
```

**The read model is eventually consistent with the write side**. After a command handler appends events to the store and returns HTTP 202, the projection runs asynchronously. When a client immediately queries for the new order, the read model may not yet reflect the latest event (usually within milliseconds, but there is no hard guarantee).

---

## Using CQRS Without Event Sourcing

CQRS — separating read and write models — is independently valuable. Most teams should start here before considering event sourcing.

```csharp
// Write model uses EF Core with domain objects
public class PlaceOrderCommandHandler : ICommandHandler<PlaceOrderCommand>
{
    public async Task Handle(PlaceOrderCommand command, CancellationToken ct)
    {
        var order = Order.Create(command.CustomerId, command.Items);
        _db.Orders.Add(order);
        await _db.SaveChangesAsync(ct);
    }
}

// Read model uses raw SQL or a separate read DbContext
// No domain objects — flat DTOs optimised for the query
public class GetOrderDashboardQueryHandler : IQueryHandler<GetOrderDashboardQuery, DashboardDto>
{
    public async Task<DashboardDto> Handle(GetOrderDashboardQuery query, CancellationToken ct)
    {
        // Direct SQL for complex aggregations — no EF Core domain model overhead
        return await _db.Database.SqlQueryRaw<DashboardDto>("""
            SELECT 
                COUNT(*) AS TotalOrders,
                SUM(TotalAmount) AS Revenue,
                COUNT(CASE WHEN Status = 'Pending' THEN 1 END) AS PendingOrders
            FROM Orders
            WHERE CustomerId = {0} AND PlacedAt > {1}
            """, query.CustomerId, query.Since).FirstAsync(ct);
    }
}
```

---

## Rebuilding Read Models (The Key Event Sourcing Benefit)

When you need a new report or a new read model, event sourcing lets you replay all historical events through a new projection. You do not need a data migration.

```csharp
// New requirement: "We need an analytics read model by product"
// With event sourcing: replay all OrderPlaced events through the new projection
public class ProductSalesProjection
{
    public async Task HandleAsync(OrderPlaced @event, CancellationToken ct)
    {
        foreach (var line in @event.Lines)
        {
            var entry = await _readDb.ProductSales
                .FirstOrDefaultAsync(p => p.ProductId == line.ProductId, ct);
            
            if (entry == null)
                _readDb.ProductSales.Add(new ProductSalesReadModel 
                    { ProductId = line.ProductId, TotalUnits = line.Quantity, TotalRevenue = line.LineTotal });
            else
            {
                entry.TotalUnits += line.Quantity;
                entry.TotalRevenue += line.LineTotal;
            }
        }
        await _readDb.SaveChangesAsync(ct);
    }
}
// Trigger: replay all historical OrderPlaced events through ProductSalesProjection
// Result: a complete product sales report, retroactive from day 1
```

Without event sourcing (CRUD), this retroactive report would require either having anticipated the need at the time or running a painful data migration.

---

## When to Use CQRS Without Event Sourcing
- Complex read models that differ significantly from write models
- Performance optimisation — separate read replicas and read-optimised projections
- When write model uses domain objects but read model benefits from flat DTOs
- Most systems — this is the standard CQRS pattern

## When to Add Event Sourcing
- Temporal queries are a product feature ("what was the state on this date?")
- Multiple independent projections that need to diverge and be rebuilt
- Audit trail is a regulatory requirement, not an afterthought
- The domain has complex state machines where event history has intrinsic value

## Trade-offs

| Benefit | Cost / Risk |
|---|---|
| New read models can be built retroactively from event history | Significant infrastructure complexity (event store, projection workers) |
| Temporal queries are first-class | Every read requires a projection — no ad-hoc queries on the write side |
| Full audit trail at no extra cost | Schema evolution of events requires versioning strategy |
| Projections can use different storage (SQL, Elasticsearch, Redis) | Eventual consistency on read side — queries may lag after commands |

---

## If an Interviewer Asks...

**"What is the read model in CQRS and how does it relate to event sourcing?"**

In CQRS, the read model is a separate, denormalized representation of the data optimised for queries. In a standard CQRS system without event sourcing, the read model is updated synchronously when the write model changes. With event sourcing, the read model is built by projecting events from the event store — either synchronously or asynchronously. The key benefit is that you can build new read models retroactively by replaying historical events, which is impossible with standard CRUD.

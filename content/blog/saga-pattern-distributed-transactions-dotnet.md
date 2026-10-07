---
title: "Saga Pattern in .NET: Choreography vs Orchestration"
description: "Implement the Saga pattern in .NET for distributed transactions across microservices. Compare choreography vs orchestration with real C# examples."
date: "2026-10-07"
category: "microservices"
tags: ["Saga Pattern", "Distributed Transactions", "Microservices", ".NET", "MassTransit", "MediatR"]
faq:
  - q: "What is the saga pattern in microservices .NET?"
    a: "A saga replaces a distributed database transaction with a sequence of local transactions, each with a compensating transaction that undoes the effect if a later step fails. In .NET, MassTransit provides a state machine saga implementation. Each service commits locally and publishes an event — no cross-service database locks."
  - q: "Choreography vs orchestration saga: which to use in .NET?"
    a: "Choreography: each service reacts to events from the previous step — simple but hard to visualize. Orchestration: a central saga state machine coordinates all steps — more visible and easier to debug. Use orchestration when the workflow has complex compensation logic or many steps."
  - q: "Does the saga pattern guarantee exactly-once delivery?"
    a: "No. Sagas are at-least-once. A compensating transaction can fire more than once if the coordinator crashes after sending but before recording success. All saga steps must be idempotent."
---

When you have a monolith, distributed transactions are trivial. You wrap everything in a `using var transaction = await _db.Database.BeginTransactionAsync()` and if any step fails, you roll back. The database handles it.

In microservices, each service has its own database. There is no shared transaction. When an order creation touches the Order service, the Inventory service, the Payment service, and the Notification service, you cannot simply begin a database transaction that spans all four. Two-phase commit can simulate this, but at the cost of locking resources across all four services for the duration of the transaction — turning your independent microservices into a tightly coupled distributed monolith.

The Saga pattern solves this correctly. It replaces the ACID transaction with a sequence of local transactions, each with a corresponding compensating transaction that rolls back the effect if a later step fails.

Microsoft documents the pattern in the [Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/saga/saga).

## Project Layout

```text
src/
├── Contracts/                               # shared NuGet — integration events only
│   ├── OrderSubmitted.cs
│   ├── InventoryReserved.cs
│   ├── InventoryReservationFailed.cs
│   └── PaymentProcessed.cs
├── Order.Service/
│   └── Sagas/
│       ├── OrderSagaState.cs                # MassTransit saga persistence model
│       └── OrderSaga.cs                     # state machine: events → compensations
├── Inventory.Service/
│   └── Consumers/
│       └── ReserveInventoryConsumer.cs
└── Payment.Service/
    └── Consumers/
        └── ProcessPaymentConsumer.cs
```

`Contracts` is the only project shared across services. Each service owns its own saga state or consumer — no service imports another service's domain model.

---

### The Problem: Why Two-Phase Commit Fails in Microservices

Two-phase commit (2PC) works like this:
1. A coordinator asks all participants to prepare (lock resources)
2. If all prepare successfully, the coordinator tells everyone to commit
3. If any participant fails to prepare, the coordinator tells everyone to rollback

In a microservices system, "participants" are separate services. 2PC requires:
- All services to hold locks on their data until the coordinator completes
- A synchronous connection between the coordinator and every participant
- All participants to be available simultaneously (if any is down, the transaction blocks)

In production, this creates:
- **Long lock contention**: Payment tables locked while the notification service (which might be slow) confirms
- **Distributed deadlocks**: Service A waiting for Service B while Service B waits for Service C
- **Tight coupling**: All services must implement the 2PC protocol and be available simultaneously
- **Blocking on failure**: If the Notification service goes down mid-transaction, the Payment table stays locked until timeout

The Saga pattern avoids all of these by accepting that consistency will be *eventual* rather than *immediate*, and handling failures through compensating transactions.

---

### What Is a Saga?

A Saga is a sequence of local transactions where:
- Each local transaction updates one service's database and emits an event or sends a command
- If any step fails, previously completed steps are reversed using *compensating transactions*
- Compensation is application-level undo logic, not database rollback

For an e-commerce order:

```
Create Order → Reserve Inventory → Charge Payment → Send Confirmation
     ↓               ↓                  ↓                ↓
 CompensateOrder  CompensateInventory  Refund Payment  (notification failures
 (mark cancelled)  (release stock)    (return money)   are usually idempotent)
```

If charging the payment fails, the Saga automatically triggers:
1. Release the reserved inventory
2. Mark the order as failed (not cancelled — it never completed)

If sending confirmation fails, you typically do NOT compensate payment and inventory — notification failure is usually non-critical and can be retried.

---

### Choreography-Based Sagas

In a choreography saga, each service listens for events and decides what to do next independently. There is no central coordinator. Services communicate through events on a message broker (Azure Service Bus, RabbitMQ, Kafka).

**Order processing choreography:**

```
OrderService         InventoryService      PaymentService       NotificationService
     |                      |                    |                      |
POST /orders                |                    |                      |
     |                      |                    |                      |
 [OrderCreated] ────────────>                    |                      |
                     [InventoryReserved] ────────>                      |
                     or                         |                      |
                     [InsufficientStock]         |                      |
                                         [PaymentProcessed] ───────────>
                                         or                            |
                                         [PaymentFailed]        [ConfirmationSent]
```

In .NET with MassTransit:

```csharp
// Order Service - publishes domain event after creating order
public class CreateOrderCommandHandler : ICommandHandler<CreateOrderCommand>
{
    private readonly IOrderRepository _orders;
    private readonly IPublishEndpoint _publishEndpoint;

    public async Task<OrderId> Handle(CreateOrderCommand command, CancellationToken ct)
    {
        var order = Order.Create(command.CustomerId, command.Items);
        await _orders.SaveAsync(order, ct);
        
        // Publish event — Inventory Service listens for this
        await _publishEndpoint.Publish(new OrderCreatedEvent
        {
            OrderId = order.Id,
            Items = order.Items.Select(i => new OrderItemDto
            {
                ProductId = i.ProductId,
                Quantity = i.Quantity
            }).ToList(),
            CreatedAt = DateTime.UtcNow
        }, ct);
        
        return order.Id;
    }
}

// Inventory Service - listens for OrderCreated, handles reservation
public class OrderCreatedConsumer : IConsumer<OrderCreatedEvent>
{
    private readonly IInventoryRepository _inventory;
    private readonly IPublishEndpoint _publishEndpoint;

    public async Task Consume(ConsumeContext<OrderCreatedEvent> context)
    {
        var result = await _inventory.ReserveItemsAsync(
            context.Message.OrderId,
            context.Message.Items);
        
        if (result.IsSuccess)
        {
            await context.Publish(new InventoryReservedEvent
            {
                OrderId = context.Message.OrderId
            });
        }
        else
        {
            // Publish failure — OrderService listens to cancel the order
            await context.Publish(new InsufficientStockEvent
            {
                OrderId = context.Message.OrderId,
                Reason = result.FailureReason
            });
        }
    }
}

// Order Service - compensating transaction handler
public class InsufficientStockConsumer : IConsumer<InsufficientStockEvent>
{
    private readonly IOrderRepository _orders;

    public async Task Consume(ConsumeContext<InsufficientStockEvent> context)
    {
        var order = await _orders.GetByIdAsync(context.Message.OrderId);
        order.MarkAsFailed("Inventory unavailable");
        await _orders.SaveAsync(order);
        
        // Could also emit OrderFailedEvent for notification
    }
}
```

**Pros of choreography:**
- Each service is truly independent — no service knows about other services' internal logic
- Services can be deployed, scaled, and changed independently
- Natural for event-driven systems already using message brokers

**Cons of choreography:**
- Hard to get a global view of a saga's progress (which step is it on?)
- Debugging distributed failures requires correlating events across multiple services
- Cyclic event dependencies can be hard to detect and prevent
- Adding a new step to the saga touches multiple services simultaneously

---

### Orchestration-Based Sagas

In an orchestration saga, a central coordinator (the Saga orchestrator) explicitly commands each step. Services execute commands and report results back to the orchestrator. The orchestrator holds the complete state machine.

```
                     ┌───────────────────────────────┐
                     │     ORDER SAGA ORCHESTRATOR   │
                     │  State: ReservingInventory     │
                     └───────────────────────────────┘
                              │ Command: ReserveInventory
                              ↓
                     ┌─────────────────────┐
                     │  INVENTORY SERVICE  │
                     │  Response: Reserved │
                     └─────────────────────┘
                              │ Event: InventoryReserved
                              ↓
                     ┌───────────────────────────────┐
                     │     ORDER SAGA ORCHESTRATOR   │
                     │  State: ProcessingPayment      │
                     └───────────────────────────────┘
```

In .NET, MassTransit has first-class saga state machine support:

```csharp
// MassTransit Saga State Machine
public class OrderSagaStateMachine : MassTransitStateMachine<OrderSagaState>
{
    public State InventoryReserving { get; private set; }
    public State PaymentProcessing { get; private set; }
    public State NotificationSending { get; private set; }
    public State Completed { get; private set; }
    public State Failed { get; private set; }

    public Event<OrderCreatedEvent> OrderCreated { get; private set; }
    public Event<InventoryReservedEvent> InventoryReserved { get; private set; }
    public Event<InsufficientStockEvent> InsufficientStock { get; private set; }
    public Event<PaymentProcessedEvent> PaymentProcessed { get; private set; }
    public Event<PaymentFailedEvent> PaymentFailed { get; private set; }

    public OrderSagaStateMachine()
    {
        InstanceState(x => x.CurrentState);

        Event(() => OrderCreated, x => 
            x.CorrelateById(context => context.Message.OrderId));
        Event(() => InventoryReserved, x => 
            x.CorrelateById(context => context.Message.OrderId));
        Event(() => InsufficientStock, x => 
            x.CorrelateById(context => context.Message.OrderId));
        Event(() => PaymentProcessed, x => 
            x.CorrelateById(context => context.Message.OrderId));
        Event(() => PaymentFailed, x => 
            x.CorrelateById(context => context.Message.OrderId));

        Initially(
            When(OrderCreated)
                .Then(context => {
                    context.Saga.OrderId = context.Message.OrderId;
                    context.Saga.CustomerId = context.Message.CustomerId;
                    context.Saga.CreatedAt = DateTime.UtcNow;
                })
                // Send command to Inventory Service
                .Send(context => new Uri("queue:reserve-inventory"), context => 
                    new ReserveInventoryCommand
                    {
                        OrderId = context.Message.OrderId,
                        Items = context.Message.Items
                    })
                .TransitionTo(InventoryReserving));

        During(InventoryReserving,
            When(InventoryReserved)
                // Send command to Payment Service
                .Send(context => new Uri("queue:process-payment"), context =>
                    new ProcessPaymentCommand
                    {
                        OrderId = context.Saga.OrderId,
                        CustomerId = context.Saga.CustomerId,
                        Amount = context.Message.TotalAmount
                    })
                .TransitionTo(PaymentProcessing),
            
            When(InsufficientStock)
                // Compensate: mark order as failed
                .Send(context => new Uri("queue:cancel-order"), context =>
                    new CancelOrderCommand 
                    { 
                        OrderId = context.Saga.OrderId,
                        Reason = "InsufficientStock"
                    })
                .TransitionTo(Failed)
                .Finalize());

        During(PaymentProcessing,
            When(PaymentProcessed)
                // Final step: send notification
                .Send(context => new Uri("queue:send-confirmation"), context =>
                    new SendConfirmationCommand { OrderId = context.Saga.OrderId })
                .TransitionTo(NotificationSending),
            
            When(PaymentFailed)
                // Compensate: release inventory AND mark order failed
                .Send(context => new Uri("queue:release-inventory"), context =>
                    new ReleaseInventoryCommand { OrderId = context.Saga.OrderId })
                .Send(context => new Uri("queue:cancel-order"), context =>
                    new CancelOrderCommand 
                    { 
                        OrderId = context.Saga.OrderId,
                        Reason = "PaymentFailed" 
                    })
                .TransitionTo(Failed)
                .Finalize());

        During(NotificationSending,
            When(new Event<ConfirmationSentEvent>())
                .TransitionTo(Completed)
                .Finalize());
    }
}

// Saga state (persisted to database for durability)
public class OrderSagaState : SagaStateMachineInstance
{
    public Guid CorrelationId { get; set; } // Required by MassTransit
    public string CurrentState { get; set; }
    public Guid OrderId { get; set; }
    public Guid CustomerId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
}
```

**Pros of orchestration:**
- Single place to understand the complete saga flow
- Easy to add monitoring (one state machine shows current step for any saga instance)
- Compensating transactions are explicitly defined in one place
- Easier to debug and trace

**Cons of orchestration:**
- Orchestrator becomes a central dependency — if it goes down, sagas in-flight are paused
- Orchestrator service tends to accumulate business logic over time (God service problem)
- Services must be aware of the command protocol (though not of each other)

---

### Choosing Between Choreography and Orchestration

| Criterion | Choreography | Orchestration |
|---|---|---|
| **Visibility into saga progress** | Difficult — correlate events across services | Easy — check state machine instance |
| **Adding steps** | Touches multiple services | Touches orchestrator only |
| **Service independence** | High — services only know about events | Medium — services know command contracts |
| **Debugging distributed failures** | Hard — distributed event tracing required | Easier — single state machine history |
| **Team structure** | Works well with separate teams per service | Better when one team owns the workflow |
| **Example use case** | Order notifications, inventory updates | Payment processing, multi-step booking |

**Practical rule:**
- Choose **choreography** for event-driven, loosely coupled workflows where services are developed by independent teams and the flow is additive (new services can participate without coordination)
- Choose **orchestration** for critical workflows with complex failure paths and compensation logic, where auditability and debuggability are paramount (payment processing, regulatory workflows, healthcare booking)

---

### Idempotency: The Non-Negotiable Requirement

Sagas require idempotency in every step. Message delivery is at-least-once — a network glitch can cause the same event to be delivered twice. Your consumer must produce the same result whether called once or ten times.

```csharp
// Idempotent inventory reservation using a deduplication key
public class ReserveInventoryCommandHandler
{
    public async Task Handle(ReserveInventoryCommand command, CancellationToken ct)
    {
        // Check if we already processed this reservation
        var existing = await _reservations.FindByOrderIdAsync(command.OrderId, ct);
        if (existing != null)
        {
            // Already reserved — publish the success event again (replay-safe)
            await _publishEndpoint.Publish(new InventoryReservedEvent
            {
                OrderId = command.OrderId,
                TotalAmount = existing.TotalAmount
            }, ct);
            return;
        }
        
        // First time processing — do the actual work
        var reservation = await _inventory.ReserveAsync(command.OrderId, command.Items, ct);
        await _reservations.SaveAsync(reservation, ct);
        
        await _publishEndpoint.Publish(new InventoryReservedEvent
        {
            OrderId = command.OrderId,
            TotalAmount = reservation.TotalAmount
        }, ct);
    }
}
```

---

### If an Interviewer Asks...

**"Why not use two-phase commit for distributed transactions?"**

2PC holds locks on all participating resources for the duration of the transaction. In microservices where services are independent and have their own databases, this means long lock contention, blocking failures when any participant is unavailable, and tight temporal coupling between services. Sagas replace atomic ACID transactions with a sequence of local transactions, using compensating transactions for rollback and accepting eventual consistency.

**"What is the difference between a compensating transaction and a rollback?"**

A database rollback undoes changes using the transaction log, as if they never happened. A compensating transaction is application-level logic that reverses the *effect* of a completed step — it creates a new record (e.g., a refund record) rather than erasing the original one. Compensating transactions must be designed explicitly and are visible in audit logs.

---

## Trade-offs Covered
- Two-phase commit coupling vs Saga eventual consistency
- Choreography independence vs orchestration visibility
- Eventual consistency acceptance in saga flows vs immediate ACID consistency
- Idempotency overhead vs risk of duplicate processing side effects
- MassTransit saga complexity vs custom event handling simplicity

## Key Concepts
- **Saga pattern**: A sequence of local transactions with compensating transactions for failure recovery
- **Compensating transaction**: Application-level logic that reverses the effect of a completed saga step
- **Choreography**: Saga coordination through events; each service reacts independently
- **Orchestration**: Saga coordination through a central state machine that commands each step
- **Idempotency**: The property of an operation that produces the same result whether called once or many times — required for safe at-least-once message delivery
- **Correlation ID**: A shared identifier that links all events and commands belonging to the same saga instance

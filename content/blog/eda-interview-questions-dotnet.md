---
title: "Event-Driven Architecture Interview Questions (.NET)"
description: "EDA interview prep for .NET developers. Domain events, integration events, eventual consistency, and designing idempotent consumers explained."
date: "2026-10-07"
category: "interview-prep"
tags: ["Event-Driven Architecture", ".NET", "Interview Questions", "Microservices", "Distributed Systems"]
---

## Question 1: "How Would You Design an Order Processing System That Handles Orders Asynchronously?"

### 30-Second Answer
Accept the order synchronously (validate, persist, return an order ID), then publish an `OrderPlaced` event. Downstream services (inventory, payment, notification) consume the event asynchronously. The customer sees "Order received" immediately and gets email confirmation when processing completes.

### Strong Answer

**The wrong approach**: Making the HTTP response wait for inventory reservation, payment, and notification to complete. Any slow step (payment gateway, email provider) makes the entire order placement slow and fragile.

**The right approach** — synchronous accept, asynchronous process:

```
POST /orders 
  → Validate order
  → Persist order (Status: Pending)
  → Publish OrderPlaced event to Service Bus
  → Return HTTP 202 Accepted { orderId: "..." }
  
[Background]
  Inventory service consumes OrderPlaced → reserves stock → publishes InventoryReserved
  Payment service consumes InventoryReserved → charges card → publishes PaymentProcessed
  Notification service consumes PaymentProcessed → sends confirmation email
```

**What the client does**: Polls `GET /orders/{id}` for status, or receives a webhook when processing completes.

**Key design decisions**:
1. What does the customer see between "Order received" and "Order confirmed"? Show a pending state. Communicate expected completion time.
2. What if payment fails after inventory is reserved? Saga compensating transactions release inventory.
3. What if the customer double-submits? Idempotency key on the POST endpoint — same key returns the same order.

### Red Flags
- Not acknowledging that the customer needs feedback about async processing
- No mention of what happens when downstream steps fail (compensation)
- Missing idempotency for the initial order submission

---

## Question 2: "How Do You Handle a Failed Event Handler?"

### 30-Second Answer
The message broker retries delivery on transient failures. After max retries, the message moves to a dead letter queue. Monitor the DLQ — a message there means a handler is broken or the data is invalid. Fix the root cause, then replay the dead-lettered message.

### Strong Answer

**Failure types**:
- **Transient failures** (network blip, downstream service temporarily unavailable): Retry with exponential backoff. The broker handles this.
- **Poison messages** (data that causes a handler to throw every time): Will exceed retry limit and land in the DLQ. Requires human inspection or a code fix.
- **Consumer service crashes mid-processing**: The message was not acknowledged. The broker redelivers to the next available consumer. This is why consumers must be idempotent.

**Azure Service Bus retry configuration**:
```csharp
var options = new ServiceBusProcessorOptions
{
    MaxConcurrentCalls = 5,
    AutoCompleteMessages = false  // Manual completion — complete only after successful processing
};

// Message that exceeds MaxDeliveryCount (default 10) moves to DLQ automatically
```

**Dead letter queue monitoring**:
```csharp
// Background service that alerts on DLQ messages
public class DeadLetterQueueMonitor : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var dlqCount = await _serviceBus.GetDlqMessageCountAsync();
            if (dlqCount > 0)
            {
                _metrics.RecordGauge("dlq.message.count", dlqCount);
                // Alert fires when dlq.message.count > 0 for > 5 minutes
            }
            
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }
    }
}
```

**Replaying DLQ messages**: After fixing the handler bug, move messages from DLQ back to the main queue and they will be reprocessed.

### Red Flags
- "Let the broker keep retrying forever" — this is not a strategy, it masks broken handlers
- Not mentioning idempotency as required for safe retries
- Not mentioning DLQ monitoring — a silent DLQ is a hidden backlog of failed operations

---

## Question 3: "What Is Eventual Consistency and How Do You Communicate It to Users?"

### 30-Second Answer
Eventual consistency means the system will reach a consistent state eventually, but there may be a window where different parts of the system have different views of the same data. Communicate it to users with appropriate UX — "Your order is being confirmed" rather than showing inconsistent state as an error.

### Strong Answer

**Where eventual consistency appears in EDA**:
- Order placed, inventory not yet reserved — inventory count shows item as still available to other users for a brief window
- Read model projection not yet updated — query returns stale state immediately after a command
- Notification service not yet received the event — user hasn't received their confirmation email

**UX strategies**:
- **Optimistic UI**: Show the expected final state immediately ("Order confirmed ✓") before it is actually confirmed. Roll back if a failure event arrives.
- **Pending states**: Show intermediate status ("Order received — confirming...") with polling for completion
- **Webhooks/SSE**: Push the final status to the client rather than requiring polling

**Session consistency** — the minimum acceptable guarantee for most users: a user always sees their own writes immediately, even in an eventually consistent system:
```csharp
// After POST /orders, redirect to GET /orders/{id}
// Route that read to the primary database or the shard that just wrote
// This ensures the user sees their new order immediately
if (isReadAfterWrite && httpContext.Items.TryGetValue("just-wrote-order", out _))
    return await _primaryDb.Orders.FindAsync(orderId);
else
    return await _readReplicaDb.Orders.FindAsync(orderId);
```

### Red Flags
- "Eventual consistency is fine, users don't notice" — users absolutely notice when their balance shows old data or their order isn't visible after placement
- Not mentioning any UX strategy for communicating async state

---

## Question 4: "How Do You Ensure Idempotent Event Consumers?"

### 30-Second Answer
Store a processed marker (the message ID or event ID) in the database before or after processing. Before processing, check if the ID already exists — if so, skip. The check and the business operation should be atomic where possible (same transaction).

### Strong Answer
```csharp
public class OrderShippedConsumer : IConsumer<OrderShippedIntegrationEvent>
{
    public async Task Consume(ConsumeContext<OrderShippedIntegrationEvent> context)
    {
        var messageId = context.MessageId.ToString();
        
        // Pattern 1: Check-then-process (two separate operations)
        if (await _repository.IsMessageProcessedAsync(messageId))
            return;
        
        // Pattern 2: Atomic insert + process (if DB supports it)
        // INSERT INTO ProcessedMessages VALUES (@messageId)
        // If UNIQUE constraint violation, skip
        
        await _shipmentService.RecordShipmentAsync(
            context.Message.OrderId,
            context.Message.TrackingNumber);
        
        await _repository.MarkMessageProcessedAsync(messageId);
    }
}
```

**The "check-then-process" race condition**: Two concurrent deliveries of the same message both pass the check, both process. Solution: use an atomic operation — try to INSERT with a UNIQUE constraint. If it fails (duplicate key), the other consumer already processed it.

**Atomic idempotency**:
```csharp
try
{
    // Atomic: either this succeeds (first time) or throws (duplicate)
    _db.ProcessedMessages.Add(new ProcessedMessage { MessageId = messageId });
    
    await _shipmentService.RecordShipmentAsync(...);
    
    await _db.SaveChangesAsync();  // Commits both: processed marker + side effect
}
catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
{
    // Already processed — safe to skip
    return;
}
```

### Red Flags
- "Just add a try-catch around the whole handler" — not idempotency, just error suppression
- Not recognising that at-least-once delivery means duplicate handling is not an edge case — it is guaranteed to happen

---

## Question 5: "Choreography vs Orchestration — When Would You Choose Each?"

### 30-Second Answer
Choreography: services react to events independently with no central coordinator — good for loosely coupled workflows. Orchestration: a central state machine commands each step — better for complex, auditable workflows with many failure paths. If you need to answer "what step is this process on?", use orchestration.

### Strong Answer
**Choreography** — each service publishes events, other services react:
```
OrderPlaced → InventoryService reserves → InventoryReserved → PaymentService charges → ...
```
- No service knows about others — only about the events
- Adding a new step: add a new subscriber, don't touch existing services
- Debugging: correlate events across multiple service logs

**Orchestration** — central coordinator explicitly commands each step:
```
OrderSaga.Handle(OrderPlaced):
  → Send ReserveInventoryCommand to InventoryService
  → On InventoryReserved: Send ProcessPaymentCommand to PaymentService
  → On PaymentFailed: Send ReleaseInventoryCommand (compensation)
```
- Single place to see the whole flow
- Easy to add monitoring: what state is this saga in?
- New step: change the orchestrator

**When choreography is wrong**: Payment processing with 4 steps and 8 possible failure paths. Debugging a failed payment requires correlating 8 services' logs. Orchestration is cleaner here.

**When orchestration is wrong**: Simple fan-out — "when a user registers, send a welcome email, add to CRM, and trigger onboarding". These are independent — no shared state, no complex failure paths. Choreography is cleaner.

### Red Flags
- "Orchestration is always better because you can see the flow" — ignores the coupling and God-service problem
- Not being able to give a concrete criterion for choosing one over the other

---

## Quick-Fire Answers

**"What is the outbox pattern?"**
A reliability pattern for publishing events. Instead of writing to the database AND publishing to the broker in the same operation (dual-write problem, either can fail independently), write both the business data and the event to the database in one transaction. A background worker reads the unpublished events and publishes them to the broker. Guarantees at-least-once delivery and atomicity.

**"What is backpressure in event-driven systems?"**
When consumers process events slower than producers publish them, the queue grows. Backpressure is a signal from the queue to the producer to slow down, or a mechanism by which the consumer controls its own processing rate. In practice: monitor queue depth. If it grows consistently, either scale up consumers or scale down producers.

**"What is the difference between a command and an event?"**
A command is an instruction: "place this order." It has one intended handler, can be rejected, and is named imperatively (`PlaceOrder`). An event is a fact: "order was placed." It happened and cannot be rejected. Multiple handlers may react to it or none. Named past tense (`OrderPlaced`). Commands model intent; events model history.

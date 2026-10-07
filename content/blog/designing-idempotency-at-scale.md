---
title: "Designing for Idempotency at Scale in .NET APIs"
description: "Design idempotent APIs in ASP.NET Core to handle duplicate requests safely. Idempotency keys, database patterns, and safe at-least-once processing."
date: "2026-10-07"
category: "architecture"
tags: ["Idempotency", "API Design", "Distributed Systems", "ASP.NET Core", ".NET"]
---

Consider what happens during a payment:
1. Client sends POST /payments
2. Your API processes the payment and deducts from the account
3. The network drops before the response reaches the client
4. Client sees a timeout and retries

Without idempotency, you charge the customer twice. With idempotency, the second request detects it has already been processed and returns the original result. Same external behavior, no duplicate side effect.

This is why Stripe, PayPal, and every serious payment API requires an `Idempotency-Key` header. It is not optional — it is the foundation of reliable distributed systems.

## Project Layout

```text
src/
├── Clinic.Domain/
│   └── Idempotency/
│       └── IdempotencyRecord.cs             # Key, RequestHash, StatusCode, Body, ExpiresAt
├── Clinic.Infrastructure/
│   └── Idempotency/
│       ├── IdempotencyFilter.cs             # IAsyncActionFilter: check → execute → store
│       └── IdempotencyExtensions.cs         # AddIdempotency() DI registration
└── Clinic.Data/
    └── AppDbContext.cs                       # DbSet<IdempotencyRecord> + HasIndex(r => r.Key)
```

The filter intercepts every `POST`/`PUT` that carries `Idempotency-Key`. Domain logic runs once; replays return the stored response.

---

### The Idempotency Key Pattern

The standard HTTP pattern uses a client-provided idempotency key:

```
POST /api/payments
Idempotency-Key: 7f89ab3c-1234-5678-abcd-ef0123456789
Content-Type: application/json

{
    "amount": 49.99,
    "currency": "GBP",
    "customerId": "cust_123"
}
```

The server:
1. Checks if it has seen this idempotency key before
2. If not: processes the request, stores the response under the key
3. If yes: returns the stored response immediately without reprocessing

**Implementation in ASP.NET Core**:

```csharp
// Idempotency middleware
public class IdempotencyMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IIdempotencyStore _store;
    private readonly ILogger<IdempotencyMiddleware> _logger;
    
    public async Task InvokeAsync(HttpContext context)
    {
        // Only apply to mutating operations
        if (!HttpMethods.IsPost(context.Request.Method) &&
            !HttpMethods.IsPut(context.Request.Method) &&
            !HttpMethods.IsPatch(context.Request.Method))
        {
            await _next(context);
            return;
        }
        
        if (!context.Request.Headers.TryGetValue("Idempotency-Key", out var key))
        {
            await _next(context);
            return;
        }
        
        var idempotencyKey = key.ToString();
        
        // Check for existing result
        var cached = await _store.GetAsync(idempotencyKey);
        if (cached != null)
        {
            _logger.LogInformation(
                "Returning cached idempotent response for key {Key}", 
                idempotencyKey);
            
            context.Response.StatusCode = cached.StatusCode;
            context.Response.ContentType = cached.ContentType;
            await context.Response.WriteAsync(cached.Body);
            return;
        }
        
        // Capture the response
        var originalBody = context.Response.Body;
        using var capture = new MemoryStream();
        context.Response.Body = capture;
        
        await _next(context);
        
        capture.Seek(0, SeekOrigin.Begin);
        var body = await new StreamReader(capture).ReadToEndAsync();
        
        // Store result for future duplicate requests
        // Only cache successful or business-logic failures (not 500s)
        if (context.Response.StatusCode < 500)
        {
            await _store.SetAsync(idempotencyKey, new IdempotencyRecord
            {
                StatusCode = context.Response.StatusCode,
                ContentType = context.Response.ContentType,
                Body = body
            }, expiry: TimeSpan.FromHours(24));
        }
        
        // Write through to original response
        capture.Seek(0, SeekOrigin.Begin);
        await capture.CopyToAsync(originalBody);
        context.Response.Body = originalBody;
    }
}

// Redis-backed idempotency store
public class RedisIdempotencyStore : IIdempotencyStore
{
    private readonly IDistributedCache _cache;
    
    public async Task<IdempotencyRecord?> GetAsync(string key)
    {
        var value = await _cache.GetStringAsync($"idempotency:{key}");
        return value == null ? null : JsonSerializer.Deserialize<IdempotencyRecord>(value);
    }
    
    public Task SetAsync(string key, IdempotencyRecord record, TimeSpan expiry)
    {
        return _cache.SetStringAsync(
            $"idempotency:{key}",
            JsonSerializer.Serialize(record),
            new DistributedCacheEntryOptions 
            { 
                AbsoluteExpirationRelativeToNow = expiry 
            });
    }
}
```

---

### Database-Level Idempotency

For payments and financial operations, middleware-level idempotency is not enough — you need idempotency enforced at the database level to prevent race conditions when two identical requests arrive simultaneously.

```csharp
// Payment table with idempotency key constraint
// SQL:
// ALTER TABLE Payments ADD CONSTRAINT UQ_Payments_IdempotencyKey 
//     UNIQUE (IdempotencyKey);

public class PaymentService
{
    public async Task<PaymentResult> ProcessAsync(
        ProcessPaymentCommand command, 
        CancellationToken ct)
    {
        // Try to insert with idempotency key
        try
        {
            var payment = new Payment
            {
                Id = Guid.NewGuid(),
                CustomerId = command.CustomerId,
                Amount = command.Amount,
                IdempotencyKey = command.IdempotencyKey, // Client-provided
                CreatedAt = DateTime.UtcNow,
                Status = PaymentStatus.Processing
            };
            
            _db.Payments.Add(payment);
            await _db.SaveChangesAsync(ct); // Throws if duplicate key
            
            // Process the actual payment...
            var externalResult = await _paymentGateway.ChargeAsync(payment, ct);
            
            payment.Status = externalResult.IsSuccess 
                ? PaymentStatus.Completed 
                : PaymentStatus.Failed;
            payment.TransactionId = externalResult.TransactionId;
            
            await _db.SaveChangesAsync(ct);
            return PaymentResult.Success(payment.Id, externalResult.TransactionId);
        }
        catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
        {
            // Duplicate request — return the original result
            var existing = await _db.Payments
                .FirstAsync(p => p.IdempotencyKey == command.IdempotencyKey, ct);
            
            return existing.Status == PaymentStatus.Completed
                ? PaymentResult.Success(existing.Id, existing.TransactionId)
                : PaymentResult.Failure(existing.FailureReason);
        }
    }
    
    private bool IsUniqueConstraintViolation(DbUpdateException ex) =>
        ex.InnerException?.Message?.Contains("UQ_Payments_IdempotencyKey") == true;
}
```

---

### Idempotent Message Consumers

In event-driven systems, message brokers guarantee at-least-once delivery. Your consumers must be idempotent. The pattern: check for a processed marker before doing work.

```csharp
public class OrderShippedConsumer : IConsumer<OrderShippedEvent>
{
    private readonly IShipmentRepository _shipments;
    private readonly IEmailService _email;
    
    public async Task Consume(ConsumeContext<OrderShippedEvent> context)
    {
        var message = context.Message;
        
        // Check if already processed using event's MessageId as dedup key
        if (await _shipments.IsEventProcessedAsync(context.MessageId, context.CancellationToken))
        {
            _logger.LogInformation(
                "Event {MessageId} already processed, skipping", 
                context.MessageId);
            return;
        }
        
        // Do the actual work
        await _email.SendShipmentConfirmationAsync(message.OrderId, message.TrackingNumber);
        
        // Mark as processed — ideally in the same transaction as the side effect
        await _shipments.MarkEventProcessedAsync(context.MessageId, context.CancellationToken);
    }
}
```

**The Outbox Pattern** (atomic message publishing):

A common problem: you update the database AND send a message in the same request. If the message fails to send after the database commits, you have an inconsistency. The outbox pattern writes messages to a database table atomically with the main transaction, then a background job reliably publishes them:

```csharp
// Outbox: write message to DB in same transaction as business data
public async Task CompleteOrderAsync(Guid orderId, CancellationToken ct)
{
    await using var transaction = await _db.Database.BeginTransactionAsync(ct);
    
    var order = await _db.Orders.FindAsync(orderId, ct);
    order.Complete();
    
    // Write outbox message — same transaction as order update
    _db.OutboxMessages.Add(new OutboxMessage
    {
        Id = Guid.NewGuid(),
        Topic = "orders",
        Payload = JsonSerializer.Serialize(new OrderCompletedEvent { OrderId = orderId }),
        CreatedAt = DateTime.UtcNow
    });
    
    await _db.SaveChangesAsync(ct);
    await transaction.CommitAsync(ct); // Both commit or neither
}

// Background job publishes outbox messages
public class OutboxPublisher : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var messages = await _db.OutboxMessages
                .Where(m => m.PublishedAt == null)
                .OrderBy(m => m.CreatedAt)
                .Take(100)
                .ToListAsync(stoppingToken);
            
            foreach (var msg in messages)
            {
                await _messageBus.PublishAsync(msg.Topic, msg.Payload, stoppingToken);
                msg.PublishedAt = DateTime.UtcNow;
            }
            
            await _db.SaveChangesAsync(stoppingToken);
            await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken);
        }
    }
}
```

---

### Rules for Idempotency Design

1. **GET/HEAD are always idempotent** — reads with no side effects
2. **DELETE is idempotent** — deleting an already-deleted resource returns 404, same observable state
3. **PUT is idempotent** — replacing a resource with the same value has the same effect
4. **POST is NOT inherently idempotent** — requires explicit idempotency key design
5. **PATCH is NOT inherently idempotent** — depends on whether it is absolute or relative (increment vs set)

```
IDEMPOTENT: PATCH /account/settings { "theme": "dark" }
NOT IDEMPOTENT: PATCH /account/balance { "delta": +10.00 }
```

---

### If an Interviewer Asks...

**"How do you handle duplicate payment requests?"**

Two layers: middleware caches response under the idempotency key (returns cached result on duplicate), plus a database unique constraint on the idempotency key as a second line of defense against race conditions. The database constraint is the authoritative guarantor; the middleware cache is the performance optimization that prevents unnecessary database calls for obvious duplicates.

---

## Key Concepts
- **Idempotency**: An operation that produces the same result whether executed once or multiple times
- **Idempotency key**: A client-provided unique identifier that allows the server to detect and deduplicate duplicate requests
- **At-least-once delivery**: Message broker guarantee that messages will be delivered at least once but possibly multiple times
- **Outbox pattern**: Writing messages to a database table atomically with business data, then publishing them asynchronously for guaranteed delivery
- **Deduplication key**: A unique identifier stored after processing to prevent reprocessing the same message

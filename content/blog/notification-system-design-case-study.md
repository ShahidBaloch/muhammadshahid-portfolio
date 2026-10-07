---
title: "Notification System Design: A Full System Design Case Study"
description: "Full system design for a notification system — requirements, architecture, channel routing, reliability, rate limiting, and .NET implementation."
date: "2026-10-07"
category: "system-design"
tags: ["System Design", "Notification System", ".NET", "ASP.NET Core", "Event-Driven", "Microservices"]
---

## The Problem

"Design a notification system" is one of the most common senior-level system design interview questions. It tests: event-driven architecture, multi-channel delivery, reliability guarantees, rate limiting, and provider failure handling.

Before drawing any architecture: ask requirements questions.

## System Layout

```text
services/
├── Notification.API/                        # entry point — accepts SendNotification requests
│   ├── Controllers/NotificationController.cs
│   └── Program.cs
├── Notification.Router/                     # routes to correct channel worker
│   └── Router.cs                            # BackgroundService reading from main queue
├── Notification.Email.Worker/               # email channel (SendGrid / SES)
│   └── EmailWorker.cs
├── Notification.Sms.Worker/                 # SMS channel (Twilio / Vonage)
│   └── SmsWorker.cs
├── Notification.Push.Worker/               # push (FCM / APNs)
│   └── PushWorker.cs
├── Notification.Templates/                  # template management service
│   └── TemplateService.cs
└── Notification.Contracts/                  # shared event schemas
    ├── SendNotificationRequest.cs
    └── NotificationDelivered.cs
```

Each channel worker is independently deployable and scalable. A broken SMS provider does not affect email delivery.

---

## Step 1: Requirements Clarification

**Functional requirements** (what the system must do):
- Accept notification requests from any internal service
- Support multiple channels: email, SMS, push notification (iOS/Android), in-app notification
- Template management: services should reference a template name, not embed HTML
- User preferences: users can opt out of specific notification types per channel
- Delivery status tracking: did the notification actually reach the user?

**Non-functional requirements** (how the system must behave):
- Scale: 10M notifications/day (~115/second average, with peaks of ~1,000/second)
- Latency: Transactional notifications (password reset, order confirmation) must be sent within 5 seconds
- Marketing notifications: best-effort, can be delayed
- Exactly-once delivery: users must not receive duplicate notifications
- Availability: 99.9% uptime — the notification pipeline must degrade gracefully if a provider is down

**Out of scope**: Real-time chat, notification analytics dashboards (separate service), notification scheduling.

---

## Step 2: High-Level Architecture

```
Internal Services
  OrderService ──────┐
  AuthService ───────┤
  AppointmentService ┘
         │ POST /notifications (HTTP)
         ↓
  ┌──────────────────────┐
  │ Notification API     │   ← Validates, authenticates, queues
  │ (ASP.NET Core)       │
  └──────────────────────┘
         │
         ↓ Writes to message queue
  ┌──────────────────────┐
  │ Azure Service Bus    │   ← Two topics: transactional, marketing
  └──────────────────────┘
         │
    ┌────┴────┬────────────┬────────────┐
    ↓         ↓            ↓            ↓
  Email    SMS Worker   Push Worker  In-App Worker
  Worker  (Twilio)     (APNs/FCM)   (DB insert)
    │
  (SendGrid/Mailjet)
         │
  ┌──────────────────────┐
  │ Delivery Status DB   │   ← PostgreSQL, tracks delivery attempts
  └──────────────────────┘
```

---

## Step 3: API Design

```csharp
// Public API request
public class SendNotificationRequest
{
    [Required] public Guid UserId { get; set; }
    [Required] public string TemplateName { get; set; }  // "order-confirmation", "password-reset"
    [Required] public NotificationPriority Priority { get; set; }  // Transactional, Marketing
    public Dictionary<string, string> TemplateData { get; set; } = new();
    public NotificationChannel[]? Channels { get; set; }  // null = use user preference
}

public enum NotificationPriority { Transactional, Marketing }
public enum NotificationChannel { Email, Sms, Push, InApp }

// Response
public class SendNotificationResponse
{
    public Guid NotificationId { get; set; }
    public string Status { get; set; } = "Queued";
}

// Delivery status endpoint
// GET /notifications/{notificationId}/status
```

---

## Step 4: Key Components

### Notification API Service

Responsibilities:
- Authenticate calling service (service-to-service JWT or API key)
- Validate the request (template exists? user exists?)
- Look up user notification preferences (check opt-outs)
- Render the template with provided data
- Route to appropriate Service Bus topic (transactional vs marketing)
- Return `NotificationId` for status tracking

```csharp
[ApiController]
[Route("api/notifications")]
[Authorize(Policy = "ServiceAuthentication")]
public class NotificationsController : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<SendNotificationResponse>> Send(
        [FromBody] SendNotificationRequest request,
        CancellationToken ct)
    {
        // 1. Validate template exists
        var template = await _templates.GetAsync(request.TemplateName, ct)
            ?? return NotFound($"Template '{request.TemplateName}' not found");
        
        // 2. Check user preferences
        var preferences = await _preferences.GetAsync(request.UserId, ct);
        var channels = request.Channels ?? preferences.PreferredChannels;
        channels = channels.Except(preferences.OptedOutChannels).ToArray();
        
        if (!channels.Any())
            return Ok(new SendNotificationResponse { Status = "Suppressed" });
        
        // 3. Create notification record
        var notificationId = Guid.NewGuid();
        
        // 4. Queue for delivery
        var message = new NotificationMessage
        {
            NotificationId = notificationId,
            UserId = request.UserId,
            Template = template,
            TemplateData = request.TemplateData,
            Channels = channels,
            Priority = request.Priority,
            CreatedAt = DateTime.UtcNow
        };
        
        var topicName = request.Priority == NotificationPriority.Transactional
            ? "notifications-transactional"
            : "notifications-marketing";
        
        await _serviceBus.SendAsync(topicName, message, ct);
        
        return Ok(new SendNotificationResponse { NotificationId = notificationId });
    }
}
```

---

### Channel Workers

Each channel has an independent worker service. This enables:
- Independent scaling (email may need 10x more instances than SMS)
- Independent failure isolation (Twilio down does not affect email)
- Different retry policies per channel

```csharp
public class EmailNotificationWorker : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var message in _serviceBus
            .ReadAsync<NotificationMessage>("notifications-transactional", stoppingToken))
        {
            await ProcessEmailAsync(message, stoppingToken);
        }
    }
    
    private async Task ProcessEmailAsync(
        NotificationMessage message, 
        CancellationToken ct)
    {
        // Idempotency: check if already sent
        if (await _tracking.IsAlreadySentAsync(
            message.NotificationId, NotificationChannel.Email, ct))
        {
            return;  // Duplicate delivery — safe to skip
        }
        
        try
        {
            // Render template
            var (subject, htmlBody) = _renderer.Render(
                message.Template, 
                message.TemplateData, 
                NotificationChannel.Email);
            
            // Get user's email address
            var email = await _userService.GetEmailAsync(message.UserId, ct);
            
            // Send via provider (Polly circuit breaker wraps this)
            await _emailProvider.SendAsync(email, subject, htmlBody, ct);
            
            await _tracking.MarkDeliveredAsync(
                message.NotificationId, NotificationChannel.Email, ct);
        }
        catch (Exception ex) when (!IsTerminalError(ex))
        {
            // Transient error — rethrow to trigger Service Bus retry
            _logger.LogWarning(ex, "Transient email failure for {NotificationId}", 
                message.NotificationId);
            throw;
        }
        catch (Exception ex)
        {
            // Terminal error — record failure, don't retry
            await _tracking.MarkFailedAsync(
                message.NotificationId, NotificationChannel.Email, ex.Message, ct);
        }
    }
}
```

---

### Reliability: Retry + Dead Letter

**Azure Service Bus retry policy**:
- Transient failures: 5 retries with exponential backoff (1s, 2s, 4s, 8s, 16s)
- After 5 retries: move to dead letter queue
- Dead letter queue: monitored by alerting; reviewed manually or by a separate DLQ processor

**Provider circuit breaker** (Polly):
```csharp
// If SendGrid returns 503 multiple times, open the circuit
// Fail fast and let the message go to the retry queue instead of blocking threads
pipeline.AddCircuitBreaker(new CircuitBreakerStrategyOptions
{
    FailureRatio = 0.5,
    MinimumThroughput = 5,
    BreakDuration = TimeSpan.FromMinutes(2)
});
```

---

### Rate Limiting Per Provider

Email providers have per-hour limits. Marketing sends must be throttled:

```csharp
public class RateLimitedEmailProvider : IEmailProvider
{
    private readonly SemaphoreSlim _rateLimitSemaphore;
    private readonly IEmailProvider _inner;
    
    // SendGrid: 100 emails/second on Pro plan
    public RateLimitedEmailProvider(IEmailProvider inner)
    {
        _inner = inner;
        _rateLimitSemaphore = new SemaphoreSlim(100, 100);
    }
    
    public async Task SendAsync(string to, string subject, string body, CancellationToken ct)
    {
        await _rateLimitSemaphore.WaitAsync(ct);
        try
        {
            await _inner.SendAsync(to, subject, body, ct);
        }
        finally
        {
            // Release after 1 second — implements token bucket at 100 per second
            _ = Task.Delay(1000, ct).ContinueWith(_ => _rateLimitSemaphore.Release());
        }
    }
}
```

---

## Step 5: Data Model

```sql
-- Notification record
CREATE TABLE Notifications (
    Id UUID PRIMARY KEY,
    UserId UUID NOT NULL,
    TemplateName VARCHAR(100) NOT NULL,
    Priority SMALLINT NOT NULL,
    CreatedAt TIMESTAMPTZ NOT NULL,
    Status VARCHAR(20) NOT NULL -- Queued, PartiallyDelivered, Delivered, Failed
);

-- Per-channel delivery attempts
CREATE TABLE NotificationDeliveries (
    Id UUID PRIMARY KEY,
    NotificationId UUID REFERENCES Notifications(Id),
    Channel SMALLINT NOT NULL,
    Status VARCHAR(20) NOT NULL,  -- Pending, Delivered, Failed, Suppressed
    AttemptedAt TIMESTAMPTZ,
    DeliveredAt TIMESTAMPTZ,
    FailureReason TEXT,
    ExternalMessageId VARCHAR(200)  -- Provider's ID for delivery receipts
);
CREATE INDEX IX_NotificationDeliveries_NotificationId ON NotificationDeliveries(NotificationId);
```

---

## Step 6: Scale Considerations

| Component | Bottleneck | Mitigation |
|---|---|---|
| Notification API | CPU/memory | Horizontal scale — stateless service |
| Service Bus | Throughput | Two separate topics (transactional/marketing) with separate quotas |
| Email Worker | Provider rate limit | Rate limiting + multiple SendGrid IP pools |
| SMS Worker | Twilio throughput | Concurrent consumer instances up to Twilio partition limit |
| Delivery Status DB | Write throughput on peaks | Batch inserts, async status updates |
| Template Rendering | CPU-bound for complex templates | In-memory cache of parsed templates |

---

## If an Interviewer Asks...

**"How would you ensure a user doesn't receive the same notification twice?"**

Two layers: the `NotificationDeliveries` table has a unique constraint on `(NotificationId, Channel)` — if a worker tries to insert a duplicate, the database rejects it. Before calling the provider, the worker checks this table. If an entry already exists (delivered or attempted), it skips. This handles both at-least-once delivery duplicates from the message broker and retries from transient provider failures.

**"How does the system handle push notifications to offline devices?"**

APNs and FCM queue push notifications server-side for devices that are temporarily offline. The notification is stored on Apple's/Google's servers with a TTL. When the device comes online, it receives the queued notifications. If the TTL expires, the notification is dropped — this is acceptable for marketing notifications but not for transactional ones. For transactional offline users, fall back to email as the guaranteed delivery channel.

---
title: "Circuit Breaker Pattern in ASP.NET Core with Polly"
description: "Implement the circuit breaker pattern in ASP.NET Core using Polly. Prevent cascade failures in microservices with open, closed, and half-open states."
date: "2026-10-07"
category: "architecture"
tags: ["Circuit Breaker", "Polly", ".NET", "Resilience", "Microservices", "ASP.NET Core"]
faq:
  - q: "What is the circuit breaker pattern in .NET?"
    a: "A circuit breaker wraps calls to external dependencies and tracks failure rates. When failures exceed a threshold, the circuit opens and calls fail immediately without hitting the dependency. After a wait period, it half-opens to test if the dependency recovered. Polly v8's ResiliencePipeline implements this in ASP.NET Core."
  - q: "When should I use a circuit breaker in ASP.NET Core?"
    a: "Use it on every synchronous HTTP call to external services and on database calls that can time out under load. Do not add circuit breakers to purely internal method calls or in-process operations — the overhead adds latency without protection."
  - q: "What is the difference between retry and circuit breaker in Polly?"
    a: "Retry attempts the operation again after a transient failure. A circuit breaker stops attempts entirely when a dependency is consistently failing. Use both together: retry for transient errors, circuit breaker to stop retrying a permanently degraded service."
---

In 2012, a bug in Amazon's ELB caused a cascade failure that took down a significant portion of AWS for several hours. The proximate cause was a single configuration service that started responding slowly. Services that depended on it kept trying, exhausting their thread pools, blocking downstream callers, who then exhausted *their* thread pools — until the failure propagated through the entire dependency graph.

This is a cascade failure. It is the distributed systems equivalent of one bad actor blocking a narrow corridor and causing a crowd crush behind them. The circuit breaker pattern prevents it by detecting the failure early and stopping calls to the broken dependency before the damage spreads.

Microsoft documents the pattern in the [Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker). In .NET, [Microsoft.Extensions.Resilience](https://learn.microsoft.com/en-us/dotnet/core/resilience/) is the official abstraction built on Polly v8.

## Project Layout

```text
src/
├── Clinic.Application/
│   └── Resilience/
│       └── IResiliencePipelineProvider.cs  # abstraction the app layer depends on
├── Clinic.Infrastructure/
│   └── Resilience/
│       ├── ResiliencePipelineProvider.cs   # Polly pipeline factory
│       └── ResilienceExtensions.cs         # AddCircuitBreaker() helper
└── Clinic.Web/
    └── Program.cs                           # AddHttpClient + UseResilienceHandler
```

The Polly policy factory lives in Infrastructure. The domain and application projects never reference Polly directly.

---

### The Problem: Why Slow Dependencies Are Worse Than Down Dependencies

Intuitively, a completely down dependency seems worse than a slow one. Paradoxically, from a cascade failure perspective, it is often the opposite.

When a dependency is completely down, callers get fast errors (connection refused), threads are freed immediately, and the system can handle the failure gracefully.

When a dependency is slow — responding in 8 seconds instead of 80ms — every thread that calls it waits 8 seconds before being freed. If your ASP.NET Core service handles 500 requests per second and each one calls the slow dependency, within 8 seconds you have accumulated 4,000 waiting threads. Your thread pool is exhausted. Incoming requests queue up. Your own service starts responding slowly or returning 503. Your callers then start experiencing the same problem.

Without a circuit breaker, a single slow microservice can cascade failures through every service that depends on it.

---

### The Three States

A circuit breaker has three states, analogous to an electrical circuit breaker:

**Closed** (normal operation): Requests flow through to the dependency. The circuit breaker monitors success and failure rates. This is the steady state.

**Open** (failure detected): The failure threshold has been crossed. All requests fail immediately without calling the dependency. This is the protective state — it prevents resource exhaustion and gives the dependency time to recover.

**Half-Open** (recovery probe): After a timeout period, the circuit allows a limited number of test requests through. If they succeed, the circuit closes again. If they fail, it opens again. This is the adaptive state.

```
[Closed] ──(failures exceed threshold)──> [Open]
   ^                                          |
   |              (timeout expires)           |
   └──(probes succeed)──── [Half-Open] <──────┘
```

The half-open state is what makes circuit breakers adaptive rather than permanent blockers. Without it, a circuit breaker that opened during a 2-minute database restart would require manual intervention to reopen.

---

### Installing Polly v8

Polly v8 (part of the `Microsoft.Extensions.Resilience` ecosystem) replaces the old policy-based API with a `ResiliencePipeline` model that is more composable and testable:

```bash
dotnet add package Microsoft.Extensions.Http.Resilience
dotnet add package Polly.Extensions
```

---

### Basic Circuit Breaker with Polly v8

```csharp
// Program.cs / DI registration
builder.Services.AddHttpClient<IPaymentGatewayClient, PaymentGatewayClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["PaymentGateway:BaseUrl"]);
    client.Timeout = TimeSpan.FromSeconds(10);
})
.AddResilienceHandler("payment-gateway", pipeline =>
{
    // 1. Timeout — prevent waiting forever
    pipeline.AddTimeout(TimeSpan.FromSeconds(5));
    
    // 2. Circuit breaker — detect and stop calling broken dependencies
    pipeline.AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
    {
        // Open circuit after 50% failure rate across a 30-second sampling window
        FailureRatio = 0.5,
        SamplingDuration = TimeSpan.FromSeconds(30),
        
        // Require at least 10 requests before circuit can open
        // (prevents opening on the first failed request after startup)
        MinimumThroughput = 10,
        
        // Stay open for 30 seconds, then probe with half-open
        BreakDuration = TimeSpan.FromSeconds(30),
        
        // Called when circuit state changes — critical for monitoring
        OnOpened = args =>
        {
            _logger.LogError(
                "Circuit breaker OPENED for payment gateway. " +
                "Failure ratio: {FailureRatio}. Break duration: {BreakDuration}s",
                args.BreakDuration,
                args.BreakDuration.TotalSeconds);
            return ValueTask.CompletedTask;
        },
        OnClosed = args =>
        {
            _logger.LogInformation("Circuit breaker CLOSED — payment gateway recovered");
            return ValueTask.CompletedTask;
        },
        OnHalfOpened = args =>
        {
            _logger.LogInformation("Circuit breaker HALF-OPEN — probing payment gateway");
            return ValueTask.CompletedTask;
        }
    });
    
    // 3. Retry — handle transient failures before circuit breaker counts them
    // ORDER MATTERS: Timeout > Circuit Breaker > Retry (outer to inner)
    pipeline.AddRetry(new HttpRetryStrategyOptions
    {
        MaxRetryAttempts = 2,
        Delay = TimeSpan.FromMilliseconds(500),
        BackoffType = DelayBackoffType.Exponential,
        UseJitter = true, // Prevent retry storms
        ShouldHandle = new PredicateBuilder<HttpResponseMessage>()
            .Handle<TimeoutRejectedException>()
            .HandleResult(r => r.StatusCode == HttpStatusCode.TooManyRequests)
            .HandleResult(r => r.StatusCode == HttpStatusCode.ServiceUnavailable)
        // NOT retrying: circuit open (BrokenCircuitException should not be retried)
    });
});
```

---

### The Order of Resilience Strategies Matters

A common mistake is putting strategies in the wrong order. In Polly v8, strategies are applied from outermost (first added) to innermost (last added):

```
Request → [Timeout] → [Circuit Breaker] → [Retry] → [Actual HTTP call]
```

**Why this order?**

- **Timeout (outer)**: Caps the total time for all retry attempts combined. Without this being outer, retries could multiply your timeout.
- **Circuit Breaker (middle)**: Counts failures. If the retry exhausts its attempts, the circuit breaker sees one overall failure — not three individual retry failures. This prevents retries from prematurely opening the circuit.
- **Retry (inner)**: Handles transient failures close to the actual call. Only retries transient errors, not circuit-open states.

If you put Retry outside Circuit Breaker, a single request with 3 retries registers as 3 failures against the circuit breaker threshold, causing it to open too aggressively.

---

### Circuit Breaker with Fallback

A circuit breaker in the open state throws `BrokenCircuitException`. Without handling this, your service returns a 500 to the caller. Better: return a degraded but acceptable response.

```csharp
// Service layer — handle open circuit gracefully
public class ProductRecommendationService
{
    private readonly IRecommendationEngineClient _client;
    private readonly ILogger<ProductRecommendationService> _logger;

    public async Task<IReadOnlyList<ProductDto>> GetRecommendationsAsync(
        string userId, 
        CancellationToken cancellationToken = default)
    {
        try
        {
            return await _client.GetPersonalizedRecommendationsAsync(userId, cancellationToken);
        }
        catch (BrokenCircuitException ex)
        {
            // Circuit is open — recommendation engine is unavailable
            // Fallback: return curated popular items (not personalized but acceptable)
            _logger.LogWarning(
                ex,
                "Recommendation engine circuit open for user {UserId}. " + 
                "Returning fallback popular items.",
                userId);
            
            return await GetPopularItemsFallbackAsync(cancellationToken);
        }
        catch (TimeoutRejectedException ex)
        {
            _logger.LogWarning(
                ex, 
                "Recommendation engine timed out for user {UserId}. Using fallback.",
                userId);
            
            return await GetPopularItemsFallbackAsync(cancellationToken);
        }
    }

    private Task<IReadOnlyList<ProductDto>> GetPopularItemsFallbackAsync(
        CancellationToken cancellationToken)
    {
        // Could be: hardcoded popular items, cached response from last successful call,
        // items from a simpler/cheaper data source, or empty list with a message
        return _popularItemsCache.GetPopularItemsAsync(cancellationToken);
    }
}
```

**What makes a good fallback?**

- Cached data from the last successful call (stale is better than nothing)
- A simpler/cheaper data source (popular items instead of personalized recommendations)
- An empty/default response with a user-visible message
- Deferred processing (queue the request for later processing)

**What is a bad fallback?**

- Calling the same failing dependency again (defeats the purpose)
- Returning incorrect data that will cause user-facing errors downstream
- Silently swallowing errors that the caller needs to handle (payment failures especially)

---

### Distinguishing Transient Failures from Business Errors

A critical nuance: circuit breakers should only open on *dependency health failures*, not on *valid business responses*.

```csharp
// WRONG: This would open the circuit on valid validation errors
pipeline.AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
{
    ShouldHandle = new PredicateBuilder<HttpResponseMessage>()
        .HandleResult(r => !r.IsSuccessStatusCode) // Includes 400, 404, 422!
});

// CORRECT: Only open on server errors and network failures
pipeline.AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
{
    ShouldHandle = new PredicateBuilder<HttpResponseMessage>()
        .Handle<HttpRequestException>()
        .Handle<TimeoutRejectedException>()
        .HandleResult(r => r.StatusCode == HttpStatusCode.InternalServerError)
        .HandleResult(r => r.StatusCode == HttpStatusCode.BadGateway)
        .HandleResult(r => r.StatusCode == HttpStatusCode.ServiceUnavailable)
        .HandleResult(r => r.StatusCode == HttpStatusCode.GatewayTimeout)
    // 400 Bad Request, 404 Not Found, 422 Unprocessable Entity = business errors, not circuit triggers
});
```

A 422 from your payment gateway means "invalid card number" — a valid business response that should never open the circuit. A 503 means the gateway is overwhelmed — that should open the circuit.

---

### Monitoring: Making the Circuit Breaker Observable

A circuit breaker that opens silently is useless for operations. You need:

1. **Logging** on state changes (as shown in the registration above)
2. **Metrics** for alerting (how often is the circuit open?)
3. **Dashboard visibility** so on-call engineers know immediately

With OpenTelemetry and ASP.NET Core 8:

```csharp
// Polly's built-in telemetry integration
builder.Services.AddResiliencePipeline("payment-gateway-metrics", pipeline =>
{
    pipeline.ConfigureTelemetry(new TelemetryOptions
    {
        LoggerFactory = LoggerFactory.Create(b => b.AddConsole()),
        MeteringEnricher = new CustomMeteringEnricher() // Add custom tags
    });
});

// In your observability setup — capture Polly events as metrics
builder.Services.AddOpenTelemetry()
    .WithMetrics(metrics =>
    {
        metrics.AddMeter("Polly"); // Polly emits circuit_breaker.state.changed metrics
    });
```

**Alert rules to configure:**
- `circuit_breaker_state = open` for > 30 seconds → Page on-call
- `circuit_breaker_failure_rate > 30%` over 5 minutes → Warning notification
- `circuit_breaker_open_count` increasing over time → Dependency health trend

---

### When Circuit Breakers Are Not the Right Tool

Circuit breakers solve one specific problem: preventing cascade failures from slow or failing external dependencies. They are not a general-purpose resilience solution.

**Do not use circuit breakers for:**
- **Database queries within your own service**: Use connection pooling, query timeouts, and execution strategy retries instead. A circuit breaker on your own database would leave your service completely broken for 30 seconds during a brief connection pool exhaustion.
- **Business logic errors**: Validation failures, authentication errors, and business rule violations are not dependency health issues.
- **Idempotent operations where retrying is safe**: Pure retries with exponential backoff may be sufficient without the circuit breaker complexity.

**Do use circuit breakers for:**
- External payment gateways (Stripe, PayPal)
- Third-party APIs (maps, messaging, fraud detection)
- Other microservices you do not control
- Databases that are truly external to your service in a microservices architecture
- ML inference services (often the first thing to become slow under load)

---

### A Complete Resilience Configuration for a SaaS API

Here is a complete, production-calibrated resilience pipeline for an external API call in a healthcare SaaS system:

```csharp
builder.Services.AddHttpClient<IPatientVerificationClient, PatientVerificationClient>(client =>
{
    client.BaseAddress = new Uri(config["PatientVerification:BaseUrl"]);
})
.AddResilienceHandler("patient-verification", pipeline =>
{
    // Total timeout for one full request attempt (including all retries)
    pipeline.AddTimeout(new HttpTimeoutStrategyOptions
    {
        Timeout = TimeSpan.FromSeconds(15)
    });

    // Circuit breaker — protects against sustained failures
    pipeline.AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
    {
        FailureRatio = 0.4,           // Open at 40% failures
        SamplingDuration = TimeSpan.FromSeconds(60),
        MinimumThroughput = 5,        // Need at least 5 requests to assess
        BreakDuration = TimeSpan.FromSeconds(60), // Stay open 60s
        ShouldHandle = new PredicateBuilder<HttpResponseMessage>()
            .Handle<HttpRequestException>()
            .Handle<TimeoutRejectedException>()
            .HandleResult(r => (int)r.StatusCode >= 500),
        OnOpened = args => { 
            logger.LogError("Patient verification circuit OPENED"); 
            return ValueTask.CompletedTask; 
        }
    });

    // Per-attempt timeout (single attempt, before retry)
    pipeline.AddTimeout(new HttpTimeoutStrategyOptions
    {
        Timeout = TimeSpan.FromSeconds(4)
    });

    // Retry for transient failures
    pipeline.AddRetry(new HttpRetryStrategyOptions
    {
        MaxRetryAttempts = 2,
        Delay = TimeSpan.FromSeconds(1),
        BackoffType = DelayBackoffType.Exponential,
        UseJitter = true,
        ShouldHandle = new PredicateBuilder<HttpResponseMessage>()
            .Handle<TimeoutRejectedException>()
            .HandleResult(r => r.StatusCode == HttpStatusCode.ServiceUnavailable)
    });
});
```

---

### If an Interviewer Asks...

**"What are the three circuit breaker states?"**

Closed (normal, requests pass through), Open (failures exceeded threshold, requests fail fast), and Half-Open (probe state after break duration expires, limited test requests allowed through). The Half-Open state is what makes the pattern adaptive — it allows automatic recovery when the dependency heals without requiring manual intervention.

**"Why does retry order matter relative to circuit breaker?"**

If retries are outside the circuit breaker, each retry attempt counts as a separate failure against the circuit breaker threshold, causing it to open too aggressively. With retries inside the circuit breaker, the outer circuit breaker sees one composite failure after all retries are exhausted — giving transient failures a chance to self-heal before the circuit opens.

---

## Trade-offs Covered
- Circuit breaker open threshold (too aggressive vs too permissive)
- Fallback quality (stale data vs no data vs incorrect data)
- Retry + circuit breaker ordering (outer vs inner placement)
- Business errors vs health failures (what should/should not open a circuit)
- Circuit break duration (too short = constant probing, too long = prolonged unavailability)

## Key Concepts
- **Circuit breaker**: A resilience pattern that stops calls to failing dependencies when a failure threshold is crossed
- **Closed state**: Normal operation — requests flow through
- **Open state**: Failures detected — requests fail immediately without calling dependency
- **Half-open state**: Recovery probe — limited test requests allowed through
- **BrokenCircuitException**: Polly exception thrown when a circuit is in open state
- **Cascade failure**: A failure in one service that propagates to dependent services through resource exhaustion
- **Jitter**: Random variance added to retry delays to prevent multiple callers retrying simultaneously (retry storm)

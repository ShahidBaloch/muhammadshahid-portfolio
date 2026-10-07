---
title: "Microservices Interview Questions for .NET Developers"
description: "Microservices interview prep for .NET developers. Real questions on service communication, data consistency, circuit breakers, and service boundaries."
date: "2026-10-07"
category: "interview-prep"
tags: ["Microservices", ".NET", "Interview Questions", "Distributed Systems", "Architecture"]
---

## Question 1: "When Would You Choose Microservices Over a Monolith?"

### 30-Second Answer
When independent deployment, independent scaling, and team autonomy become more valuable than the simplicity of a single codebase. Microservices are not a starting point — they are an evolution when the cost of coordination in a monolith exceeds the cost of distributed systems complexity.

### Strong Answer
I start with a modular monolith — clear module boundaries, no cross-module direct database access, communication through interfaces or events. This gives team autonomy and clean architecture without the operational overhead of distributed services.

I extract to microservices when:
- **Independent deployment velocity**: One team's deployments are blocked by another team's code in the same codebase
- **Independent scaling**: The payments module needs 10x more compute than the reporting module
- **Technology choice**: One module benefits significantly from a different runtime or language
- **Compliance isolation**: Certain data (payment cards) must be in a separately auditable, separately deployed service

What I avoid: "We're doing microservices because Netflix does." Netflix extracted from a monolith after reaching scale. Most systems never reach that scale.

### Common Follow-up Questions
- "What is the cost of microservices?" — Network latency between services, distributed transactions, service discovery, more infrastructure, harder debugging
- "How do you handle distributed tracing?" — OpenTelemetry with correlation IDs propagated through HTTP headers and message broker headers

### Red Flags
- "Microservices are better than monoliths" without qualification
- Not mentioning the operational complexity cost
- No mention of when microservices is the wrong choice

---

## Question 2: "How Do You Handle Transactions Across Multiple Microservices?"

### 30-Second Answer
You cannot use ACID transactions across service boundaries. The Saga pattern replaces them: each step executes a local transaction and emits an event or command. If any step fails, compensating transactions undo the completed steps. Eventual consistency replaces atomicity.

### Strong Answer
Two-phase commit (2PC) is the distributed systems textbook answer, but in microservices it causes lock contention across services and blocks if any participant is temporarily unavailable. The Saga pattern is the production-correct approach.

**Choreography saga**: Each service listens for events and reacts. No central coordinator. Service A emits `OrderCreated`, Service B listens and emits `InventoryReserved`, Service C listens and emits `PaymentProcessed`. If payment fails, Service C emits `PaymentFailed`, Service B listens and releases inventory.

**Orchestration saga**: A central saga coordinator (MassTransit state machine) explicitly commands each step. Easier to audit and debug, but the orchestrator is a new dependency.

The two requirements:
1. Every step must be idempotent (messages can be delivered more than once)
2. Every step must have a corresponding compensating transaction

### Common Follow-up Questions
- "What is a compensating transaction?" — Not a database rollback. It is application code that creates a new record reversing the effect (a refund record, an inventory release event). The original transaction remains visible in audit logs.
- "How do you handle partial failures?" — The saga's compensation sequence handles this: if step 3 fails, execute compensation for step 2 and step 1.

### Red Flags
- "Use 2PC" without acknowledging its limitations in microservices
- Not mentioning idempotency as a requirement
- Describing compensation as "rollback" — compensation is a forward-moving operation, not a database undo

---

## Question 3: "How Does a Circuit Breaker Work?"

### 30-Second Answer
A circuit breaker monitors failure rate for calls to a dependency. When failures exceed a threshold, it "opens" and fails fast — subsequent calls return an error immediately without calling the dependency. After a timeout, it enters "half-open" and allows a test request through. If it succeeds, the circuit closes and normal operation resumes.

### Strong Answer
Three states:
- **Closed**: Normal operation. Failures counted. Circuit opens when failure ratio exceeds threshold.
- **Open**: Fast-fail mode. All requests return immediately with a fallback or error. Dependency is not called. Prevents cascade failures.
- **Half-open**: After a break duration, one test request is allowed through. Success → close. Failure → open again.

```csharp
// Polly v8
services.AddHttpClient<IOrdersClient, OrdersClient>()
    .AddResilienceHandler("orders-pipeline", pipeline =>
    {
        pipeline.AddCircuitBreaker(new CircuitBreakerStrategyOptions
        {
            FailureRatio = 0.5,           // Open when 50% of requests fail
            MinimumThroughput = 10,        // Need at least 10 requests to evaluate
            SamplingDuration = TimeSpan.FromSeconds(30),
            BreakDuration = TimeSpan.FromSeconds(30),
            ShouldHandle = new PredicateBuilder()
                .Handle<HttpRequestException>()
                .HandleResult<HttpResponseMessage>(r => 
                    r.StatusCode == HttpStatusCode.ServiceUnavailable)
        });
        
        pipeline.AddTimeout(TimeSpan.FromSeconds(5));
        
        pipeline.AddRetry(new RetryStrategyOptions
        {
            MaxRetryAttempts = 2,
            Delay = TimeSpan.FromMilliseconds(500),
            BackoffType = DelayBackoffType.Exponential
        });
    });
```

**Why the order matters**: Retry is innermost (wraps each attempt), timeout wraps the retry (total time budget), circuit breaker is outermost (sees the full outcome including retried attempts).

**Fallback pattern**: When the circuit is open, return cached data or a degraded response:
```csharp
pipeline.AddFallback(new FallbackStrategyOptions<ProductDto>
{
    ShouldHandle = new PredicateBuilder<ProductDto>()
        .Handle<BrokenCircuitException>()
        .Handle<TimeoutRejectedException>(),
    FallbackAction = args => 
        ValueTask.FromResult(Outcome.FromResult(ProductDto.Unavailable()))
});
```

### Red Flags
- Describing circuit breaker as just "retry logic" — they solve different problems
- Forgetting the half-open state
- Not mentioning that retries and circuit breakers work together but must be ordered correctly

---

## Question 4: "How Do Services Discover Each Other?"

### 30-Second Answer
In Kubernetes, services discover each other via Kubernetes DNS — each service has a stable DNS name. Outside Kubernetes, use a service registry (Consul, Eureka) or API gateway. In Azure, App Service Environment uses Application Gateway or APIM for routing.

### Strong Answer
**In Kubernetes** (the most common .NET microservices deployment today):
- Every service gets a stable DNS name: `order-service.namespace.svc.cluster.local`
- HTTP calls between services use these DNS names
- Kubernetes Service objects handle load balancing across pods
- For external traffic: Ingress or API Management

**Without Kubernetes**:
- **Server-side discovery**: API gateway or load balancer knows service addresses; clients call the gateway
- **Client-side discovery**: Services register with a service registry (Consul); clients query the registry before calling

**For .NET**: Microsoft.Extensions.ServiceDiscovery (introduced in .NET 8) supports multiple discovery providers and integrates with `HttpClientFactory`:

```csharp
builder.Services.AddHttpClient<IInventoryClient, InventoryClient>(client =>
    client.BaseAddress = new Uri("https+http://inventory-service"))
    .AddServiceDiscovery();  // Resolves "inventory-service" via configured provider
```

### Red Flags
- Hardcoding service URLs in configuration (breaks in any dynamic environment)
- Not mentioning that DNS is the default in Kubernetes — over-engineering with Consul when Kubernetes DNS suffices

---

## Question 5: "How Do You Handle Configuration in Microservices?"

### 30-Second Answer
Centralise configuration in a config service or secrets manager. Do not store secrets in environment variables or config files. For .NET on Azure: Azure Key Vault for secrets, Azure App Configuration for feature flags and non-secret config, with change notifications for hot reload.

### Strong Answer
Three categories:
1. **Non-secret config** (feature flags, timeouts, connection strings without credentials): Azure App Configuration, AWS Parameter Store, Consul Key/Value
2. **Secrets** (passwords, API keys, certificates): Azure Key Vault, AWS Secrets Manager, HashiCorp Vault — never in config files, never in source control
3. **Service-specific runtime config**: Kubernetes ConfigMaps for environment-specific values injected as environment variables

```csharp
builder.Configuration
    .AddAzureAppConfiguration(options =>
    {
        options.Connect(connectionString)
            .ConfigureKeyVault(kv => kv.SetCredential(new DefaultAzureCredential()))
            .ConfigureRefresh(refresh =>
            {
                refresh.Register("App:Settings:Sentinel", refreshAll: true);
                refresh.SetCacheExpiration(TimeSpan.FromMinutes(5));
            });
    });

// Enable hot reload in the request pipeline
app.UseAzureAppConfiguration();
```

---

## Question 6: "What Is the Database-per-Service Pattern?"

### 30-Second Answer
Each microservice owns its own database — no service accesses another service's database directly. This ensures services can be deployed independently and use the most appropriate database technology for their workload. Cross-service data needs go through the service's API or integration events.

### Strong Answer
**Why**: If two services share a database, they cannot be deployed independently (schema changes in one break the other), they cannot scale independently, and they cannot use different database technologies.

**What it enables**:
- Service A uses SQL Server for transactional data
- Service B uses Cosmos DB for document storage
- Service C uses Redis for session data
- Each deploys, scales, and fails independently

**The cost**: No cross-service joins. Data that used to be a single JOIN query now requires either:
- Calling Service B's API from Service A's query handler
- Maintaining a denormalized read model in Service A built from Service B's events (CQRS read side)

**Pattern for cross-service reads**:
```csharp
// Option 1: API composition (synchronous, simpler)
public class OrderDetailsQueryHandler
{
    public async Task<OrderDetailsDto> Handle(GetOrderDetailsQuery query, CancellationToken ct)
    {
        var order = await _orderRepository.GetByIdAsync(query.OrderId, ct);
        var customer = await _customerServiceClient.GetAsync(order.CustomerId, ct);  // API call
        var products = await _catalogServiceClient.GetBatchAsync(
            order.Lines.Select(l => l.ProductId), ct);  // API call
        
        return OrderDetailsDto.From(order, customer, products);
    }
}
```

### Red Flags
- "Services can share a database if they're careful" — this defeats the purpose of microservices
- Not mentioning that cross-service joins must be handled differently

---

## Quick-Fire Answers

**"What is eventual consistency and when is it acceptable?"**
Eventual consistency means different services may temporarily have different views of the same data, but will converge given enough time. Acceptable for: notifications, analytics, search indexes, recommendation engines. Not acceptable for: balance checks, inventory availability before payment, access control.

**"What is the difference between synchronous and asynchronous communication in microservices?"**
Synchronous (HTTP/gRPC): caller blocks until response. Simple, consistent view of data, but temporal coupling — both services must be available simultaneously. Asynchronous (message broker): caller publishes and continues; consumer processes independently. Temporal decoupling, higher resilience, but eventual consistency and harder debugging.

**"How do you test microservices?"**
Unit test domain logic in isolation. Integration test the service's own database with testcontainers. Contract test service APIs with consumer-driven contracts (Pact). End-to-end test the critical happy paths only — full E2E tests are slow and brittle.

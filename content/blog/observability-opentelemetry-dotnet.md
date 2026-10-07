---
title: "Observability in .NET: Logs, Traces, and Metrics Strategy"
description: "The three pillars of observability in .NET — when to use structured logs, distributed traces, and metrics. Strategy guide with Serilog and OpenTelemetry."
date: "2026-10-07"
category: "architecture"
tags: ["Observability", "OpenTelemetry", "ASP.NET Core", ".NET", "Logging", "Distributed Tracing", "Metrics"]
---

## Why Observability Matters

Without observability, a production issue is a guessing game. "Something is slow" tells you nothing. "The P99 latency on `/api/orders` spiked to 8 seconds at 14:32, correlated with a jump in SQL Server connection wait time, and the trace shows 6 consecutive timeouts to the inventory service" tells you exactly where to look.

Observability is the three pillars:
1. **Logs**: What happened, in what order, for a specific request
2. **Traces**: How a request flowed through the system (which services, which operations, how long each took)
3. **Metrics**: Aggregate numbers over time (requests/sec, error rate, P95 latency, cache hit rate)

Microsoft's [OpenTelemetry .NET documentation](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-instrumentation-walkthroughs) and the [.NET observability guidance](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/) are the authoritative references.

## Project Layout

```text
src/
├── Clinic.Web/
│   └── Program.cs                          # AddSerilog() + AddOpenTelemetry() + AddPrometheus()
├── Clinic.Infrastructure/
│   └── Observability/
│       ├── ObservabilityExtensions.cs      # single AddObservability() wires all three pillars
│       └── ClinicActivitySource.cs         # ActivitySource("Clinic.Api") singleton
└── Clinic.Application/
    └── Telemetry/
        └── IActivityProvider.cs            # abstraction for custom spans in domain/application code
```

Observability setup lives in Infrastructure. The domain and application layers reference only `IActivityProvider` — they never import OpenTelemetry directly.

---

## Pillar 1: Structured Logging with Serilog

Structured logging stores logs as key-value pairs (not raw strings) so they are searchable and aggregatable in tools like Seq, Elasticsearch, or Azure Monitor.

```bash
dotnet add package Serilog.AspNetCore
dotnet add package Serilog.Sinks.Console
dotnet add package Serilog.Sinks.Seq
```

```csharp
// Program.cs — configure Serilog before building the host
Log.Logger = new LoggerConfiguration()
    .Enrich.FromLogContext()
    .Enrich.WithMachineName()
    .Enrich.WithEnvironmentName()
    .MinimumLevel.Information()
    .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.EntityFrameworkCore.Database.Command", LogEventLevel.Warning)
    .WriteTo.Console(new RenderedCompactJsonFormatter())  // Structured JSON to stdout
    .WriteTo.Seq("http://seq:5341")  // Searchable log server
    .CreateLogger();

builder.Host.UseSerilog();
builder.Services.AddSerilogRequestLogging();  // Per-request structured log
```

**Structured log message — key principle**:
```csharp
// BAD: String interpolation — fields are embedded in the message string, not searchable
_logger.LogInformation($"Order {orderId} placed for customer {customerId}");

// GOOD: Message template — orderId and customerId are separate structured fields
_logger.LogInformation("Order {OrderId} placed for customer {CustomerId}", 
    orderId, customerId);

// BETTER: Scoped context — adds fields to all logs within the scope
using (_logger.BeginScope(new Dictionary<string, object>
{
    ["OrderId"] = orderId,
    ["TenantId"] = tenantId
}))
{
    _logger.LogInformation("Processing order placement");
    _logger.LogInformation("Inventory reserved");
    _logger.LogInformation("Payment processed");
    // All three logs automatically include OrderId and TenantId
}
```

**Correlation ID middleware** — links all logs for a single request:
```csharp
public class CorrelationIdMiddleware
{
    private readonly RequestDelegate _next;
    
    public async Task InvokeAsync(HttpContext context)
    {
        var correlationId = context.Request.Headers["X-Correlation-ID"]
            .FirstOrDefault() ?? Guid.NewGuid().ToString();
        
        context.Response.Headers["X-Correlation-ID"] = correlationId;
        
        // Add to log context — all logs in this request will include it
        using (LogContext.PushProperty("CorrelationId", correlationId))
        {
            await _next(context);
        }
    }
}
```

---

## Pillar 2: Distributed Tracing with OpenTelemetry

Distributed tracing shows how a request flows across services. Each service adds a "span" to the trace, with timing and metadata. The trace is correlated by a Trace ID propagated in HTTP headers.

```bash
dotnet add package OpenTelemetry.Extensions.Hosting
dotnet add package OpenTelemetry.Instrumentation.AspNetCore
dotnet add package OpenTelemetry.Instrumentation.Http
dotnet add package OpenTelemetry.Instrumentation.EntityFrameworkCore
dotnet add package OpenTelemetry.Exporter.Jaeger
```

```csharp
builder.Services.AddOpenTelemetry()
    .WithTracing(tracing =>
    {
        tracing
            .SetResourceBuilder(ResourceBuilder.CreateDefault()
                .AddService("order-service", serviceVersion: "1.0"))
            .AddAspNetCoreInstrumentation(options =>
            {
                options.RecordException = true;
                options.Filter = ctx => !ctx.Request.Path.StartsWithSegments("/health");
            })
            .AddHttpClientInstrumentation()  // Traces outgoing HTTP calls
            .AddEntityFrameworkCoreInstrumentation(options =>
            {
                options.SetDbStatementForText = true;  // Includes SQL in spans
            })
            .AddSource("MyApp.Orders")  // Custom activity source
            .AddJaegerExporter(options =>
            {
                options.AgentHost = "jaeger";
                options.AgentPort = 6831;
            });
    });

// Custom span for domain operations
public class PlaceOrderCommandHandler
{
    private static readonly ActivitySource ActivitySource = 
        new("MyApp.Orders");
    
    public async Task Handle(PlaceOrderCommand command, CancellationToken ct)
    {
        using var activity = ActivitySource.StartActivity("PlaceOrder");
        activity?.SetTag("order.customer_id", command.CustomerId);
        
        try
        {
            var order = Order.Create(command.CustomerId, command.Items);
            
            using (ActivitySource.StartActivity("SaveOrder"))
            {
                await _orders.SaveAsync(order, ct);
            }
            
            activity?.SetTag("order.id", order.Id);
            return order.Id;
        }
        catch (Exception ex)
        {
            activity?.SetStatus(ActivityStatusCode.Error, ex.Message);
            activity?.RecordException(ex);
            throw;
        }
    }
}
```

**Propagating trace context through message brokers** (MassTransit does this automatically):
```csharp
builder.Services.AddMassTransit(config =>
{
    config.AddOpenTelemetryInstrumentation();  // Propagates W3C trace context in message headers
});
```

---

## Pillar 3: Metrics with OpenTelemetry

Metrics are aggregate numbers over time — the foundation for dashboards and alerts.

```csharp
builder.Services.AddOpenTelemetry()
    .WithMetrics(metrics =>
    {
        metrics
            .SetResourceBuilder(ResourceBuilder.CreateDefault()
                .AddService("order-service"))
            .AddAspNetCoreInstrumentation()   // HTTP request count, duration, error rate
            .AddHttpClientInstrumentation()    // Outbound HTTP metrics
            .AddRuntimeInstrumentation()       // GC, thread pool, memory
            .AddMeter("MyApp.Orders")         // Custom business metrics
            .AddPrometheusExporter();          // Expose /metrics endpoint for Prometheus
    });

// Custom business metrics
public class OrderMetrics
{
    private readonly Counter<long> _ordersPlaced;
    private readonly Histogram<double> _orderValue;
    private readonly ObservableGauge<int> _pendingOrders;
    private int _pendingOrderCount;
    
    public OrderMetrics(IMeterFactory meterFactory)
    {
        var meter = meterFactory.Create("MyApp.Orders");
        
        _ordersPlaced = meter.CreateCounter<long>(
            "orders.placed",
            description: "Total number of orders placed");
        
        _orderValue = meter.CreateHistogram<double>(
            "orders.value",
            unit: "GBP",
            description: "Distribution of order values");
        
        _pendingOrders = meter.CreateObservableGauge(
            "orders.pending",
            () => _pendingOrderCount,
            description: "Number of orders awaiting processing");
    }
    
    public void RecordOrderPlaced(decimal value, string tenantId)
    {
        _ordersPlaced.Add(1, new TagList
        {
            ["tenant"] = tenantId,
            ["channel"] = "web"
        });
        
        _orderValue.Record((double)value, new TagList
        {
            ["tenant"] = tenantId
        });
    }
}
```

**Prometheus + Grafana setup**: Expose `/metrics` endpoint, Prometheus scrapes it, Grafana queries Prometheus for dashboards.

```csharp
// Expose /metrics for Prometheus
app.MapPrometheusScrapingEndpoint();  // Adds /metrics endpoint
```

---

## Structured Logging Best Practices

**Log at the right level**:
- `Trace`/`Debug`: Detailed diagnostic data — disabled in production
- `Information`: Business-meaningful events (order placed, user authenticated)
- `Warning`: Unexpected but recoverable situations (retry attempt, slow query)
- `Error`: Operation failed, requires attention (payment failed, database unreachable)
- `Critical`: System-level failure, immediate action required

**What to always log**:
- Every incoming HTTP request (request logging middleware)
- Every outgoing HTTP call with duration
- Every database query over a threshold (slow query log)
- Every external API call with duration and result
- Every message published and consumed (with correlation ID)
- Every exception with full stack trace

**What not to log**:
- Passwords, credit card numbers, NHS numbers, personal health information (PII)
- Full request/response bodies by default (can contain sensitive data)
- Health check endpoints (noise without signal)

---

## If an Interviewer Asks...

**"How do you debug an intermittent slowness in a microservices system?"**

First, I check distributed traces — a request that was slow will show which span took the time. If the slowness is in a database call, I check the SQL query and look at execution plans. If it is in an outbound HTTP call, I check whether the downstream service has its own traces showing latency. I also look at metrics — is the P95 latency trending up over time, suggesting a resource leak? Is the error rate increasing? I correlate the timing with any recent deployments. Without distributed tracing, this investigation would require manually correlating logs across multiple services by timestamp — much slower and often inconclusive.

---

## Key Concepts
- **Structured logging**: Logs stored as key-value pairs, not raw strings — searchable and filterable
- **Distributed trace**: A tree of spans representing a request's journey through multiple services
- **Span**: A single named, timed operation within a trace
- **Trace context propagation**: Passing the trace ID in HTTP headers or message broker headers so all services contribute to the same trace
- **OpenTelemetry**: The open standard and SDK for collecting and exporting traces, metrics, and logs
- **Cardinality**: The number of unique values for a metric dimension — high cardinality (user IDs) causes Prometheus performance issues; use low-cardinality tags (tenant tier, region, status code)

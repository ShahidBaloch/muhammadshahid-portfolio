---
title: "API Gateway Patterns for .NET: Build vs Buy"
description: "Compare API gateway options for .NET microservices: Azure API Management, YARP, Ocelot, and AWS API Gateway. When to build vs use a managed service."
date: "2026-10-07"
category: "microservices"
tags: ["API Gateway", "YARP", "Azure API Management", "Microservices", ".NET", "ASP.NET Core"]
---

An API gateway sits between clients and your downstream services. Without one, every client must know the addresses of every service, every service must implement rate limiting and authentication independently, and every service change requires client updates. A gateway solves all of this.

Microsoft provides a detailed reference architecture for [API gateways in microservices](https://learn.microsoft.com/en-us/azure/architecture/microservices/design/gateway). For .NET, [YARP](https://microsoft.github.io/reverse-proxy/) is Microsoft's own reverse proxy library.

## Project Layout

```text
src/
├── Clinic.Gateway/
│   ├── Clinic.Gateway.csproj               # YARP host, no business logic
│   ├── Program.cs                           # auth + rate limit + YARP routing
│   └── appsettings.json                     # ReverseProxy:Routes + Clusters
├── Clinic.Order.Service/
│   └── ...
└── Clinic.Inventory.Service/
    └── ...
```

The gateway project has no business logic. Routes and cluster addresses live in configuration — change them without redeployment using hot-reload.

```
Without Gateway:                    With Gateway:
Client ──→ OrderService:5001        Client ──→ Gateway:443
Client ──→ InventoryService:5002               │──→ OrderService:5001
Client ──→ UserService:5003                    │──→ InventoryService:5002
Client ──→ PaymentService:5004                 └──→ UserService:5003
(every client knows all services)   (clients know only the gateway)
```

---

### What an API Gateway Does

Core responsibilities:
- **Routing**: Map external paths to internal service addresses
- **Authentication**: Validate JWTs, API keys, OAuth tokens before reaching services
- **Rate limiting**: Protect services from abuse (per-client, per-endpoint)
- **SSL termination**: Handle TLS at the gateway; services communicate over HTTP internally
- **Request/response transformation**: Reshape payloads, add/remove headers
- **Load balancing**: Distribute requests across service instances
- **Caching**: Cache responses for GET endpoints
- **Observability**: Centralised access logging and tracing

---

### Option 1: YARP (Yet Another Reverse Proxy)

YARP is Microsoft's .NET reverse proxy library. It runs as a standard ASP.NET Core application, giving you full .NET ecosystem access — middleware pipeline, dependency injection, Polly, OpenTelemetry.

**Install:**
```bash
dotnet add package Yarp.ReverseProxy
```

**Minimal configuration:**
```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
app.MapReverseProxy();
app.Run();
```

```json
// appsettings.json
{
  "ReverseProxy": {
    "Routes": {
      "orders-route": {
        "ClusterId": "orders-cluster",
        "Match": { "Path": "/api/orders/{**catch-all}" },
        "Transforms": [{ "PathPattern": "/api/orders/{**catch-all}" }]
      },
      "inventory-route": {
        "ClusterId": "inventory-cluster",
        "Match": { "Path": "/api/inventory/{**catch-all}" }
      }
    },
    "Clusters": {
      "orders-cluster": {
        "Destinations": {
          "orders-1": { "Address": "http://order-service/" }
        }
      },
      "inventory-cluster": {
        "Destinations": {
          "inventory-1": { "Address": "http://inventory-service/" }
        }
      }
    }
  }
}
```

**Adding rate limiting with ASP.NET Core middleware:**
```csharp
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("api-limit", opt =>
    {
        opt.PermitLimit = 100;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        opt.QueueLimit = 10;
    });
});

app.UseRateLimiter();
app.MapReverseProxy().RequireRateLimiting("api-limit");
```

**Adding circuit breaker with Polly:**
```csharp
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"))
    .AddServiceDiscoveryDestinationResolver() // Optional: Kubernetes service discovery
    ;

// Add Polly resilience to the YARP HTTP client
builder.Services.ConfigureHttpClientDefaults(defaults =>
{
    defaults.AddResilienceHandler("gateway-pipeline", pipeline =>
    {
        pipeline.AddCircuitBreaker(new CircuitBreakerStrategyOptions
        {
            FailureRatio = 0.5,
            MinimumThroughput = 20,
            BreakDuration = TimeSpan.FromSeconds(30)
        });
        
        pipeline.AddTimeout(TimeSpan.FromSeconds(10));
    });
});
```

**When to choose YARP:**
- You want full .NET control over the gateway logic
- You need custom middleware (e.g., tenant routing, custom claim transformation)
- You are already in a .NET shop and want to share libraries between gateway and services
- Budget is a constraint (YARP is free, open source, runs anywhere)
- Traffic volume is high enough that managed service per-call pricing matters

---

### Option 2: Azure API Management (APIM)

Azure API Management is a fully managed gateway service. You define APIs, policies, and products through a portal or Bicep/Terraform. It handles OAuth integration, developer portal, API documentation, analytics, and more without writing code.

**APIM inbound policy example (JWT validation + rate limiting):**
```xml
<policies>
  <inbound>
    <validate-jwt header-name="Authorization" failed-validation-httpcode="401">
      <openid-config url="https://login.microsoftonline.com/{tenantId}/v2.0/.well-known/openid-configuration" />
      <audiences><audience>api://my-api</audience></audiences>
    </validate-jwt>
    
    <rate-limit-by-key calls="100" renewal-period="60"
                       counter-key="@(context.Subscription.Id)" />
    
    <set-backend-service base-url="http://order-service/" />
  </inbound>
  <backend>
    <forward-request />
  </backend>
  <outbound>
    <set-header name="X-Response-Time" exists-action="override">
      <value>@(context.Elapsed.TotalMilliseconds.ToString())</value>
    </set-header>
  </outbound>
</policies>
```

**When to choose APIM:**
- External APIs exposed to third-party developers (APIM developer portal is excellent)
- Azure-native infrastructure where managed services are preferred
- Compliance requirements — APIM provides built-in audit logs, analytics, SLA
- Multiple API products with different subscription tiers and rate limits
- Small team where operating and maintaining a gateway service is a burden

**APIM trade-offs:**
- Expensive at scale (pricing by calls + units)
- Policies written in XML-based DSL — not .NET, not testable in a standard way
- Cold start latency on Consumption tier
- Debugging policy logic is harder than debugging middleware

---

### Option 3: Ocelot

Ocelot is a .NET API gateway library, older and less actively maintained than YARP, but with a large existing install base.

```csharp
// ocelot.json
{
  "Routes": [
    {
      "DownstreamPathTemplate": "/api/orders/{everything}",
      "DownstreamScheme": "http",
      "DownstreamHostAndPorts": [{ "Host": "order-service", "Port": 80 }],
      "UpstreamPathTemplate": "/api/orders/{everything}",
      "UpstreamHttpMethod": ["GET", "POST", "PUT", "DELETE"],
      "RateLimitOptions": {
        "EnableRateLimiting": true,
        "Period": "1m",
        "Limit": 100
      }
    }
  ]
}
```

**When to choose Ocelot**: Existing projects already using it. New projects should prefer YARP — it is Microsoft-backed, better maintained, and integrates more naturally with ASP.NET Core.

---

### Build vs Buy Decision Framework

| Factor | YARP (Build) | Azure APIM (Buy) |
|---|---|---|
| **Cost** | Infrastructure only | Per-call + gateway unit pricing |
| **Customisation** | Unlimited — it's .NET code | Limited to policy DSL |
| **Operational burden** | You manage scaling, updates, HA | Fully managed |
| **External developer portal** | None (build yourself) | Included |
| **Learning curve** | Low for .NET teams | Medium (policy DSL, portal) |
| **Analytics/monitoring** | OpenTelemetry (you set up) | Built-in APIM analytics |
| **Best for** | Internal services, high-throughput | External APIs, developer ecosystem |

---

### What the Gateway Should NOT Do

Common mistakes when building a gateway:
- **Business logic**: The gateway routes and enforces cross-cutting concerns. It should not know about orders, customers, or inventory.
- **Data aggregation**: Combining data from multiple services into one response is a Backend for Frontend (BFF) responsibility, not a gateway responsibility.
- **Service-specific authentication**: Individual services should still validate JWTs and check claims — the gateway handles initial authentication but services should not blindly trust gateway-forwarded requests.

---

### If an Interviewer Asks...

**"Why do microservices systems need an API gateway?"**

Without a gateway, every client must know the address of every service, and every service must independently implement cross-cutting concerns like authentication, rate limiting, and SSL termination. That leads to duplication and coupling. A gateway provides a single stable entry point — clients call one address, the gateway handles routing to whichever service version is currently running. It also gives you a single place to enforce security policies without modifying individual services.

---

## Key Concepts
- **API gateway**: A single entry point that routes requests to downstream services and enforces cross-cutting policies
- **YARP**: Microsoft's .NET reverse proxy library for building custom gateways
- **Azure API Management**: Microsoft's managed API gateway service with developer portal and analytics
- **Rate limiting**: Restricting the number of requests per client per time window
- **SSL termination**: Handling TLS at the gateway, allowing internal services to communicate over plain HTTP
- **Backend for Frontend (BFF)**: A specialised gateway per client type (web, mobile) that aggregates data for that client's specific needs

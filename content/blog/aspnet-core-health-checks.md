---
title: "ASP.NET Core Health Checks: Liveness, Readiness, Startup"
description: "Configure production health checks in ASP.NET Core: isolate liveness from readiness, write custom IHealthCheck handlers, configure Kubernetes probes, and prevent restart storms."
date: "2026-09-18"
updated: "2026-10-03"
category: "architecture"
tags: ["ASP.NET Core", "Health Checks", "Kubernetes", "Azure", "DevOps", "Architecture"]
related:
  - azure-app-service-aspnet-core
  - docker-dotnet-angular-local
  - ihttpclientfactory-aspnet-core
  - aspnet-core-global-exception-handling
faq:
  - q: "What is the difference between liveness, readiness, and startup probes in ASP.NET Core?"
    a: "Startup probe checks if slow initialization (warming caches, migrations) is finished. Liveness probe (/health/live) checks if the Kestrel process is deadlocked or crashed (failure restarts the container). Readiness probe (/health/ready) checks if backing services like SQL Server or Redis are reachable (failure temporarily pulls the instance out of the load balancer without killing it)."
  - q: "Why should AddDbContextCheck never run on a liveness endpoint?"
    a: "If SQL Server undergoes a 30-second failover, checking the database on liveness causes Kubernetes or Azure to immediately kill and restart every single container simultaneously, turning a transient database blip into a cascading crash-restart outage."
  - q: "How do I format health check JSON responses with detailed dependency statuses?"
    a: "Configure HealthCheckOptions.ResponseWriter using UIResponseWriter.WriteHealthCheckUIResponse from the AspNetCore.HealthChecks.UI.Client package, which formats results with latency, status, and description per dependency."
  - q: "Should non-critical dependencies like Redis cache fail a readiness check?"
    a: "No. If your application can gracefully degrade and serve requests from SQL Server when Redis is unavailable, treat the cache check as Degraded rather than Unhealthy, or omit it from readiness probes so the pod continues serving traffic."
---

**Health checks in ASP.NET Core** communicate runtime readiness and operational state to orchestration platforms like Kubernetes, Azure App Service, and AWS ECS. Correctly separating **Startup**, **Liveness**, and **Readiness** probes prevents disastrous container restart storms during transient infrastructure blips.

```text
Orchestrator Probes:
├── Startup Probe   (/health/startup) ──► Waits until caches warm & DI initializes
│                                         (Failure: Kills slow pod after initial timeout)
│
├── Liveness Probe  (/health/live)    ──► Is the web server process responsive?
│                                         (Failure: Restarts the container)
│
└── Readiness Probe (/health/ready)   ──► Can the app serve live traffic? (Checks SQL/Redis)
                                          (Failure: Pulls pod from Load Balancer, NO restart)
```

**New to this** → start with [Liveness vs Readiness vs Startup](#the-three-probes-liveness-readiness-startup). **Azure setup** → [Azure App Service checklist](/blog/azure-app-service-aspnet-core). **Containerization** → [Docker local development](/blog/docker-dotnet-angular-local). **Interview prep** → [If an interviewer asks](#if-an-interviewer-asks).

## Real-world analogy

Imagine a harbour port:
1. **Startup Probe**: Checking if the ship has finished docking and lowering its gangway before letting passengers queue.
2. **Liveness Probe**: A lighthouse checking whether the harbour control tower is physically standing. If the tower has collapsed, send an emergency reconstruction crew (restart).
3. **Readiness Probe**: The harbour master checking if a berth is currently open for incoming ships. If all berths are occupied (e.g. database failover), the harbour is temporarily closed to new ships (traffic paused), but you **never** demolish the control tower.

## The three probes: Liveness, Readiness, Startup

| Probe Type | Endpoint | Checks Performed | Action on Failure (HTTP 503) |
|---|---|---|---|
| **Startup** | `/health/startup` | One-off initialization, warming JIT/caches. | Kills container if it fails to boot within `failureThreshold * periodSeconds`. |
| **Liveness** | `/health/live` | Process liveliness, memory health, event loop deadlock. | **Restarts the container** immediately. |
| **Readiness** | `/health/ready` | SQL Server, critical microservices, RabbitMQ/ServiceBus. | **Removes pod from load balancer** routing until healthy. Pod stays alive. |

## Production Health Checks implementation in ASP.NET Core

Install the standard health check packages:

```bash
dotnet add package Microsoft.Extensions.Diagnostics.HealthChecks.EntityFrameworkCore
dotnet add package AspNetCore.HealthChecks.SqlServer
dotnet add package AspNetCore.HealthChecks.Redis
dotnet add package AspNetCore.HealthChecks.UI.Client
```

### 1. Registering categorized health checks in Program.cs

```csharp
// Program.cs
using HealthChecks.UI.Client;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;

var builder = WebApplication.CreateBuilder(args);

// 1. Register Health Checks with explicit tags
builder.Services.AddHealthChecks()
    // Startup check: ensures critical DI services initialized
    .AddCheck("self_startup", () => HealthCheckResult.Healthy("Startup completed"), tags: ["startup"])

    // Liveness check: trivial ping to confirm Kestrel is accepting TCP sockets
    .AddCheck("self_live", () => HealthCheckResult.Healthy("Kestrel is responsive"), tags: ["live"])

    // Readiness checks: backing infrastructure
    .AddDbContextCheck<AppDbContext>(
        name: "sql_server",
        failureStatus: HealthStatus.Unhealthy,
        tags: ["ready", "db"])
    .AddRedis(
        builder.Configuration.GetConnectionString("Redis") ?? "localhost:6379",
        name: "redis_cache",
        failureStatus: HealthStatus.Degraded, // Cache down degrades app, but does NOT take pod offline
        tags: ["ready", "cache"])
    .AddCheck<CustomPaymentGatewayHealthCheck>(
        name: "payment_gateway",
        failureStatus: HealthStatus.Unhealthy,
        tags: ["ready"]);

var app = builder.Build();

app.UseRouting();

// 2. Map separate endpoints filtered by tags
// Liveness: Zero dependency checks. Fast return.
app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("live"),
    ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse
});

// Readiness: SQL, Redis, Gateways
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready"),
    ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse
});

// Startup probe
app.MapHealthChecks("/health/startup", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("startup"),
    ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse
});

app.Run();
```

### 2. Custom IHealthCheck for external APIs or message brokers

```csharp
// Infrastructure/Health/CustomPaymentGatewayHealthCheck.cs
using Microsoft.Extensions.Diagnostics.HealthChecks;

public sealed class CustomPaymentGatewayHealthCheck : IHealthCheck
{
    private readonly IHttpClientFactory _httpClientFactory;

    public CustomPaymentGatewayHealthCheck(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, 
        CancellationToken cancellationToken = default)
    {
        try
        {
            var client = _httpClientFactory.CreateClient("PaymentGatewayHealth");
            client.Timeout = TimeSpan.FromSeconds(3); // Strict timeout for health probes

            var response = await client.GetAsync("/health/ping", cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                return HealthCheckResult.Healthy("Payment gateway online");
            }

            return HealthCheckResult.Unhealthy($"Gateway returned status {response.StatusCode}");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("Payment gateway unreachable", ex);
        }
    }
}
```

## Kubernetes Probes YAML configuration

Here is the exact `deployment.yaml` specification for Kubernetes:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: portfolio-api
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: api
          image: portfolio-api:latest
          ports:
            - containerPort: 8080
          startupProbe:
            httpGet:
              path: /health/startup
              port: 8080
            failureThreshold: 30
            periodSeconds: 2
          livenessProbe:
            httpGet:
              path: /health/live
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 2
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 2
```

## Common mistakes and pitfalls

- **Checking SQL Server on `/health/live`**: During database maintenance or failover, every pod will fail liveness simultaneously and enter a `CrashLoopBackOff` state. Keep database probes strictly on `/health/ready`.
- **Using long timeouts in health probes**: Health checks that take 10+ seconds to timeout exhaust Kestrel thread pool workers during outages. Keep probe timeouts under 2–3 seconds.
- **Leaking connection strings or sensitive errors in health responses**: In public or semi-public environments, never serialize database passwords or internal IP addresses in health check JSON.
- **Failing readiness on optional dependencies**: If an optional search indexing queue or analytics tracker is down, return `HealthStatus.Degraded` instead of `Unhealthy` so users can still execute core read/write workflows.

## If an interviewer asks

**30-second answer:** In ASP.NET Core, health checks are split into liveness (`/health/live`) and readiness (`/health/ready`). Liveness verifies that the Kestrel process is alive and responsive—a failure triggers a container restart. Readiness verifies backing dependencies like SQL Server and Redis—a failure removes the container from the load balancer rotation without killing the process.

**Strong answer:** In cloud-native microservices, coupling external dependency checks to liveness probes causes catastrophic restart storms during network or database failovers. We tag our checks explicitly: the liveness endpoint only checks internal process health, while the readiness endpoint tests SQL and external dependencies with tight 2-second timeouts. Non-critical dependencies (e.g. distributed caches) report `HealthStatus.Degraded` to prevent taking healthy pods out of service when graceful fallback paths exist.

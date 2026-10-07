---
title: "Horizontal vs Vertical Scaling in ASP.NET Core"
description: "Horizontal vs vertical scaling for ASP.NET Core APIs — stateless design, load balancing, and when to scale out vs scale up in production."
date: "2026-10-07"
category: "architecture"
tags: ["Scaling", "ASP.NET Core", "Load Balancing", "Stateless", "Cloud Architecture"]
---

Your ASP.NET Core API has been running smoothly for 18 months. Then you get a new enterprise customer, a successful marketing campaign, or a regional launch — and suddenly response times are climbing. The immediate question: do you scale up (bigger VM) or scale out (more instances)?

The answer is almost never obvious without measuring first, and the wrong choice can be expensive in both infrastructure cost and engineering time. This post gives you the framework to make that decision correctly.

---

### Vertical Scaling: Making One Machine Bigger

Vertical scaling (scaling up) means increasing the resources — CPU cores, RAM, disk speed, network throughput — on your existing server.

```
Before:  Standard_D4s_v3  (4 vCPUs, 16 GB RAM)
After:   Standard_D16s_v3 (16 vCPUs, 64 GB RAM)
```

**When vertical scaling is the right first move:**

Vertical scaling has one huge advantage: you can do it without changing a single line of code. Your ASP.NET Core application immediately gets access to more CPU threads, more memory for the CLR heap, and faster I/O. For many workloads in the 100–10,000 concurrent user range, scaling up is the simplest and fastest fix.

It is particularly appropriate when:
- Your bottleneck is compute (high CPU on one machine) or memory (large working set)
- The application manages state that is difficult to externalize quickly (in-memory caches, singleton services with state)
- The workload does not distribute well (e.g., a compute-heavy background job that processes a single large dataset)
- The team is small and operational complexity of managing multiple instances is genuinely costly

**The limits of vertical scaling:**

Every cloud provider has a largest available VM size. Azure's biggest general-purpose VM today has 96 vCPUs and 384 GB RAM. Once you hit that ceiling, vertical scaling stops. Before that ceiling, the price-to-performance ratio tends to worsen significantly at the high end — a VM with 4× the resources often costs more than 4× the price.

There is also a fundamental resilience problem: a single powerful machine is a single point of failure. If that machine goes down for maintenance, patch, or hardware failure, your entire service is unavailable. Redundancy requires at least two instances.

---

### Horizontal Scaling: Adding More Machines

Horizontal scaling (scaling out) means running multiple instances of your service behind a load balancer.

```
Before:  1 × Standard_D4s_v3 (4 vCPUs)
After:   4 × Standard_D4s_v3 (4 vCPUs each, behind load balancer)
```

This is the foundation of cloud-native architecture and the approach Azure, AWS, and GCP are designed around. Auto-scaling groups, Kubernetes horizontal pod autoscaling, Azure App Service scale-out rules — all of these are horizontal scaling mechanisms.

The benefits are real:
- **Fault tolerance**: Lose one instance and the load balancer routes around it
- **Cost efficiency at scale**: Commodity instances are cheaper than premium large instances at high loads
- **Zero-downtime deployments**: Rolling deployments update one instance at a time
- **Autoscaling**: Add instances during peak traffic, remove them during off-hours

**The catch**: your application must be designed for it. Horizontal scaling only works cleanly when any instance can serve any request. Most .NET developers learned on a single-server model where things like in-memory session, local file storage, and singleton state feel natural. Those patterns break under horizontal scaling.

---

### The Stateless Requirement: What Must Change

Before you can horizontally scale an ASP.NET Core application, you must make it stateless. This is the most important prerequisite and the most commonly misunderstood.

**A stateless service does not keep user-specific state in memory between requests.** Any server can handle any request. Here is what that means for common ASP.NET Core patterns:

#### Session State

The classic Session pattern in ASP.NET Core uses in-memory session storage by default. This breaks horizontal scaling — a user authenticated on server 1 will get a new unauthenticated session when load-balanced to server 2.

```csharp
// DO NOT use this in horizontally scaled apps
builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromMinutes(30);
    options.Cookie.HttpOnly = true;
});
// Default: stores session in-memory on the server. Breaks with multiple instances.
```

**Fix**: Use distributed session with Redis. Each instance reads session from the same Redis cluster:

```csharp
// CORRECT: Distributed session backed by Redis
builder.Services.AddStackExchangeRedisCache(options =>
{
    options.Configuration = builder.Configuration.GetConnectionString("Redis");
});

builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromMinutes(30);
    options.Cookie.HttpOnly = true;
});
// Now session reads/writes go to Redis, not local memory
```

Or better yet — use JWT tokens and avoid server-side session entirely. Tokens carry identity information in the request itself and require no server-side state.

#### File Uploads

Saving uploaded files to the local filesystem fails immediately under horizontal scaling. A file uploaded to instance A is unreachable from instances B, C, or D.

```csharp
// BROKEN: Files on local disk
await System.IO.File.WriteAllBytesAsync($"uploads/{fileName}", fileBytes);

// CORRECT: Files in Azure Blob Storage or AWS S3
var blobClient = _blobServiceClient
    .GetBlobContainerClient("uploads")
    .GetBlobClient(fileName);
await blobClient.UploadAsync(fileStream);
```

#### IMemoryCache

`IMemoryCache` stores data in the local process memory. Under horizontal scaling, each instance has its own cache. A cache invalidation on instance A does not propagate to instances B, C, or D. This can cause consistency issues.

```csharp
// Works fine on single instance, may be inconsistent on multiple
services.AddMemoryCache();
var value = _cache.GetOrCreate("settings", entry => {
    entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5);
    return _db.GetSettingsAsync().Result;
});

// Better for horizontally scaled apps:
services.AddStackExchangeRedisCache(options =>
    options.Configuration = config["Redis"]);
// IDistributedCache gives you a single shared cache across all instances
```

**Exception**: Local in-memory caches are fine as a *read-through layer on top of Redis* when data is read-heavy and slightly stale data is acceptable. Just never rely on local memory for correctness.

#### Background Services and Scheduled Jobs

`IHostedService` and `BackgroundService` run on every instance. If you have a job that should run once every 5 minutes, you may end up with 4 instances all running it simultaneously.

```csharp
// This runs on EVERY instance — dangerous for jobs that write to shared resources
public class DataCleanupJob : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await CleanupOldRecordsAsync(); // Runs 4x per cycle on 4 instances!
            await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
        }
    }
}
```

**Fix**: Use a distributed lock (Redis `SETNX`, Azure Blob lease, or a library like `DistributedLock`) to ensure only one instance runs the job at a time, or use Azure Functions/Hangfire with a distributed coordinator.

---

### Load Balancing Strategies

Once you have multiple stateless instances, you need a load balancer. The choice of load balancing algorithm matters more than most developers realize.

**Round Robin** — sends requests in a cycle: instance 1, instance 2, instance 3, instance 1...

Works well when:
- Requests have similar processing cost
- All instances have identical capacity

Fails when:
- Some requests are computationally heavy (a PDF generation request and a health check get equal treatment)
- Instances have different CPU/memory specs

**Least Connections** — sends new requests to the instance with the fewest active connections.

Works well for:
- ASP.NET Core SignalR or WebSocket workloads (long-lived connections)
- Variable-duration requests (quick cache hits vs slow database queries)

**Weighted Round Robin** — instances get proportional traffic based on their capacity.

Works well for:
- Canary deployments (route 5% of traffic to the new version)
- Mixed instance sizes (a 4-core instance gets half the traffic of an 8-core instance)

**Consistent Hashing** — maps clients to instances based on a hash of some identifier.

Works well for:
- Cache-aware routing (all requests for user X go to the same instance, keeping their data warm in local memory)

Most Azure App Service deployments use round-robin by default. For Kubernetes deployments in AKS, you configure load balancing through Ingress Controllers (NGINX, Traefik) or service mesh configurations.

---

### The Decision Framework

Here is the decision process for choosing a scaling strategy:

```
1. MEASURE FIRST
   - Is CPU consistently > 70%? → Likely compute bound
   - Is memory pressure high? → Likely memory bound
   - Is I/O wait high? → Likely database or network bound
   - Is p99 latency high but CPU is fine? → Likely external dependency bottleneck

2. IDENTIFY THE BOTTLENECK
   - Application server (compute/memory) → Scaling the app helps
   - Database (query performance, connection limits) → Scaling app servers won't help
   - External API (third-party latency) → Circuit breakers and async patterns, not scaling

3. CHOOSE THE SCALING STRATEGY
   - Quick fix, small scale, simple stateful app → Vertical scaling
   - Need HA, auto-scaling, cloud-native, large scale → Horizontal scaling
   - Database write bound → Consider read replicas, caching, or sharding
   - Single instance doing everything → Separate concerns first

4. PREPARE FOR HORIZONTAL SCALING
   - Replace IMemoryCache → IDistributedCache (Redis)
   - Replace local session → Distributed session or JWT
   - Replace local file storage → Blob storage
   - Coordinate background jobs → Distributed locks
   - Externalize configuration → Azure App Configuration or environment variables
```

---

### A Real-World Example: Healthcare SaaS API

Consider an ASP.NET Core API for a healthcare SaaS application serving clinic management software. The system runs on a single `Standard_D4s_v3` VM and starts receiving complaints about slow appointment booking during morning rush hours (8–10 AM when clinics open).

**First: measure**

Application Insights shows CPU at 85% during rush hours, with `/api/appointments/available-slots` taking 2.4 seconds at p99. Memory is fine.

**Identify the bottleneck**

Profiling shows the slots endpoint executes 47 database queries (N+1 pattern on doctor schedules). CPU is high because the .NET thread pool is saturated waiting on database I/O.

**Correct fix**

Fixing the N+1 query brings p99 down to 180ms without any scaling changes. CPU drops to 35% during rush hours.

**If scaling was still needed after the query fix:**

Given the application currently uses `IMemoryCache` for doctor schedule caching and stores uploaded documents on local disk, horizontal scaling would require:
1. Migrating to `IDistributedCache` backed by Azure Cache for Redis
2. Moving document storage to Azure Blob Storage
3. Testing that no singleton services hold mutable per-request state

This is typically 1–3 days of engineering work. Once done, Azure App Service can scale out to 3–5 instances automatically during peak hours and scale back to 1 instance overnight, dramatically reducing infrastructure cost.

---

### Health Checks: The Foundation of Load Balancer Integration

For horizontal scaling to work safely, your ASP.NET Core application needs proper health checks. Load balancers send health check probes and remove unhealthy instances from rotation.

```csharp
// Comprehensive health checks in ASP.NET Core 8
builder.Services.AddHealthChecks()
    .AddSqlServer(
        connectionString: builder.Configuration.GetConnectionString("DefaultConnection"),
        name: "database",
        failureStatus: HealthStatus.Unhealthy,
        tags: new[] { "db", "sql" })
    .AddRedis(
        redisConnectionString: builder.Configuration.GetConnectionString("Redis"),
        name: "redis",
        failureStatus: HealthStatus.Degraded)
    .AddUrlGroup(
        uri: new Uri("https://api.external-provider.com/health"),
        name: "external-api",
        failureStatus: HealthStatus.Degraded);

// Expose health endpoints
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("db"),
    ResultStatusCodes = {
        [HealthStatus.Healthy] = StatusCodes.Status200OK,
        [HealthStatus.Unhealthy] = StatusCodes.Status503ServiceUnavailable
    }
});

app.MapHealthChecks("/health/live");
```

The `/health/ready` endpoint tells the load balancer whether this instance can serve traffic. The `/health/live` endpoint tells Kubernetes or the host whether the process is alive. These are different: a live but not-ready instance (database connectivity lost) should be removed from the load balancer but not restarted.

---

### If an Interviewer Asks...

**"When would you choose vertical scaling over horizontal scaling?"**

When the bottleneck is compute or memory and the application is not designed for statefulness externalization, vertical scaling is often the fastest correct path. Early-stage products, legacy applications being migrated, or workloads with strong data locality (large in-memory graphs, for example) may genuinely be better served by a bigger single machine. The key is: vertical scaling is not wrong, it is just limited.

**"What does stateless mean in the context of ASP.NET Core?"**

Stateless means any instance can handle any request without needing to know the history of previous requests from the same user. It requires externalizing session state (Redis), file storage (Blob), and background job coordination (distributed locks). JWT authentication is inherently stateless — the token carries all necessary identity information.

**"How do you handle session affinity vs full statelessness?"**

Session affinity (sticky sessions) routes the same user to the same instance. It is a workaround for stateful applications that are not ready for full refactoring. It works but reduces the effectiveness of load balancing and makes failover more complicated — if a user's "sticky" instance goes down, their session is lost anyway. Full statelessness with Redis is the production-correct long-term solution.

---

## Trade-offs Covered
- Vertical scaling simplicity vs horizontal scaling resilience
- In-memory session performance vs distributed session overhead (Redis)
- Local IMemoryCache speed vs IDistributedCache consistency across instances
- Sticky sessions workaround vs full stateless refactoring effort
- Round-robin simplicity vs least-connections accuracy for variable workloads
- Premature horizontal scaling complexity vs necessary preparation for growth

## Key Concepts
- **Vertical scaling (scale up)**: Adding more resources to a single server
- **Horizontal scaling (scale out)**: Adding more server instances behind a load balancer
- **Stateless service**: A service where any instance can handle any request
- **Sticky sessions**: Routing the same user to the same instance — a workaround, not a solution
- **IDistributedCache**: ASP.NET Core abstraction for shared distributed caching (Redis, SQL Server, etc.)
- **Health check**: Endpoint that tells the load balancer whether an instance is ready to serve traffic
- **Rolling deployment**: Updating instances one at a time to achieve zero-downtime releases

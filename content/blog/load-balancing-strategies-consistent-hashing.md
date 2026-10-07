---
title: "Load Balancing Strategies: Consistent Hashing in .NET"
description: "Load balancing algorithms — round-robin, least connections, IP hash, and consistent hashing — with .NET production examples and trade-offs."
date: "2026-10-07"
category: "distributed-systems"
tags: ["Load Balancing", "Consistent Hashing", "Distributed Systems", "Architecture", ".NET"]
---

When you add a load balancer in front of your ASP.NET Core services, the default configuration is almost always round-robin. For most systems, that is fine. But as workloads become more complex — long-lived WebSocket connections, distributed caches, canary deployments, traffic-sensitive background jobs — the algorithm choice starts to matter.

This post walks through each major algorithm, explains the trade-offs honestly, and shows where each one appears in real .NET production architectures.

---

### Why the Algorithm Matters

A load balancer does not just distribute traffic. It determines:
- Which instances get overloaded and which stay idle
- Whether the same user always hits the same instance (and whether that is a problem or a feature)
- How much disruption scaling events (adding/removing instances) cause to in-flight requests
- Whether cache hit rates stay high under routing changes

Getting this wrong is usually invisible until it becomes a problem. An overloaded instance that is still returning 200s will not trigger alerts — users just see higher latency.

---

### Round Robin

**How it works**: Requests are distributed in a cycle. Request 1 → Instance A. Request 2 → Instance B. Request 3 → Instance C. Request 4 → Instance A again.

**Strengths**: Maximally simple. Deterministic. Easy to reason about. Works perfectly when:
- All instances are identical in capacity
- All requests have similar processing cost
- No state affinity is needed

**Failures in the real world**:

Round robin distributes *request count equally*, not *load equally*. Consider an ASP.NET Core API that serves both a `/health` endpoint (microseconds of work) and a `/reports/generate` endpoint (2–5 seconds of CPU work). Round-robin treats these identically. An instance that receives three consecutive report generation requests is genuinely overloaded compared to one that received three health checks.

In practice this produces "elephant traffic" — occasional heavy requests that cause one instance to be at 90% CPU while others sit at 20%, while the monitoring dashboard shows "equal distribution."

**When to use it**: Simple stateless services with uniform request patterns. Health check APIs. Internal microservice traffic with well-defined, similar-weight endpoints. The Azure App Service default that works fine for 80% of deployments.

---

### Weighted Round Robin

**How it works**: Same as round robin, but each instance is assigned a weight. A weight-4 instance receives 4 requests for every 1 that a weight-1 instance receives.

**Most valuable use case**: Canary deployments.

When you deploy a new version of an ASP.NET Core service, you can route 5% of traffic to the new version and 95% to the current stable version. If error rates stay normal, increase to 10%, then 25%, then 50%, then full rollout:

```yaml
# Kubernetes Ingress canary annotation (NGINX Ingress Controller)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: service-canary
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "5"  # 5% to new version
spec:
  rules:
  - host: api.yourapp.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: service-v2
            port:
              number: 80
```

**Also useful for**: Mixed instance sizes. If you have a Standard_D4 instance (4 cores) and a Standard_D8 instance (8 cores), assign weights 1 and 2 respectively. The larger instance handles twice the traffic, matching its capacity.

**Limitations**: Weights are static. The system does not automatically adjust when one instance is temporarily slower. A weight-4 instance that is experiencing a memory pressure event will still receive 4x the traffic.

---

### Least Connections

**How it works**: The load balancer tracks active open connections on each instance and routes new requests to the instance with the fewest.

**When round robin fails and least connections wins**: Long-lived connections and variable-duration requests.

ASP.NET Core SignalR uses WebSocket connections that stay open for minutes or hours. Round-robin assigns them equally by connection count, but some connections generate much more traffic than others. Least connections prevents a single instance from accumulating too many active long-running sessions.

Similarly, an API that mixes fast database reads (< 50ms) with slow report generation (3–10 seconds) will distribute load more evenly with least connections — an instance processing a slow report naturally accumulates fewer *new* connections.

**Implementation in Azure**: Azure Application Gateway natively supports least connections as an alternative to round robin:

```json
{
  "type": "Microsoft.Network/applicationGateways",
  "properties": {
    "backendHttpSettingsCollection": [{
      "properties": {
        "loadDistribution": "LeastConnections"
      }
    }]
  }
}
```

**Limitations**: Connection count does not always equal actual CPU or memory load. A connection that sent one small message is counted the same as one that is currently executing a heavy computation. For CPU-bound workloads, least connections still does not distribute load perfectly — but it is significantly better than round-robin.

---

### IP Hash

**How it works**: A hash of the client's IP address determines which backend instance serves the request. The same IP consistently maps to the same instance.

**What it solves**: Session affinity without cookies. If your application stores state in the process memory and you cannot refactor to distributed session quickly, IP hash gives each client a "sticky" instance.

**Why it is dangerous in production**:

1. **Corporate NAT**: Hundreds of employees at the same company may share one outbound IP address. IP hash routes all of them to the same backend instance, creating a massive imbalance.

2. **Mobile users**: Phones switch between WiFi and cellular networks, changing IP addresses mid-session. The hash remaps them to a different instance, losing their session state.

3. **Instance changes**: Adding or removing a backend instance remaps a large percentage of IP hashes. If users had locally cached state on instance A and the algorithm remaps them to instance B, they lose their session.

4. **Hides the real problem**: IP hash is usually chosen because the application stores session state in-memory. The correct solution is to externalize session state to Redis, not to route around the problem.

**When IP hash is genuinely appropriate**: Very specific scenarios where client identity must stay on one server for performance reasons (e.g., a large local computation cache that is too expensive to rebuild on each request), and where the IP distribution is known to be uniform. This is rare.

---

### Consistent Hashing

**How it works**: Both servers and request keys are placed on a conceptual hash ring (a circle of hash values from 0 to 2^32). A request is handled by the first server that appears clockwise from the request's hash position on the ring.

```
Hash Ring (visualized):
     [0]
      |
  Server A (hash position: 15)
      |
  Request X → hash 12 → first server clockwise → Server A
      |
  Server B (hash position: 60)
      |
  Request Y → hash 55 → first server clockwise → Server B
      |
  Server C (hash position: 128)
      |
     [255]
```

**Why consistent hashing matters**: When you add or remove a server, only a fraction of keys need to be remapped. With simple modular hashing (`hash(key) % n`), changing from 5 servers to 6 servers remaps approximately 83% of all keys. With consistent hashing, only about 1/n of keys (17%) are remapped.

**Most important use case in .NET**: Distributed Redis clusters and cache partitioning.

When you use Redis Cluster with StackExchange.Redis, consistent hashing determines which Redis shard owns which keys. If a Redis node is added or fails, consistent hashing minimizes cache disruption:

```csharp
// StackExchange.Redis uses consistent hashing internally for cluster key routing
var redis = ConnectionMultiplexer.Connect(new ConfigurationOptions
{
    EndPoints = {
        { "redis-node-1.example.com", 7000 },
        { "redis-node-2.example.com", 7001 },
        { "redis-node-3.example.com", 7002 }
    }
});

// Key routing is handled automatically — "user:12345" consistently routes
// to the same Redis shard
var db = redis.GetDatabase();
await db.StringSetAsync("user:12345", serializedUser);
```

**Virtual nodes**: A basic consistent hash ring often produces unequal load distribution because server hash positions may cluster together by chance. The solution is to assign each physical server multiple positions on the ring (virtual nodes or "vnodes"). Each physical server is responsible for multiple arcs of the ring, distributing load more evenly.

**Application-level consistent hashing**: You can implement consistent hashing in C# for application-level routing — for example, routing all requests for a given tenant ID to the same instance to maximize cache locality:

```csharp
public class ConsistentHashRouter<T>
{
    private readonly SortedDictionary<int, T> _ring = new();
    private readonly int _virtualNodes;

    public ConsistentHashRouter(IEnumerable<T> nodes, int virtualNodes = 150)
    {
        _virtualNodes = virtualNodes;
        foreach (var node in nodes)
            AddNode(node);
    }

    public void AddNode(T node)
    {
        for (int i = 0; i < _virtualNodes; i++)
        {
            var hash = GetHash($"{node}-vnode-{i}");
            _ring[hash] = node;
        }
    }

    public T GetNode(string key)
    {
        if (_ring.Count == 0)
            throw new InvalidOperationException("No nodes in ring");

        var hash = GetHash(key);
        
        // Find first node clockwise
        var higherKeys = _ring.Keys.Where(k => k >= hash);
        var targetKey = higherKeys.Any() ? higherKeys.Min() : _ring.Keys.Min();
        return _ring[targetKey];
    }

    private int GetHash(string input)
    {
        using var sha = SHA256.Create();
        var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(input));
        return BitConverter.ToInt32(bytes, 0) & 0x7fffffff; // positive int
    }
}

// Usage: Route by tenant ID for cache locality
var router = new ConsistentHashRouter<string>(
    new[] { "instance-1", "instance-2", "instance-3" });

var targetInstance = router.GetNode($"tenant:{request.TenantId}");
```

---

### Algorithm Comparison Matrix

| Algorithm | Best For | Fails When |
|---|---|---|
| Round Robin | Uniform stateless APIs | Variable request weight, long connections |
| Weighted Round Robin | Canary deploys, mixed instance sizes | Dynamic load changes |
| Least Connections | SignalR, variable-duration requests | High connection churn |
| IP Hash | Legacy stateful apps (workaround) | NAT users, mobile clients, scaling events |
| Consistent Hashing | Cache partitioning, tenant routing | Complex implementation, ring management |

---

### Health Checks and Connection Draining

No load balancing algorithm works correctly without proper health checks. The load balancer needs to know when to remove an instance from rotation.

In ASP.NET Core, you want both a liveness check (is the process running?) and a readiness check (can this instance serve traffic?):

```csharp
// Health check registration
builder.Services.AddHealthChecks()
    .AddSqlServer(connectionString, name: "db", tags: ["ready"])
    .AddRedis(redisConnectionString, name: "cache", tags: ["ready"]);

// Readiness: all "ready" tagged checks must pass
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready")
});

// Liveness: always return 200 if the process is running
app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = _ => false // No actual checks — just heartbeat
});
```

**Connection draining** is equally important: when removing an instance from rotation (during a scale-down or deployment), the load balancer should stop sending new requests but allow in-flight requests to complete, rather than forcefully terminating connections.

```csharp
// ASP.NET Core Graceful Shutdown — allows active requests to complete
// during deployment or scale-down events
builder.Services.Configure<HostOptions>(options =>
{
    options.ShutdownTimeout = TimeSpan.FromSeconds(30); // Allow 30s for graceful drain
});
```

---

### If an Interviewer Asks...

**"Explain consistent hashing and why it matters."**

Simple modular hashing (`hash(key) % n`) remaps almost all keys when `n` changes. With 5 servers, adding a 6th server causes 83% of keys to remap — meaning 83% of your cache is invalidated simultaneously. Consistent hashing places servers on a hash ring and remaps only 1/n keys when a server is added or removed. For distributed caches and storage systems, this is the difference between a smooth scaling event and a cache stampede that floods your database.

**"When would consistent hashing be a bad choice?"**

When the overhead of maintaining the ring and virtual node metadata exceeds the benefit. For small clusters (2–3 instances) with low cache disruption tolerance, simpler schemes with a manual invalidation strategy may be easier to reason about and debug.

---

## Trade-offs Covered
- Round robin simplicity vs least-connections accuracy for variable workloads
- IP hash convenience vs load imbalance risk (NAT, mobile IPs)
- Consistent hashing stability vs modular hash simplicity
- Virtual nodes balance vs ring management complexity
- Session affinity workaround vs proper stateless refactoring
- Connection draining safety vs faster deployment cycles

## Key Concepts
- **Load balancing algorithm**: The rule the load balancer uses to choose a backend instance for each request
- **Session affinity (sticky sessions)**: Routing the same client to the same instance
- **Hash ring**: The circular data structure used by consistent hashing
- **Virtual node**: A synthetic placement of a physical server at multiple positions on the hash ring for better load distribution
- **Connection draining**: Allowing in-flight requests to complete before removing an instance from rotation
- **Canary deployment**: Routing a small percentage of traffic to a new version before full rollout

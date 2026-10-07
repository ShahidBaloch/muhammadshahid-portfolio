---
title: "CAP Theorem in .NET: Consistency vs Availability"
description: "CAP theorem for .NET engineers — when to choose consistency vs availability in distributed ASP.NET Core systems, with real trade-off examples."
date: "2026-10-07"
category: "distributed-systems"
tags: ["CAP Theorem", "Distributed Systems", "Consistency", "Availability", ".NET"]
---

Ask an engineer to explain CAP theorem and you will usually hear: "You can only have two out of Consistency, Availability, and Partition Tolerance." That statement is technically true and practically useless. It creates the impression that you are permanently choosing a label for your database rather than making specific trade-off decisions for specific features under specific failure scenarios.

The truth is more nuanced and more useful: **partition tolerance is non-negotiable in any distributed system**, which means the real choice is always between consistency and availability *when a partition occurs*. And whether you prefer consistency or availability often differs by feature within the same system.

---

### What Each Property Actually Means

**Consistency** in the CAP sense means that every read sees the most recent write, regardless of which node in the cluster handles the request. This is stronger than ACID consistency (which is about valid data states). CAP consistency means there is no replica lag, no stale read — the system behaves like a single machine.

**Availability** means every request to a healthy node receives a response. Notice the key qualifier: *a healthy node*. The response might be stale data. The system stays up and responsive, but it might not be serving the absolute latest state.

**Partition Tolerance** means the system continues operating even when the network between nodes breaks — when messages are lost, delayed, or nodes cannot reach each other.

In a single-machine system, you can have all three: there is no partition, so consistency and availability are both trivial. But in any distributed system — multiple database replicas, microservices communicating over the network, multi-region deployments — **network partitions are not a theoretical edge case. They are a routine operational reality**. Network timeouts happen. Cloud regions become isolated. Kubernetes pods lose connectivity.

Since partition tolerance cannot be opted out of, the real question becomes: *when a partition occurs, which do you sacrifice — consistency or availability?*

---

### CP Systems: Consistency + Partition Tolerance

A CP system, when it detects a partition, will refuse or block requests rather than serve potentially stale data. It prioritizes correctness over availability.

**Real-world example:** Apache ZooKeeper, etcd, and most consensus-based systems. When a ZooKeeper leader is partitioned from followers, it stops accepting writes until quorum is re-established. Your service may timeout or fail during the partition, but you will never read stale data.

In .NET applications, you encounter CP behavior with:
- SQL Server with synchronous replication (writes block until the replica acknowledges)
- Distributed locks (if the lock service is partitioned, you get an error rather than a potentially incorrect lock grant)
- Azure Cosmos DB with "Strong" consistency level

**When CP is the right choice:**
- Inventory checkout (overselling inventory is worse than a momentary error)
- Bank transfers (showing a wrong balance is worse than "service temporarily unavailable")
- Distributed job scheduling (running the same job twice can be worse than skipping it)
- Authentication token revocation (a revoked token must not be accepted anywhere)

```csharp
// In a CP scenario, you want errors to be explicit.
// An optimistic concurrency check in EF Core demonstrates CP thinking:
// If two requests try to update the same row, one will fail with a
// DbUpdateConcurrencyException rather than silently accepting stale data.

public async Task<Result> DeductInventoryAsync(int productId, int quantity)
{
    var product = await _db.Products
        .FirstOrDefaultAsync(p => p.Id == productId);
    
    if (product.Stock < quantity)
        return Result.Failure("Insufficient stock");
    
    product.Stock -= quantity;
    
    try
    {
        await _db.SaveChangesAsync(); // Will throw if another request modified the row
        return Result.Success();
    }
    catch (DbUpdateConcurrencyException)
    {
        // Retry with fresh data — consistency wins
        return Result.Failure("Stock changed, please retry");
    }
}
```

---

### AP Systems: Availability + Partition Tolerance

An AP system, when partitioned, continues serving requests from all nodes even if some nodes have stale data. It prioritizes uptime and responsiveness over immediate consistency. Data will *eventually* converge once the partition heals.

**Real-world examples:** Cassandra, DynamoDB (in its default configuration), CouchDB, and most CDN edge caches. When a partition occurs, all nodes stay up and serve what they have. After the partition heals, a conflict resolution mechanism reconciles differences.

In .NET applications, you encounter AP behavior with:
- Redis (by default, async replication — a primary failure before replication can cause lost writes)
- Read replicas in SQL Server (reads from a replica may be seconds behind the primary)
- HTTP caching with cache-aside pattern (serves stale data on Redis/cache hits)
- Event-driven architectures (your inbox may not reflect an event that has not propagated yet)

**When AP is the right choice:**
- Social media feed generation (showing a slightly stale feed is fine)
- Product recommendations (10-second-old recommendations are indistinguishable from real-time)
- Like counts and view counters (exact accuracy is rarely required)
- Analytics dashboards (approximate real-time is good enough for decisions)
- User preferences and profile display to other users (not the author's own session)

```csharp
// AP pattern: cache-aside with graceful staleness handling
public async Task<ProductDto> GetProductAsync(int productId)
{
    var cacheKey = $"product:{productId}";
    
    // Redis is eventually consistent — the data might be slightly stale
    // That's acceptable for product display. Not acceptable for inventory checkout.
    var cached = await _cache.GetStringAsync(cacheKey);
    if (cached != null)
    {
        return JsonSerializer.Deserialize<ProductDto>(cached);
    }
    
    var product = await _db.Products.FindAsync(productId);
    
    await _cache.SetStringAsync(
        cacheKey,
        JsonSerializer.Serialize(product),
        new DistributedCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5)
        });
    
    return product;
}
```

---

### Consistency Models Are Not Binary

A common mistake is treating consistency as a binary choice — either you have it or you do not. In reality, there is a spectrum of consistency models, and choosing the *weakest model that satisfies your business requirement* is correct engineering:

| Consistency Model | Guarantee | Cost |
|---|---|---|
| **Linearizability** | Every read sees the latest write globally | High coordination overhead, high latency |
| **Sequential consistency** | All nodes see ops in the same order (not necessarily real-time) | Moderate coordination |
| **Causal consistency** | Causally related operations seen in correct order | Lower overhead |
| **Read-your-writes** | After a write, the same client sees it immediately | Usually achievable with session routing |
| **Monotonic reads** | Once you see version N, you never see version N-1 | Client-side tracking |
| **Eventual consistency** | Replicas converge if no new updates | Minimal coordination |
| **Weak consistency** | No meaningful guarantee | Zero coordination overhead |

For most .NET web APIs, **read-your-writes consistency** is the minimum acceptable baseline for users. When a user changes their profile photo, they must see the new photo immediately. Other users can see it eventually. This is achievable without full linearizability by routing reads after writes to the primary replica.

```csharp
// Read-your-writes: route reads to primary for a period after writes
// using session-level tracking

public class SessionConsistencyMiddleware
{
    public async Task InvokeAsync(HttpContext context, IUserActivityTracker tracker)
    {
        var userId = context.User?.Identity?.Name;
        var lastWriteTime = userId != null 
            ? await tracker.GetLastWriteTimeAsync(userId) 
            : (DateTime?)null;
        
        // If user wrote something recently, route reads to primary
        if (lastWriteTime.HasValue && 
            DateTime.UtcNow - lastWriteTime.Value < TimeSpan.FromSeconds(10))
        {
            context.Items["UseReadReplica"] = false; // Force primary
        }
        
        await _next(context);
    }
}
```

---

### Practical Decision Framework for .NET Systems

When you are designing a feature, ask these four questions:

**1. What is the business impact of serving stale data?**
- Money moves incorrectly → Strong consistency required (CP)
- User sees an old profile photo for 3 seconds → Eventual consistency fine (AP)
- User completes a checkout with stale inventory → Strong consistency (CP)
- Recommendation engine shows yesterday's trending items → Eventual consistency fine (AP)

**2. What is the business impact of temporary unavailability?**
- Payment processing unavailable for 30 seconds → Very high impact, but acceptable if it prevents data corruption
- Social feed unavailable for 30 seconds → Moderate impact, users notice
- Analytics dashboard unavailable for 5 minutes → Low impact during a partition

**3. Can conflicts be automatically resolved?**
- Like counts: last writer wins or add/subtract CRDT — automatic resolution is feasible
- Bank balances: cannot use last-writer-wins, need strong ordering
- Shopping cart: merge strategy is viable (union of items), Amazon famously uses this

**4. Is the data derived or canonical?**
Derived data (recommendations, aggregations, counts) can always be recomputed from canonical data and therefore tolerates lower consistency. Canonical data (account balances, ownership records) requires stronger guarantees.

---

### ACID vs BASE: The Practical Version

ACID and BASE are often presented as competing philosophies, but experienced architects use both in the same system for different features:

**Use ACID (with SQL Server or PostgreSQL) for:**
- Order creation and payment processing
- Inventory reservation during checkout
- User authentication state changes (password reset, account lockout)
- Financial ledger entries
- Any workflow where partial success is worse than failure

**Use BASE (with Redis, Cosmos DB, or async event processing) for:**
- Session data and user activity tracking
- Product catalog display (not inventory — just display data)
- Notification delivery (at-least-once delivery with idempotency is fine)
- User preference storage
- Analytics event ingestion
- Feed and timeline generation

In a typical healthcare SaaS system built with ASP.NET Core, you might have:
- SQL Server (ACID) for patient records, appointment scheduling, billing
- Redis (BASE) for session management, doctor lookup cache, notification inbox
- Azure Service Bus (BASE with ordering guarantees) for async workflows between services

This is called **polyglot persistence** — choosing the right tool for each data access pattern. The sophistication is in knowing which workloads belong where.

---

### Real Partition Scenarios in Azure

If you are running .NET microservices on Azure, understanding partitions concretely helps:

**Azure SQL Database failover**: During a geo-failover, the system is temporarily inconsistent while the secondary region becomes primary. Applications get connection errors. This is a CP decision — SQL prioritizes consistency over availability during the switchover.

**Azure Redis Cache failure**: If Redis becomes unavailable, your application should fall back to the database (cache miss). The system remains available (AP behavior) but slower. Serving a slightly stale cached response for a few milliseconds from a failing Redis replica before the failure is detected is also AP behavior.

**Azure Service Bus during network issues**: Messages may be delayed but will not be lost (at-least-once delivery). Consumers should implement idempotency to handle duplicate delivery after redelivery.

**Cosmos DB multi-region writes**: Cosmos DB with "Bounded Staleness" consistency allows reads from local region (available, fast) while guaranteeing you are at most N updates behind the write region. This is a tunable AP/CP dial.

---

### If an Interviewer Asks...

**"Is SQL Server a CP or AP database?"**

Neither exclusively. A standalone SQL Server is effectively CA (not distributed). SQL Server with Always On Availability Groups configured for synchronous commit is CP — reads from the secondary are blocked until the primary confirms. With asynchronous commit, it leans AP — reads from a secondary may be slightly stale but the system stays available during primary failure.

**"How would you handle consistency in a distributed transaction across two microservices?"**

Avoid 2-phase commit across microservices — it creates tight coupling and can block both services during network issues. Use the Saga pattern instead: break the transaction into local steps with compensating transactions for failure. I have a full post on this in the related posts.

**"What does 'eventual consistency' mean in practice?"**

It means replicas may show different values temporarily, but if writes stop, all replicas will converge to the same value. The convergence time depends on your system — Redis async replication typically converges in milliseconds. Cassandra in a multi-region setup might take seconds. The business must decide whether the convergence window is acceptable.

---

## Trade-offs Covered
- Consistency vs availability during network partitions
- Strong (linearizable) consistency vs eventually consistent caching (Redis)
- Read-your-writes vs global strong consistency
- ACID transactions vs BASE eventual convergence
- SQL Server sync replication (CP) vs async replication (AP)
- Polyglot persistence — using multiple consistency models in one system

## Key Concepts
- **Partition tolerance**: System continues operating when network links between nodes fail
- **Linearizability**: Strongest consistency model — reads always see the most recent write globally
- **Read-your-writes**: After a write, the same client can immediately read its own update
- **Eventual consistency**: Replicas temporarily differ but converge when writes stop
- **CRDT**: Conflict-free Replicated Data Type — data structure that can be merged without conflict
- **Polyglot persistence**: Using different databases with different consistency models for different workloads in the same system
- **Optimistic concurrency**: Detecting conflicts at commit time (used in EF Core via `RowVersion`)

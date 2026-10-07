---
title: "Database Sharding Strategies for .NET Applications"
description: "Sharding strategies and shard key selection for SQL Server in .NET microservices — range, hash, and directory sharding explained with examples."
date: "2026-10-07"
category: "distributed-systems"
tags: ["Database Sharding", "Partitioning", "SQL Server", ".NET", "Scalability"]
---

Most production databases never need sharding. They need better indexing, caching, read replicas, and occasionally vertical scaling. Sharding is complex, expensive to migrate to, and trades some capabilities (cross-shard joins, transactions) for others (horizontal scale). If you are considering it, you have genuinely exhausted the simpler options.

That said, when you do need horizontal database scaling — and some systems genuinely do — understanding sharding properly is the difference between a system that scales and one that creates new performance crises.

---

### Partitioning vs Sharding

These terms are often used interchangeably but represent different things:

**Table partitioning** (SQL Server partitioned tables): A single database splits a large table into physical partitions based on a column value. All partitions live on the same server. The database engine handles routing transparently. This is a storage and performance optimization, not a scaling solution.

```sql
-- SQL Server table partitioning by date
CREATE PARTITION FUNCTION OrderDatePF (datetime2)
AS RANGE RIGHT FOR VALUES (
    '2023-01-01', '2024-01-01', '2025-01-01', '2026-01-01'
);

CREATE PARTITION SCHEME OrderDatePS
AS PARTITION OrderDatePF ALL TO ([PRIMARY]);

CREATE TABLE Orders (
    OrderId bigint NOT NULL,
    OrderDate datetime2 NOT NULL,
    CustomerId int NOT NULL,
    Total decimal(18,2) NOT NULL
) ON OrderDatePS(OrderDate); -- Route to partition based on OrderDate
```

Benefit: Queries filtered by `OrderDate` hit only relevant partitions. Old partitions can be archived by switching them out without deleting rows individually.

**Sharding** (horizontal partitioning across servers): Data is split across multiple separate database servers. Each "shard" is an independent database. This is a true scaling solution — each shard has its own CPU, memory, and storage.

The complexity cost is significant: your application (or a middleware layer) must know which shard to route each query to. Cross-shard queries require scatter-gather patterns. Transactions cannot span shards without a saga pattern. Schema changes must be applied to every shard.

---

### The Three Sharding Strategies

#### 1. Range-Based Sharding

**How it works**: Rows are distributed across shards based on a range of shard key values.

```
Shard 1: CustomerId 1 – 1,000,000
Shard 2: CustomerId 1,000,001 – 2,000,000
Shard 3: CustomerId 2,000,001 – 3,000,000
```

**Pros**: Simple. Range queries that stay within one shard are efficient. Easy to understand shard boundaries.

**Cons**: Sequential inserts create hot spots. If your CustomerIds are assigned sequentially (autoincrement), all new customers go to the last shard. That shard receives all write traffic while others sit idle. This is called a hot partition — exactly what sharding was supposed to solve.

**Also problematic**: Uneven data distribution. If customers in shard 1 historically placed much larger order volumes, that shard is under more load even with equal customer counts.

**Best for**: Time-series data where old data is rarely written (shards for historical data, append-only for current shard). Event logs partitioned by timestamp. Archival systems.

#### 2. Hash-Based Sharding

**How it works**: Apply a hash function to the shard key, then use modulo to determine the shard.

```
shard = hash(CustomerId) % num_shards

CustomerId 12345: hash = 8901234 → 8901234 % 4 = 2 → Shard 2
CustomerId 12346: hash = 1234567 → 1234567 % 4 = 3 → Shard 3
```

**Pros**: Distributes load evenly across shards (assuming a good hash function). No hot partitions from sequential writes.

**Cons**: Range queries across shards are expensive — "all orders from customer 100 to customer 200" requires querying all shards. Adding a shard requires rehashing and migrating most of the data (`% 4` vs `% 5` produces entirely different shard assignments for most keys).

**Mitigation for resharding**: Consistent hashing (as covered in the load balancing post) minimizes data movement when adding shards. A ring-based approach remaps only `1/n` of keys when adding the nth shard.

**Best for**: Write-heavy systems with uniform write distribution. User data where reads are primarily by user ID. Systems where range queries are rare.

#### 3. Directory-Based Sharding (Lookup Service)

**How it works**: A separate lookup service/table maps each shard key to a shard. The application queries the directory before querying the shard.

```
Directory Table:
TenantId → Shard
-----------------
ACME Corp → Shard 2
NHS England → Shard 1
Startup Inc → Shard 3
...
```

**Pros**: Maximum flexibility. You can move a tenant from one shard to another by updating the directory, without changing application logic. Large customers can get dedicated shards. Small customers can be co-located on shared shards.

**Cons**: The directory is a single point of failure and a potential performance bottleneck. Must be highly available and fast (cache it aggressively). Adds an extra network hop per request.

**Best for**: Multi-tenant SaaS systems. Healthcare platforms where each hospital/clinic is a tenant. Systems where tenants have very different sizes and need flexible placement.

---

### Choosing a Shard Key

The shard key decision is the most critical and least reversible decision in database sharding. Wrong choices are very expensive to fix.

**Properties of a good shard key:**
- **High cardinality**: Enough distinct values to distribute across many shards (not `country` with 200 values, but `user_id` with millions)
- **Even write distribution**: Avoids hot shards (sequential integers are dangerous; UUIDs are better for hash sharding)
- **Query alignment**: The most common queries filter by the shard key, keeping queries within one shard
- **Immutability**: The shard key value for a row should not change (if a customer's `region` changes, their data would need to move shards)

**Multi-tenant SaaS: tenant_id as shard key**

For a multi-tenant ASP.NET Core application (clinic management, HR software, etc.), `tenant_id` is almost always the correct shard key:

```csharp
// Shard routing middleware in ASP.NET Core
public class ShardRoutingDbContext : DbContext
{
    private readonly IShardDirectoryService _shardDirectory;
    private readonly IHttpContextAccessor _httpContext;
    
    protected override void OnConfiguring(DbContextOptionsBuilder options)
    {
        var tenantId = _httpContext.HttpContext?.User
            .FindFirstValue("tenant_id") ?? "default";
        
        // Directory lookup (cached in Redis, < 1ms)
        var connectionString = _shardDirectory
            .GetConnectionStringAsync(tenantId)
            .GetAwaiter()
            .GetResult();
        
        options.UseSqlServer(connectionString);
    }
}
```

Benefits: All of a tenant's data stays on one shard — no cross-shard queries for any tenant-scoped operation. Tenants can be migrated between shards for load balancing. Compliance requirements (GDPR: "delete all data for this customer") are simple — drop or restore from one shard.

---

### Cross-Shard Operations

The main pain point of sharding is operations that span shards. These require careful design:

**Aggregation (count users across all shards)**:
```csharp
// Scatter-gather pattern
public async Task<int> GetTotalUserCountAsync()
{
    var shards = await _shardDirectory.GetAllShardsAsync();
    
    var tasks = shards.Select(shard => 
        GetUserCountFromShardAsync(shard.ConnectionString));
    
    var counts = await Task.WhenAll(tasks);
    return counts.Sum();
}
```

**Reporting across shards**: Keep a separate analytics replica that receives events from all shards via change data capture (CDC) or event streaming. Never run cross-shard analytical queries in real time against production shards.

**Distributed transactions across shards**: Use the Saga pattern. Do not attempt 2PC across shards — it will block under failure and defeat the purpose of sharding.

---

### When Not to Shard

Sharding is not always the answer. Before sharding SQL Server, try:

1. **Read replicas**: Direct read traffic to replicas (handles 80% of most workloads)
2. **Caching**: Redis in front of hot queries can remove 90%+ of database load
3. **Vertical scaling**: Azure SQL Hyperscale scales to 100+ TB and can add read replicas on demand
4. **Table partitioning**: SQL Server partitioning eliminates sequential scan overhead for time-series data
5. **Archival**: Move old data to cold storage, keeping the active database lean

Most .NET applications with a primary SQL Server that is struggling need one of these first, not sharding.

---

### If an Interviewer Asks...

**"How do you choose a shard key?"**

Choose a shard key that: (1) has high cardinality, (2) distributes writes evenly, (3) aligns with your most common query patterns so most queries hit one shard, and (4) is immutable or rarely changes for a given row. For multi-tenant SaaS, `tenant_id` is usually the answer. For user-centric systems, `user_id` with hash sharding is common.

**"What is a hot shard and how do you prevent it?"**

A hot shard occurs when one shard receives significantly more traffic than others — typically because the shard key has uneven distribution (e.g., a celebrity account's data on one shard) or because sequential key assignment routes all new writes to the latest shard. Prevention: use hash-based sharding for even distribution, or design around consistent hashing. Detection: monitor per-shard CPU, I/O, and query latency. Resolution: split the hot shard or redesign the shard key.

---

## Trade-offs Covered
- Range sharding simplicity vs hot shard risk
- Hash sharding even distribution vs range query cost
- Directory-based sharding flexibility vs directory bottleneck risk
- Sharding horizontal scale vs cross-shard query complexity
- Tenant-based sharding vs user-based sharding in SaaS

## Key Concepts
- **Shard**: An independent database server holding a partition of the total dataset
- **Shard key**: The column used to determine which shard stores a row
- **Hot partition**: A shard receiving disproportionately more traffic than others
- **Scatter-gather**: Querying all shards in parallel and aggregating results
- **Directory sharding**: A lookup service that maps shard keys to shard locations

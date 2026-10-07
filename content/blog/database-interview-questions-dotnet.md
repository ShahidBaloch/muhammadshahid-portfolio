---
title: "Database Interview Questions for .NET Developers"
description: "Database interview prep for .NET developers. How to answer questions on sharding, replication, indexing, ACID, BASE, and SQL vs NoSQL."
date: "2026-10-07"
category: "interview-prep"
tags: ["Database", ".NET", "Interview Questions", "SQL Server", "Sharding", "Replication"]
---

## Question 1: "What Are the ACID Properties and When Do You Need Them?"

### 30-Second Answer
ACID stands for Atomicity (all or nothing), Consistency (valid state before and after), Isolation (concurrent transactions do not interfere), Durability (committed transactions persist). You need ACID for financial transactions, inventory updates, and any operation where partial completion causes incorrect state.

### Strong Answer
**Atomicity**: A transaction either fully commits or fully rolls back. `Order.Submit()` that updates the order status AND reserves inventory — if inventory reservation fails, the order status reverts too.

**Consistency**: The database constraints (foreign keys, unique constraints, check constraints) are satisfied at the start and end of every transaction. A constraint violation causes the transaction to fail.

**Isolation**: Concurrent transactions behave as if they ran sequentially. SQL Server isolation levels determine the trade-off between isolation and performance:
- `READ UNCOMMITTED`: No isolation — dirty reads allowed (fastest, riskiest)
- `READ COMMITTED`: Default — reads only committed data, but non-repeatable reads possible
- `REPEATABLE READ`: Re-reading the same row in a transaction returns the same value
- `SERIALIZABLE`: Full isolation — no phantom reads, but maximum lock contention
- `SNAPSHOT ISOLATION`: Readers don't block writers; reads see a snapshot from transaction start (best for read-heavy systems)

**Durability**: A committed transaction survives crash. SQL Server writes to the transaction log before acknowledging the commit.

**When ACID is essential**: Payment processing, inventory deduction, order placement, user account creation (with unique email constraint). Any operation where "half done" creates an incorrect or inconsistent state.

**When ACID overhead is acceptable to relax**: Session data, caches, analytics, logs — BASE systems (eventual consistency) work for these.

### Red Flags
- "Isolation means transactions can't see each other" — imprecise. The level of isolation is configurable and has performance implications.
- Not knowing the isolation levels when discussing SQL Server

---

## Question 2: "When Would You Use NoSQL Over a Relational Database?"

### 30-Second Answer
NoSQL when the data model is document-shaped (hierarchical, variable schema), when you need horizontal scaling beyond what SQL can provide, or when the access pattern is always by a single key. SQL when you need ACID, complex queries, ad-hoc reporting, or strong consistency.

### Strong Answer
NoSQL is not "better than SQL" — it is optimised for different access patterns.

**Document databases (Cosmos DB, MongoDB)**:
- Use when: data is naturally hierarchical (a patient record with nested diagnoses, medications, allergies), schema varies across records, reads always access the complete document
- Avoid when: you need complex queries across document properties, joins between document types, or ACID transactions

**Key-value stores (Redis)**:
- Use when: single-key lookups, session storage, caching, rate limiting counters
- Avoid when: you need to query on non-key fields or relationships

**Column-family stores (Cassandra, Azure Table Storage)**:
- Use when: time-series data with high write throughput and queries always filter by partition key (device ID + time range)
- Avoid when: ad-hoc queries, frequent schema changes, ACID transactions

**Graph databases (Neo4j, Cosmos DB Gremlin)**:
- Use when: data is inherently relational (social networks, dependency graphs, fraud detection)
- Avoid when: your graph queries are actually simple foreign key joins — SQL handles those fine

**Decision framework**:
1. Is data structure fixed and relational? → SQL
2. Is data hierarchical with variable schema? → Document
3. Is the access pattern always by a single key? → Key-value
4. Is write throughput the primary concern? → Column-family
5. Is the data topology (connections) the primary query? → Graph

### Red Flags
- "NoSQL scales better than SQL" — SQL Server scales very well with proper indexing, read replicas, and Azure SQL Hyperscale. Most teams choose NoSQL prematurely.
- Not being able to give a concrete example of when each type is appropriate

---

## Question 3: "What Is Database Replication and How Does It Affect Your Architecture?"

### 30-Second Answer
Replication copies data from a primary database to one or more replicas. Read replicas handle read traffic, reducing load on the primary. Synchronous replication guarantees no data loss but adds latency. Asynchronous replication reduces latency but creates a replication lag window where replicas may be behind.

### Strong Answer
**Synchronous replication**: Primary waits for the replica to acknowledge before confirming the write to the client. No data loss (replica is always current). Higher write latency because the round-trip includes the replica acknowledgement. SQL Server Always On with synchronous commit mode.

**Asynchronous replication**: Primary writes locally and confirms immediately; replicates to secondaries in the background. Lower write latency. Replication lag: secondaries can be seconds or minutes behind. Data loss risk if primary fails before replication completes.

**Architecture implications**:
```
Read-heavy API:
  Writes → Primary SQL Server
  Reads → Read Replica (can be slightly stale)
  
In EF Core:
  var reportDb = _dbContextFactory.CreateDbContext(); // Points to replica
```

**Read your own writes problem**: A user submits a form and immediately reads back their data. If the read goes to a replica with replication lag, they may not see their own change. Solutions:
- Route reads to primary immediately after writes for that user session
- Use session consistency — reads go to the replica that has acknowledged the write
- Add a short delay before redirecting to the view page

**Failover**: When the primary fails, a secondary is promoted. With synchronous replication, this is seamless. With asynchronous, there may be a small amount of data loss (the replication lag at failure time).

---

## Question 4: "How Do You Choose a Shard Key?"

### 30-Second Answer
A good shard key has high cardinality, distributes writes evenly (no hot partitions), aligns with your most common query patterns (so most queries hit one shard), and is immutable. For multi-tenant SaaS, tenant ID is usually the correct shard key.

### Strong Answer
The shard key decision is the most critical and hardest-to-reverse decision in sharding. Wrong choices are expensive to fix.

**Properties of a good shard key**:
1. **High cardinality**: Enough distinct values to distribute across many shards. `country` (200 values) is poor. `user_id` (millions) is good.
2. **Even write distribution**: Sequential integers cause hot partitions — all new rows go to the last shard. UUID-based IDs are better.
3. **Query alignment**: Most queries filter by the shard key. A query across all shards requires scatter-gather, which is expensive.
4. **Immutability**: If the shard key can change (e.g., a user's region changes), their row must move shards — extremely disruptive.

**Common patterns**:
- Multi-tenant SaaS → `tenant_id` (all tenant data co-located, cross-tenant queries are rare)
- User-centric systems → `user_id` with hash sharding (even distribution, reads always by user ID)
- Time-series data → `(device_id, timestamp)` composite — device ID ensures device data is co-located, timestamp ranges can be on one shard

**What goes wrong with bad shard keys**:
- Sequential ID → hot partition: all writes hit the most recent shard
- Low cardinality key → some shards are always full, others empty
- Non-query-aligned key → every read becomes scatter-gather across all shards

### Red Flags
- "Just use the auto-increment ID" — this creates hot partitions in hash sharding
- Not mentioning immutability as a requirement

---

## Question 5: "What Is N+1 in EF Core and How Do You Fix It?"

### 30-Second Answer
N+1 is when EF Core executes one query to get N records, then N additional queries to get related data for each record. Fix it with explicit loading (Include), projections (Select with anonymous type), or batch loading.

### Strong Answer
```csharp
// N+1 problem
var orders = await _db.Orders.ToListAsync();  // 1 query
foreach (var order in orders)
{
    // EF Core lazily loads customer for each order — N queries!
    Console.WriteLine(order.Customer.Name);
}
// Total: 1 + N queries

// Fix 1: Eager loading with Include
var orders = await _db.Orders
    .Include(o => o.Customer)  // Single JOIN query
    .ToListAsync();

// Fix 2: Projection — only fetch what you need
var dtos = await _db.Orders
    .Select(o => new OrderDto
    {
        Id = o.Id,
        CustomerName = o.Customer.Name  // EF Core generates the JOIN
    })
    .ToListAsync();

// Fix 3: Split query for large collections (avoids Cartesian explosion)
var orders = await _db.Orders
    .Include(o => o.Lines)
    .AsSplitQuery()  // Separate query for Lines, avoids row multiplication
    .ToListAsync();
```

**When to use AsSplitQuery**: When including multiple collection navigations (`Include(o => o.Lines).Include(o => o.Tags)`). Without it, the query generates a Cartesian product: N orders × M lines × K tags rows in the result set. AsSplitQuery executes separate queries and stitches in-memory.

### Red Flags
- "Use lazy loading" — lazy loading is the cause of the N+1 problem, not the solution
- Not knowing when to use AsSplitQuery vs Include

---

## Question 6: "What Is the Difference Between a Clustered and Non-Clustered Index?"

### 30-Second Answer
A clustered index defines the physical order of rows in the table — there is only one per table (usually the primary key). A non-clustered index is a separate structure that points to rows. Clustered index lookups are fast; non-clustered lookups require a second lookup to get the full row (unless the index is covering).

### Strong Answer
**Clustered index**: The table data is stored in the clustered index B-tree. Rows are physically ordered by the clustered index key. A range scan on the clustered key (`WHERE OrderDate BETWEEN...`) is very efficient — sequential I/O.

**Non-clustered index**: A separate B-tree with the indexed columns and a pointer (Row ID or clustered key) to the actual row. A non-clustered index lookup for a row that needs columns not in the index requires a **key lookup** — an extra read to fetch the full row. This is the "include columns" optimization opportunity.

**Covering index**: A non-clustered index that includes all columns needed by a query — no key lookup required:
```sql
-- Query needs OrderId, Status, and Total
CREATE NONCLUSTERED INDEX IX_Orders_Status
ON Orders(Status)
INCLUDE (Total);  -- Covers the query — no key lookup needed
```

**Common mistake**: Adding too many non-clustered indexes. Each index slows down inserts, updates, and deletes — the index must be maintained on every write. Find the balance for your read-to-write ratio.

---

## Quick-Fire Answers

**"What is connection pooling?"**
Connection pooling reuses existing database connections instead of creating a new one for each request. Creating a connection is expensive (TCP handshake, authentication). ADO.NET and EF Core use connection pooling by default. For high-throughput APIs: size the pool appropriately and monitor connection wait time.

**"What is the difference between TRUNCATE and DELETE?"**
DELETE removes rows one by one, generates undo log, fires triggers, and can be rolled back within a transaction. TRUNCATE deallocates data pages, is minimally logged, does not fire row-level triggers, and cannot be rolled back in most SQL Server configurations (it can be in an explicit transaction). TRUNCATE is faster for clearing large tables.

**"What is optimistic vs pessimistic concurrency?"**
Pessimistic: lock the row when reading so no other transaction can modify it until you commit. Safe but reduces throughput. Optimistic: read without locking, update with a version check — if the row was modified since you read it, reject your update. EF Core's `[Timestamp]` or `IsConcurrencyToken()` implements optimistic concurrency.

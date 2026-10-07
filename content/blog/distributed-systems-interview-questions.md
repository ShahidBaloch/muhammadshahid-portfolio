---
title: "Distributed Systems Interview Questions for .NET Developers"
description: "Distributed systems interview prep for .NET engineers. CAP theorem, consistency models, partition tolerance, and distributed transactions explained."
date: "2026-10-07"
category: "interview-prep"
tags: ["Distributed Systems", ".NET", "Interview Questions", "CAP Theorem", "Consistency"]
---

## Question 1: "Explain the CAP Theorem"

### 30-Second Answer
CAP theorem states that a distributed system can guarantee at most two of three properties: Consistency (all nodes see the same data at the same time), Availability (every request receives a response), and Partition Tolerance (the system continues operating when network partitions occur). In practice, network partitions are inevitable, so the real choice is CP or AP.

### Strong Answer
The CAP theorem forces a choice during a network partition — the scenario where some nodes cannot communicate with others.

**CP systems (Consistency + Partition Tolerance)**: When partitioned, the system rejects requests rather than return potentially stale data. SQL Server with synchronous replication is CP: if the replica is unreachable, writes to the primary are rejected to maintain consistency.

**AP systems (Availability + Partition Tolerance)**: When partitioned, nodes accept requests and return the best answer they have (possibly stale). DynamoDB, Cassandra, and CouchDB default to AP: they return the local node's data even if it may not reflect the latest writes.

**What CA systems would be**: A single-node database — no partition to tolerate, always consistent and available. Not useful in distributed systems.

**In .NET context**:
```
CP choices: SQL Server with sync replication, Azure SQL with strong consistency
AP choices: Cosmos DB (multi-region, session consistency), Redis cluster, Cassandra
```

The practical question: "If I am in the middle of a network partition, would I rather reject requests (CP) or return potentially stale data (AP)?" For financial balances: CP. For product catalogues and user profiles: AP is acceptable.

### Common Follow-up Questions
- "Is Cosmos DB CP or AP?" — Configurable. With strong consistency level, it is CP. With session or eventual consistency, it leans AP. The consistency level is a per-operation choice.
- "Can you give a real example where you chose CP over AP?" — Inventory: showing a customer an item as "in stock" when it is not means a failed order and a bad experience. Better to show "out of stock" (reject the read or show cached but risk showing stale). CP is better here.

### Red Flags
- "You pick two of three all the time" — you only make the CP/AP choice during a partition, not all the time
- Not being able to give a real example of CP vs AP trade-offs

---

## Question 2: "What Is Eventual Consistency and When Is It Acceptable?"

### 30-Second Answer
Eventual consistency means that updates will propagate to all replicas and all nodes will converge to the same value — eventually. There is no guarantee about when. It is acceptable when brief inconsistency does not cause real-world harm: product catalogues, user profiles, analytics, social media feeds.

### Strong Answer
Eventual consistency is a trade-off: you get higher availability and lower latency in exchange for accepting that different parts of the system may temporarily see different data.

**Acceptable scenarios**:
- Product catalogue: A product's price being 30 seconds stale on one region's cache is usually acceptable. The financial risk is low.
- User profile (avatar, bio): Propagating to CDN nodes over seconds or minutes is fine.
- Analytics/metrics: Approximate counts are acceptable; you do not need exact real-time counts.
- Social media notifications: Seeing a like 5 seconds late does not matter.

**Not acceptable scenarios**:
- Bank account balance: A customer seeing their balance as £1,000 when it is £0 (after a withdrawal) can lead to fraud.
- Inventory availability: Showing "in stock" to 100 users when only 1 item remains, then failing all 99 other orders.
- Access control: A user whose account was suspended must not have a window where they still pass auth checks.

**The session consistency middle ground**: Cosmos DB and other systems offer "session consistency" — read-your-own-writes within a session, eventual across sessions. This is often the right balance: a user always sees their own changes immediately, but other users may see stale data briefly.

### Red Flags
- "Eventual consistency is always acceptable because distributed systems require it" — misses real use cases where it is not
- Not distinguishing between types of data that need strong vs eventual consistency

---

## Question 3: "What Is Idempotency and Why Does a Distributed System Need It?"

### 30-Second Answer
An operation is idempotent if calling it multiple times produces the same result as calling it once. Distributed systems need it because network failures cause retries: you cannot know if the server received and processed your request before the network dropped. Without idempotency, retries create duplicates — charging a customer twice, creating two orders.

### Strong Answer
Network failures have three outcomes from the client's perspective:
1. The request was never received by the server → retry is safe
2. The request was received and failed → retry is safe
3. The request was received, processed, and the response was lost → retry causes duplicate execution

Since the client cannot distinguish case 2 from case 3, it must retry. If the operation is not idempotent, case 3 causes duplicate side effects.

**Two-layer idempotency in .NET**:

Layer 1 — Middleware cache:
```csharp
// Cache response under idempotency key
var cached = await _cache.GetStringAsync($"idempotency:{key}");
if (cached != null) return deserialise(cached);
```

Layer 2 — Database constraint:
```sql
-- Unique constraint on IdempotencyKey column
ALTER TABLE Payments ADD CONSTRAINT UQ_Payments_IdempotencyKey 
    UNIQUE (IdempotencyKey);
```

The middleware handles obvious duplicates fast. The database constraint handles race conditions when two identical requests arrive simultaneously.

**For message consumers**: At-least-once delivery is the standard guarantee. Every consumer must handle receiving the same message twice:
```csharp
if (await _repository.IsEventProcessedAsync(messageId)) return; // Skip duplicate
```

### Red Flags
- Not knowing why retries cause the problem
- Thinking HTTP GET methods need idempotency consideration (they do not — reads have no side effects)

---

## Question 4: "How Does Consistent Hashing Work?"

### 30-Second Answer
Consistent hashing maps keys to nodes using a ring. When a node is added or removed, only `1/n` of keys need to be remapped instead of all keys. This minimises cache invalidation and data migration when scaling.

### Strong Answer
Standard modulo hashing: `node = hash(key) % num_nodes`. Problem: when you add a 4th node to a 3-node cluster, `% 3` and `% 4` produce different results for almost every key — most keys need remapping.

Consistent hashing places both nodes and keys on a circular "ring" of hash values. Each key is owned by the first node clockwise from it. When a node is added, it takes only the keys between it and its predecessor — approximately `1/n` of all keys. When a node is removed, its keys go to the next node.

**Virtual nodes** improve distribution: each physical node has `k` virtual nodes on the ring. With `k=150`, even if physical nodes have different hardware capacities (assign more virtual nodes to larger servers), the distribution is smooth.

**Where it matters in .NET**:
- Redis Cluster uses consistent hashing — you need to be aware of it when using the `{tag}` hash tag syntax to co-locate keys on the same slot
- Distributed caching with multiple cache servers
- Horizontal database sharding strategies

### Red Flags
- "Consistent hashing solves all load balancing problems" — it is specifically about minimising remapping on topology changes, not general load balancing

---

## Question 5: "What Is the Two-Generals Problem?"

### 30-Second Answer
Two generals must agree to attack simultaneously but can only communicate via messengers who might be captured. There is no way to guarantee both attack at the same time — any final confirmation message could be lost. It illustrates that reliable consensus over an unreliable channel is impossible.

### Strong Answer
In distributed systems: two nodes cannot achieve guaranteed consensus over a network that might lose messages. This is the theoretical foundation for why "exactly-once" semantics are so hard to achieve.

**Practical implications**:
- You cannot guarantee that a request was processed exactly once — only at-most-once (no retries) or at-least-once (with retries but possible duplicates)
- "Exactly-once" in Kafka is achieved through idempotent producers + transactional APIs, but it adds significant complexity and is not truly guaranteed at the network level — it is achieved through application-level coordination

**For .NET engineers**: Accept at-least-once delivery and design consumers to be idempotent. Do not try to solve the two-generals problem — use the idempotency pattern instead.

---

## Question 6: "What Is the Difference Between Leader Election and Consensus?"

### 30-Second Answer
Leader election is a specific application of consensus — the nodes agree on which one is the leader. Consensus is the general problem of nodes agreeing on a value despite failures. Raft and Paxos are consensus algorithms; ZooKeeper and etcd implement consensus to provide leader election and distributed coordination.

### Strong Answer
**When you need it in .NET**: Any time you have a singleton background job (e.g., a scheduler that runs once across all instances). Without leader election, all 5 instances run the scheduler and 5 jobs execute simultaneously.

**Practical approach for .NET**: Use a distributed lock in Redis via the Redlock algorithm (StackExchange.Redis + RedLock.net):

```csharp
public class SchedulerBackgroundService : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            // Only one instance holds this lock at a time
            await using var @lock = await _redLock.CreateLockAsync(
                "scheduler-lock",
                TimeSpan.FromMinutes(5),
                TimeSpan.FromSeconds(10),  // Wait for lock
                TimeSpan.FromSeconds(1),   // Retry interval
                stoppingToken);
            
            if (@lock.IsAcquired)
            {
                await RunScheduledJobsAsync(stoppingToken);
            }
            
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }
    }
}
```

For Kubernetes deployments, a single-replica StatefulSet achieves the same effect more simply — only one pod.

---

## Quick-Fire Answers

**"What is the difference between strong and eventual consistency?"**
Strong (linearizable) consistency: every read reflects the most recent write, regardless of which node you read from. Every read blocks until all replicas acknowledge the write. Eventual consistency: reads may return stale data; all replicas will converge eventually. Strong consistency sacrifices latency and availability for correctness; eventual consistency does the opposite.

**"What is a split-brain scenario?"**
When a network partition causes two groups of nodes to each believe they are the leader. Both groups accept writes, creating two divergent datasets. Preventing split-brain: require quorum (majority agreement) before accepting writes. Kubernetes etcd requires 3 or 5 nodes for exactly this reason — quorum prevents split-brain.

**"What is backpressure in distributed systems?"**
Backpressure is a mechanism by which a slow consumer signals to a fast producer to slow down. Without it, the producer fills a buffer, the buffer fills memory, and the system crashes. In .NET: `System.Threading.Channels` provides bounded channels that naturally apply backpressure — the producer blocks when the channel is full.

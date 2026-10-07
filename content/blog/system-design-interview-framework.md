---
title: "System Design Interview: A Repeatable Framework"
description: "A repeatable 4-step framework for system design interviews. Learn how to structure requirements, high-level design, and scaling answers."
date: "2026-10-07"
category: "system-design"
tags: ["System Design", "Interview Prep", "Architecture", "Senior Engineer"]
---

You have 45 minutes to design Twitter. Where do you start?

Most engineers start drawing boxes. They sketch a `UserService`, a `TweetService`, and a `FeedService`, maybe throw in a load balancer and a Redis cache, and present it as a solution. The interviewer nods along, asks "what happens when a celebrity with 50 million followers posts a tweet?" and watches the candidate flounder.

The problem is not knowledge. The problem is structure. System design is fundamentally different from coding — it is not about writing correct code, it is about making good decisions under ambiguity. And good decisions require a clear process before anything gets drawn.

The framework presented here is a four-step approach used by staff-level engineers across the industry. Apply it to any system design question and you will immediately appear more senior, more thoughtful, and more production-ready than candidates who skip straight to the architecture diagram.

---

### Why Coding Skills Are Not Enough

As a .NET engineer, you have likely spent years getting better at C#, EF Core, async patterns, and API design. Those are real, valuable skills. But they operate at a different level of abstraction than system design.

Coding asks: *How do I implement this feature correctly?*

System design asks: *What shape should this system take so it behaves correctly under growth, failure, cost, and change?*

A feature that works perfectly for 1,000 users can destroy itself at 10 million. A clean ASP.NET Core service that handles requests beautifully can become a single point of failure in a production architecture. System design is about seeing the whole picture — and that requires a different kind of thinking.

The framework below forces exactly that kind of thinking, in the right order.

---

### The Four-Step Framework

#### Step 1: Gather Requirements (5–10 minutes)

Never skip this step. Requirements drive architecture. Vague requirements produce drifting architecture.

**Functional requirements** define *what* the system must do — the concrete user actions and system behaviors.

```
"Build a URL shortener" is NOT a requirement.

Real functional requirements:
1. Users can submit a long URL and receive a short URL
2. Visiting the short URL redirects to the original URL
3. Users can request a custom alias (e.g., short.ly/my-campaign)
4. Links can expire after a set time
5. Users can view analytics: clicks, countries, devices, referrers
```

**Non-functional requirements** define *how well* the system must do it. These are measurable:

```
"Fast" is NOT a non-functional requirement.

Real non-functional requirements:
- Redirect latency: < 100ms at p99
- Availability: 99.9% (allows ~8.7 hours downtime/year)
- Scale: support 100 million stored URLs
- Read-to-write ratio: 100:1 (redirects dominate)
- Short code length: 7 characters or fewer
```

The questions you ask here reveal architectural thinking:
- Who are the users? What actions do they take?
- What is the expected scale? Daily active users? Requests per second?
- What latency is acceptable?
- What is the read/write ratio?
- What happens if data is briefly stale?
- What failure scenarios are unacceptable?

In a healthcare SaaS system, "what data cannot be lost?" is a critical question. In a social feed, "can likes be briefly stale?" may be acceptable. Requirements determine the shape of everything that follows.

> **Interviewer tip**: Always state your assumptions out loud. "I'll assume 10 million daily active users and a 100:1 read-to-write ratio — does that match your expectations?" This shows structured thinking, not guessing.

---

#### Step 2: High-Level Design (10–15 minutes)

Now you draw boxes. But keep it broad. The goal at this stage is to show the major components and how data flows between them — not to solve every detail.

For the URL shortener, a high-level design looks like:

```
[Client]
    |
    v
[Load Balancer]
    |
    +--> [Redirect Servers] --> [Redis Cache] --> [NoSQL DB (URL Mappings)]
    |
    +--> [Shortening Servers] --> [ID Generator] --> [NoSQL DB]
    |
    +--> [Analytics Queue] --> [Stream Processor] --> [Analytics DB]
```

At this stage, justify major component choices briefly:
- "I'm separating redirect servers from shortening servers because these have very different scaling characteristics — the redirect path handles 100x more traffic."
- "I'm using Redis for the hot path cache because most redirects should be answered without hitting the database."
- "I'm using a message queue for analytics because I don't want click tracking to slow down redirects."

Do not dive deep into any single component yet. That comes in Step 3. Right now you're showing that you understand the system shape.

---

#### Step 3: Detailed Design (15–20 minutes)

This is where you demonstrate depth. Pick the two or three most interesting or risky components and go deep. The interviewer will often guide this, but you should have opinions on what deserves attention.

For a URL shortener, the interesting deep-dives are:
1. **Short code generation strategy** — hashing vs counter-based vs distributed ID generation
2. **Redirect hot path** — cache-aside pattern, CDN caching, avoiding hot partition issues
3. **Analytics pipeline** — why async processing is essential, Kafka/Kinesis design

**Short code generation example**:

The naive approach is to hash the long URL and take the first 7 characters of the hash. The problem is collision risk — two different long URLs could produce the same 7-character prefix. The cleaner approach uses counter-based Base62 encoding:

```csharp
// Counter-based Base62 encoding in C#
public static class Base62Encoder
{
    private const string Chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

    public static string Encode(long number)
    {
        if (number == 0) return "0";
        
        var result = new StringBuilder();
        while (number > 0)
        {
            result.Insert(0, Chars[(int)(number % 62)]);
            number /= 62;
        }
        return result.ToString();
    }
}

// Usage: Encode(1234567) produces a 4-character Base62 string
// With 7 chars: 62^7 ≈ 3.5 trillion unique codes
```

A global counter avoids collisions entirely, but becomes a bottleneck at scale. The production solution uses Snowflake-style distributed ID generation — combining a timestamp, machine ID, and sequence number to create unique IDs without a central bottleneck.

**Consistency question example**: 

In the detailed design, you should address consistency trade-offs explicitly. Custom aliases need stronger consistency (you cannot let two users claim the same alias simultaneously — use a distributed lock or a conditional write with a unique constraint). Click analytics can be eventually consistent — 5-second staleness in a dashboard is entirely acceptable.

---

#### Step 4: Scale and Optimize (10–15 minutes)

Every design has bottlenecks. The final step is identifying them and articulating solutions.

**Common bottlenecks to discuss:**
- Single point of failure (no HA for the load balancer, single database)
- Database read/write hotspots
- Cache invalidation and stampede issues
- High-latency paths that can be async

**Scaling strategies to mention where relevant:**
- **Horizontal scaling** for stateless services (redirect servers can scale out trivially)
- **Database read replicas** for read-heavy workloads
- **CDN caching** for popular content
- **Circuit breakers** for dependency failures (Polly in .NET)
- **Message queues** for decoupling write-heavy paths from the main request

For the URL shortener scaling discussion:
```
Hot key problem: A celebrity tweets a short URL, generating 5M clicks in 10 minutes.

Solutions:
1. CDN edge caching for popular links (most clicks never hit origin)
2. Redis key replication (store hot keys under multiple Redis keys with load spreading)
3. Rate limiting at the edge (prevent DDoS from amplifying hot key issues)
4. Graceful degradation: if analytics pipeline backs up, skip click enrichment,
   write raw log for later processing
```

---

### Time Allocation Guide

```
45-minute interview:
┌─────────────────────────────────────────────┐
│ Requirements gathering          5–10 min     │
│ High-level design               10–15 min    │
│ Detailed design (2–3 areas)     15–20 min    │
│ Scaling + optimization          10–15 min    │
└─────────────────────────────────────────────┘
```

The biggest mistake candidates make is over-investing in Step 3 and running out of time for Step 4. Interviewers at senior level care deeply about whether you think about production concerns, monitoring, and failure modes — not just whether you can describe a happy-path architecture.

---

### Back-of-Envelope Estimation

Between Steps 1 and 2, strong candidates briefly do capacity estimation. This shows architectural thinking and grounds your design decisions in numbers.

For a URL shortener with 100M DAU, 1 URL creation per user per day, and 100 reads per creation:

```
Writes:  100M / 86,400 seconds ≈ 1,160 URL creations/sec
Reads:   100 × 1,160 ≈ 116,000 redirects/sec
Storage: 7 chars + 2KB avg URL + metadata ≈ 3KB/URL × 100M = ~300GB/year
Redis:   Cache top 10% of URLs, serve ~80% of redirects (Pareto distribution)
Servers: At 10k req/sec per server, need ~12 redirect servers (+ headroom)
```

These numbers do not need to be exact. They need to be *directionally correct* — enough to justify architecture decisions like "caching is critical here because 116k redirects/sec hitting the database directly would require enormous infrastructure."

---

### Common Mistakes to Avoid

**1. Starting with technology before requirements**
"I'll use Kafka for messaging" before knowing if you need async processing at all is a red flag. Technology follows requirements.

**2. Treating "fast" as a non-functional requirement**
"The system should be fast" means nothing. "p99 latency under 200ms" is a real requirement that shapes your caching and database choices.

**3. Designing only the happy path**
What happens when the ID generator goes down? What if Redis becomes unavailable? What if a popular link creates a hot partition? Interviewers at senior level test failure thinking.

**4. Over-engineering for hypothetical scale**
You do not need Kafka + Cassandra + a CDN for a system expecting 1,000 users. Architects choose the *simplest design that satisfies the requirements*, not the most impressive one.

**5. Ignoring operational concerns**
Real production systems need monitoring, alerting, circuit breakers, and deployment strategies. Mentioning these shows production readiness.

---

### If an Interviewer Asks...

**"What if we need to support 10x the traffic you designed for?"**

The honest answer involves identifying the first bottleneck and addressing it specifically. "The first thing that would break is the database primary write node. I'd add read replicas for redirect lookups first, then evaluate whether Redis cluster mode is needed as cache traffic grows. The redirect servers are already stateless, so they auto-scale horizontally."

**"Why not just use a monolith for this?"**

This is a great question. For early-stage URL shorteners, a well-structured monolith is probably the right answer. The separation of redirect servers from shortening servers makes sense because they have dramatically different scaling characteristics, not because microservices are inherently better. See my post on [modular monolith vs microservices](/blog/modular-monolith-vs-microservices) for when that trade-off is worth it.

**"How would you monitor this in production?"**

Redirect QPS, p99 latency per endpoint, cache hit ratio, queue consumer lag (for analytics), error rate broken out by short code (to spot hot problematic links), and an alert when the ID generator service is unhealthy.

---

### The Mental Model

The four-step framework is not just interview prep. It is the actual thought process of experienced architects.

When a product team says "build us a notification system," a senior engineer's internal response is not a tech stack. It is a series of questions: What exactly must this system do? What scale does it need to handle? What happens if a notification is delayed? What if a notification is delivered twice? What must be delivered exactly once? Those questions — requirements, scale, failure modes — drive every architecture decision.

The four-step framework makes that implicit process explicit and structured. Master it and system design questions become much less about memorizing architectures and much more about demonstrating how you think.

---

## Trade-offs Covered
- Functional requirements vs non-functional requirements
- Strong consistency vs eventual consistency in detailed design
- Hashing vs counter-based short code generation
- Monolith vs separated services based on scaling characteristics
- Synchronous vs asynchronous analytics processing
- Perfect precision vs directional correctness in capacity estimation

## Key Concepts
- **Functional requirement**: A specific, testable statement of what the system must do
- **Non-functional requirement**: A measurable statement of how well the system must perform
- **Capacity estimation**: Back-of-envelope math to understand scale before designing
- **Stateless service**: A service that stores no user-specific state locally, enabling horizontal scaling
- **Hot path**: The most frequently executed code path, which must be optimized most aggressively
- **Circuit breaker**: A pattern (Polly in .NET) that prevents cascade failures by stopping calls to failing dependencies
- **Base62 encoding**: Encoding using 62 characters (0-9, A-Z, a-z) to produce compact URL-safe identifiers

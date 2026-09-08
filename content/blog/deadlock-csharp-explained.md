---
title: "Deadlock in C# and Operating Systems (Avoidance Explained)"
description: "Deadlock definition, deadlock in operating system terms, deadlock avoidance in OS and C# — lock ordering, async deadlocks, and SQL Server reader/writer deadlocks on ASP.NET Core."
date: "2026-09-08"
updated: "2026-09-08"
category: "async-concurrency"
tags: ["Deadlock", "Threading", "Concurrency", "C#", ".NET", "ASP.NET Core", "SQL Server"]
related:
  - csharp-lock-statement-monitor-mutex
  - csharp-threadpool-starvation-sync-over-async
  - sql-server-deadlocks-snapshot-isolation
  - csharp-async-await-interview-questions
faq:
  - q: "What is a deadlock?"
    a: "A deadlock is when two or more threads (or transactions) each hold a resource the other needs, and all wait forever. In C#: thread A holds lock 1 and waits for lock 2 while thread B holds lock 2 and waits for lock 1. In SQL: session A locked row 1 and waits on row 2 while session B did the opposite."
  - q: "What is deadlock in operating system?"
    a: "In OS terms, deadlock requires four conditions (Coffman): mutual exclusion, hold and wait, no preemption, and circular wait. The OS scheduler cannot make progress until one victim is aborted. Databases and .NET apps hit the same circular-wait shape with locks instead of only CPU threads."
  - q: "What is deadlock avoidance in OS?"
    a: "Prevention strategies: impose lock ordering (always acquire A before B), use timeouts (Monitor.TryEnter), avoid nested locks, use lock-free structures (Interlocked), or break cycles with banker's-algorithm-style resource ordering. In apps: design APIs async end-to-end instead of blocking on Tasks."
  - q: "What is the difference between deadlock and thread pool starvation?"
    a: "Deadlock is circular wait — nobody can proceed. Starvation on ASP.NET Core is workers blocked on .Result while async continuations need workers — queue grows, looks like a hang, but it is not a classic lock cycle. Different fix: await instead of block."
---

Search **deadlock**, **deadlock in operating system**, or **deadlock avoidance in os** and you get OS textbook diagrams — then you sit in a .NET interview or on-call with a hung API. This page connects **deadlock theory** to **C#, ASP.NET Core, and SQL Server** so the definitions map to real fixes.

Related: [lock statement](/blog/csharp-lock-statement-monitor-mutex), [SQL Server deadlocks](/blog/sql-server-deadlocks-snapshot-isolation), [thread pool starvation](/blog/csharp-threadpool-starvation-sync-over-async) (not the same problem).

## Deadlock definition

**Definition:** A **deadlock** is a state where two or more execution contexts are **blocked forever**, each waiting for a resource held by another in the set. No forward progress without external intervention (timeout, kill, victim selection).

```text
Thread A                    Thread B
  holds Lock-1                holds Lock-2
  wants Lock-2                wants Lock-1
       │                           │
       └──────── circular wait ────┘
                  DEADLOCK
```

## Deadlock in operating system (four conditions)

Textbooks cite **Coffman's conditions** — all four must hold for a deadlock:

| Condition | Meaning | Example |
|---|---|---|
| **Mutual exclusion** | Resource used by one at a time | `lock` on a counter |
| **Hold and wait** | Hold one resource, wait for another | Hold lock A, request lock B |
| **No preemption** | OS cannot forcibly take a held lock | `lock` held until `}` |
| **Circular wait** | Cycle in the wait graph | A→B→A |

**Deadlock in operating system** scheduling: the kernel sees runnable threads blocked on locks held by each other. Without a victim policy, the system stalls.

Application code on .NET runs **on** the OS — same graph, different primitives (`lock`, `Monitor`, `Mutex`, SQL row locks).

## Deadlock avoidance in OS (and how apps apply it)

**Deadlock avoidance** means **breaking one of the four conditions** before the cycle forms:

### 1. Lock ordering (break circular wait)

Always acquire locks in a **global order**:

```csharp
// Good — both threads acquire left then right
lock (_left) { lock (_right) { /* work */ } }

// Bad — Thread1: left→right, Thread2: right→left → deadlock possible
```

### 2. Timeouts (try, don't wait forever)

```csharp
if (Monitor.TryEnter(_gate, TimeSpan.FromSeconds(2)))
{
    try { /* work */ }
    finally { Monitor.Exit(_gate); }
}
else
{
    // log, fail fast, or retry policy — do not wait forever
}
```

`SemaphoreSlim.WaitAsync` with timeout is the async-friendly variant — [SemaphoreSlim](/blog/csharp-semaphore-slim-async-lock).

### 3. Avoid hold-and-wait

Do not hold `lock` while calling code that might acquire another lock or **await**. **`await` inside `lock` is illegal in C#** (CS1996) because it can deadlock the sync context or corrupt lock state.

Use `SemaphoreSlim.WaitAsync` for async gates.

### 4. Lock-free where possible

[Interlocked](/blog/csharp-interlocked-compareexchange) for single counters and flags — no lock graph.

### 5. Banker's algorithm (OS theory)

The **banker's algorithm** avoids deadlock by simulating allocation before granting — rarely implemented in app code, but the lesson stands: **know maximum resource needs before granting locks**. In APIs: cap concurrent outbound calls with `SemaphoreSlim` instead of unbounded `lock` chains.

## Deadlock in C# — classic example

```csharp
object a = new(), b = new();

var t1 = new Thread(() =>
{
    lock (a) { Thread.Sleep(10); lock (b) { } }
});
var t2 = new Thread(() =>
{
    lock (b) { Thread.Sleep(10); lock (a) { } }
});
t1.Start(); t2.Start();
// Both can wait forever
```

**Fix:** single lock order, or one lock, or `ConcurrentDictionary` / message passing via [Channel](/blog/csharp-channel-producer-consumer).

## Async deadlock vs thread pool starvation

Not every hang is an OS-style deadlock.

| Symptom | Likely cause | Typical environment |
|---|---|---|
| UI frozen, `.Result` on async | **Sync-context deadlock** | WPF, WinForms, old ASP.NET |
| API 504s, idle CPU, `.Result` | **Thread pool starvation** | ASP.NET Core |
| SQL error 1205 victim | **Reader/writer deadlock** | SQL Server |
| `await` inside `lock` | Compiler error or rare hang | C# |

ASP.NET Core has **no request `SynchronizationContext`**. `.Result` causes **starvation**, not the classic UI deadlock — [interview answer](/blog/csharp-async-await-interview-questions).

## Deadlock in SQL Server (operating system for data)

Database transactions are another lock graph:

```text
Session A: shared lock on report scan
Session B: exclusive lock on checkout UPDATE
           → deadlock victim (error 1205)
```

**Avoidance:**

- **RCSI** — readers use row versions instead of blocking writers ([SQL Server deadlocks guide](/blog/sql-server-deadlocks-snapshot-isolation))
- **Short transactions** — do not hold locks while calling HTTP
- **Same access order** — update child rows in consistent key order
- **RowVersion** for writer/writer on same row — [optimistic concurrency](/blog/ef-core-optimistic-concurrency-token)

## Deadlock prevention checklist (.NET API)

```text
□ One global lock order for nested locks
□ No .Result / .Wait() on request paths
□ No await inside lock — use SemaphoreSlim.WaitAsync
□ SQL transactions short; RCSI for reader/writer
□ Timeouts on TryEnter / WaitAsync where appropriate
□ Prefer Channels over lock chains for producer/consumer
```

## If an interviewer asks

**"Explain deadlock in operating system."**  
Four Coffman conditions; circular wait in the resource graph; avoidance by ordering, timeouts, or breaking hold-and-wait.

**"Deadlock avoidance in OS — name strategies."**  
Lock ordering, try-lock with timeout, pre-allocation (banker's algorithm in theory), and eliminating unnecessary mutual exclusion.

**"Deadlock vs livelock vs starvation?"**  
**Deadlock** — no progress, circular wait. **Livelock** — threads keep changing state but make no progress (polite retry storms). **Starvation** — one thread never gets the CPU or pool worker (`.Result` on Core).

**"How do you debug a deadlock in production?"**  
Parallel Stacks / dump for managed locks; SQL deadlock graph XML for 1205; check for `.Result` and lock order inversions in code review.

Hub: [async & threading](/learning/async-concurrency).

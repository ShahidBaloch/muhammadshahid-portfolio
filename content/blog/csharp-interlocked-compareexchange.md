---
title: "C# Interlocked CompareExchange: Lock-Free Counters"
description: "Interlocked updates one variable in an uninterruptible CPU step so two threads cannot both read 5 and both write 6. Use Increment for counters; CompareExchange (CAS) for flags; a lock when two fields must change together."
date: "2026-09-07"
updated: "2026-09-07"
category: "async-concurrency"
tags: ["C#", ".NET", "Threading", "Concurrency", "Asynchronous Programming"]
related:
  - csharp-lock-statement-monitor-mutex
  - csharp-concurrentdictionary-lock
  - csharp-threadpool-starvation-sync-over-async
faq:
  - q: "When should I use Interlocked.CompareExchange instead of lock?"
    a: "For a single integer, flag, or reference swap. Increment, Add, and CompareExchange are atomic without a Monitor. As soon as two fields must change together, take a lock."
  - q: "Is volatile enough for a counter?"
    a: "No. volatile affects visibility. i++ on a volatile int is still a read-modify-write race: two threads can both read 5 and both write 6. Use Interlocked.Increment."
  - q: "What is a CAS loop?"
    a: "Compare-and-swap: read the current value, compute the next, CompareExchange, retry if another thread won. Prefer Interlocked.Add when it fits. Do not spin a CAS loop on the ASP.NET request path to avoid learning lock."
---

**`Interlocked`** is a .NET class whose static methods update **one variable in one uninterruptible step** (atomic), so two threads cannot corrupt it mid-update. **Compare-and-swap (CAS)** means “write this new value only if the location still holds the value I just read.”

```text
Race on i++ (not atomic)

  Thread A: read 5 ── add 1 ── write 6
  Thread B: read 5 ── add 1 ── write 6
  Lost an increment. Both thought they won.
```

**New to this** → stay here. **Merging a PR** → [wrong vs right](#wrong-vs-right). **On-call / interview** → [CAS loop](#cas-loop-only-when-add-is-not-enough) · [if an interviewer asks](#if-an-interviewer-asks).

**Terms used here:** **Atomic** = one uninterruptible CPU step. **CAS / compare-and-swap** = write only if the location still holds the value you read. **`volatile`** = a visibility hint, not a counter.

If you are new to threading, start with [lock](/blog/csharp-lock-statement-monitor-mutex). Default for two fields: `lock`. Default for one counter: `Interlocked.Increment`.

## Smallest example

```csharp
Interlocked.Increment(ref _inFlight);
Interlocked.Decrement(ref _inFlight);
Interlocked.Add(ref _bytes, length);
```

```csharp
if (Interlocked.CompareExchange(ref _started, 1, 0) == 0)
{
    // we won — start the hosted loop once
}
```

`CompareExchange` stores `to` only if the location still equals `comparand`. It **returns the original value**.

## Wrong vs right

I would reject `i++` on a shared counter and a CAS loop on the request path “so we don’t need lock.”

```csharp
// Wrong
lock (_gate) { _count++; } // fine, but coarse on every request

volatile int _flag;
_flag++; // still a race — volatile is not a counter

// Right for one integer
Interlocked.Increment(ref _count);
```

A metrics helper under a load test showed the lock next to real work. Replacing the increment with `Interlocked.Increment` dropped contention. The **dashboard object** (count **and** last-timestamp) still needed a lock.

_Comparison: volatile versus Interlocked versus lock._

| Tool | Prevents torn increment | Publishes value to other cores | Multi-field atomicity |
|---|---|---|---|
| Nothing | No | No | No |
| `volatile` | No | Helps visibility | No |
| `Interlocked.*` | **Yes** (that location) | **Yes** | No |
| `lock` / `Monitor` | Yes (inside the section) | Yes | **Yes** |

I almost never put `volatile` on new code; `Volatile.Read` / `Write` or `Interlocked` are harder to misuse.

## CAS loop (only when Add is not enough)

```csharp
int snapshot;
int computed;
do
{
    snapshot = Volatile.Read(ref _max);
    computed = Math.Max(snapshot, candidate);
} while (Interlocked.CompareExchange(ref _max, computed, snapshot) != snapshot);
```

If another thread changed `_max`, you retry. That is **lock-free**: some thread makes progress. It is not wait-free. A hot CAS loop can burn CPU. Do not invent a lock-free queue — use `Channel` / `ConcurrentQueue`.

`CompareExchange` on `double` exists on modern .NET; on older runtimes check your **.NET version** for the overload.

## Memory model, short

Skip this unless you are writing publication protocols. The CLR does not promise a plain `int` write is visible immediately to another core. `lock`, `Interlocked`, and `Volatile` insert **barriers**. You do not need to recite MESI in an ASP.NET interview.

## Flags and state machines

```csharp
const int Idle = 0, Running = 1, Stopping = 2;

public bool TryStart() =>
    Interlocked.CompareExchange(ref _state, Running, Idle) == Idle;
```

Good for a hosted service gate. Bad for “transfer money”: debit and credit are two locations. That is a lock (or a database).

## Common mistakes

- `Interlocked` on a field, then unsynchronized read of a second field
- Using CAS to avoid learning `lock` and then spinning on the request path (CPU **high** this time)
- `lazyInit` with a bool instead of `Lazy<T>`

## What this is not

Multi-field coordination: [lock vs Monitor](/blog/csharp-lock-statement-monitor-mutex). Maps: [ConcurrentDictionary](/blog/csharp-concurrentdictionary-lock). Topic map: [async & threading hub](/learning/async-concurrency).

## If an interviewer asks

Lock-free / CAS; race on `i++`; volatile; thread-safe singleton (atomic flag vs `Lazy<T>`).

**Strong answer:** one word, Interlocked; two fields, lock; don’t write a lock-free list.

. If you are inventing a lock-free ring buffer in an API, we should talk before that ships.

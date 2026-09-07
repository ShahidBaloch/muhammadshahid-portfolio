---
title: "C# lock vs Monitor vs Mutex vs Semaphore"
description: "lock protects a short in-memory critical section so two threads cannot corrupt shared data. lock is Monitor.Enter/Exit. You cannot await inside. Mutex is cross-process; async code uses SemaphoreSlim."
date: "2026-09-07"
updated: "2026-09-07"
category: "async-concurrency"
tags: ["C#", ".NET", "Threading", "Concurrency", "Asynchronous Programming"]
related:
  - csharp-semaphore-slim-async-lock
  - csharp-interlocked-compareexchange
  - csharp-concurrentdictionary-lock
faq:
  - q: "What is the difference between lock and Monitor in C#?"
    a: "lock is compiler sugar for Monitor.Enter / Exit in a try/finally. Same in-process mutex, same thread affinity. Use lock unless you need TryEnter with a timeout. The same thread must release."
  - q: "Why is lock(this) bad?"
    a: "Any caller can lock on your public instance and deadlock you from the outside. lock(typeof(MyType)) is worse. Lock a private readonly object that only your type owns."
  - q: "lock vs Mutex vs Semaphore?"
    a: "lock / Monitor: in-process, same thread must Exit. Mutex: can be named and work across processes. Semaphore: counting permits. SemaphoreSlim is the in-process, async-friendly one (WaitAsync). Do not await inside lock."
  - q: "Can I await inside a lock in C#?"
    a: "No. lock is thread-affine. After await you may resume on another ThreadPool worker, so Monitor.Exit fails. Use SemaphoreSlim.WaitAsync."
---

A **race condition** is two threads read-modify-write the same data and the result is wrong (`count++` can lose updates). A **critical section** is a few lines only one thread should run at a time. **`lock`** is the in-process tool for that. The compiler emits `Monitor.Enter` / `Exit`. The **same thread** must release — so you cannot `await` inside.

**Terms used here:** **Race** = lost update because two threads both read-then-write. **Critical section** = the few lines only one thread should run. **Thread-affine** = the same OS thread must `Exit` that entered. **Monitor** = the CLR type `lock` compiles to.

**Do you need `lock` in an ASP.NET controller?** Usually no. The database, EF, and concurrent collections cover most request data. Use `lock` for short in-memory shared state (a singleton counter, a small in-process window). Use [SemaphoreSlim](/blog/csharp-semaphore-slim-async-lock) if you must `await`.

**New to this** → stay here. **Merging a PR** → [wrong vs right](#wrong-vs-right). **On-call / interview** → [primitives table](#mutex-vs-semaphore-vs-readerwriter) · [if an interviewer asks](#if-an-interviewer-asks).

```text
Lock-order deadlock

  Thread 1: lock(A) ────────── wait for B
  Thread 2:              lock(B) ── wait for A
  Neither runs. CPU idle. SQL idle.
```

## Smallest example

```csharp
private readonly object _gate = new();
private int _count;

lock (_gate)
{
    _count++; // critical section — one thread at a time
}
```

Without the lock, two threads can both read 5 and both write 6. For a single counter, [Interlocked.Increment](/blog/csharp-interlocked-compareexchange) is enough. For two fields together, keep the `lock`.

`Monitor.TryEnter(_gate, TimeSpan.FromSeconds(1))` is the timeout form when you must fail instead of hang.

## Wrong vs right

I would reject `lock(this)`, `lock` around `SaveChanges`/`HttpClient`, and `await` inside `lock`.

```csharp
lock (this) { }           // callers can lock(yourObject)
lock (typeof(Helper)) { } // public type object
lock ("fees") { }         // interned string — global accidental sharing
lock (_db) { }            // EF context is not your gate
```

```csharp
private readonly object _gate = new(); // yes
```

Lock **order**: always A then B. Document it.

- **Deadlock:** nobody runs (two threads each hold what the other needs).
- **Livelock:** threads keep retrying without progressing.
- **Starvation:** the pool cannot run continuations ([.Result](/blog/csharp-threadpool-starvation-sync-over-async)) — different dump.

## Mutex vs Semaphore vs ReaderWriter

_Comparison: lock versus Mutex versus Semaphore versus ReaderWriterLockSlim._

| Primitive | Process | Counting | Await? | Use |
|---|---|---|---|---|
| `lock` / `Monitor` | In-process | 0/1 | No | Short in-memory sections |
| `Mutex` | Named → **cross-process** | 0/1 | No | Single instance of a worker exe |
| `Semaphore` | Can be named | N | No (sync Wait) | Rare in ASP.NET |
| `SemaphoreSlim` | In-process | N | **WaitAsync** | Async gates, bulkheads |
| `ReaderWriterLockSlim` | In-process | readers/writer | No | Rare; easy to hold too long |

Named `Mutex` for “only one Windows service instance” is valid. For web farms, a named mutex on one VM does not coordinate the farm — use SQL, Redis, or a queue.

If you are new, use **`lock`** for short sync sections and **`SemaphoreSlim`** when you `await`. Treat Mutex / ReaderWriter as reference.

## Thread-safe singleton

```csharp
public sealed class LicenseCatalog
{
    private static readonly Lazy<LicenseCatalog> _instance = new(() => new LicenseCatalog());
    public static LicenseCatalog Instance => _instance.Value;
    private LicenseCatalog() { }
}
```

`Lazy<T>` is enough. Double-check locking is how interviews go wrong. DI already gives you `AddSingleton`. A singleton that holds mutable dictionaries still needs [ConcurrentDictionary](/blog/csharp-concurrentdictionary-lock) or a lock **inside**.

**Synchronization** is the mechanism (`lock`). **Thread safety** is the guarantee your type documents. `List<T>` is not thread-safe. Returning the inner list after a locked `Add` is not.

## SQL lock escalation (not this keyword)

Interview banks mix **database** locks with `lock`. If the dump shows `Monitor` and SQL is idle, stay on this page. If SQL shows deadlock graphs, go to the [deadlock article](/blog/sql-server-deadlocks-snapshot-isolation).

## Common mistakes

- Private lock object that isn’t `readonly`
- Taking locks in finalizers
- `Monitor.Pulse` puzzles in production code — use `Channel` or `SemaphoreSlim`

## What this is not

Async critical sections: [SemaphoreSlim WaitAsync](/blog/csharp-semaphore-slim-async-lock). One-shot flags: [Interlocked](/blog/csharp-interlocked-compareexchange). Topic map: [async & threading hub](/learning/async-concurrency).

## If an interviewer asks

lock vs Monitor; lock(this); Mutex/Semaphore; thread-safe singleton; race vs deadlock vs livelock.

**Strong answer:** private gate, no await, order locks, SQL deadlocks are a different dump.

If two publishes hang with idle SQL, [contact me](/contact). Bring Parallel Stacks.

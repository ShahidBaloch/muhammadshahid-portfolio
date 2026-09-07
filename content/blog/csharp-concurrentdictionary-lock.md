---
title: "C# ConcurrentDictionary vs lock: GetOrAdd Can Run Twice"
description: "ConcurrentDictionary is a thread-safe map, not a cache policy. GetOrAdd’s factory can run twice, keys must include tenant id, and a lock is still right when you mutate a value in place."
date: "2026-09-07"
updated: "2026-09-07"
category: "async-concurrency"
tags: ["C#", ".NET", "Asynchronous Programming", "Threading", "Concurrency"]
related:
  - csharp-lock-statement-monitor-mutex
  - csharp-interlocked-compareexchange
  - csharp-asynclocal-vs-threadlocal
faq:
  - q: "Does ConcurrentDictionary.GetOrAdd run the factory only once?"
    a: "No. The factory runs outside the internal lock so your delegate cannot deadlock the map. Two threads can both miss, both run the factory, and only one value is stored. The loser is discarded. Do not put side effects in the factory."
  - q: "When do I still need lock with ConcurrentDictionary?"
    a: "When you mutate a value in place (List.Add on a shared Report), coordinate two keys, or must run an expensive factory exactly once. Dictionary methods are thread-safe; your TValue and your factory are not."
  - q: "Is ConcurrentDictionary a cache?"
    a: "It is a thread-safe map. It has no TTL, no size bound, and no stampede control unless you add them. For tenant fee schedules I usually want IMemoryCache plus a versioned key."
  - q: "When should I use FrozenDictionary instead of ConcurrentDictionary?"
    a: "When the map is built at startup and only swapped as a whole. ToFrozenDictionary is a faster reader, not a concurrent writer."
---

A `Dictionary<TKey,TValue>` is not safe for two threads at once. **`ConcurrentDictionary`** lets many threads read and write the map without your own `lock`. **Thread-safe** means the *map operations* will not corrupt the buckets. It does **not** run your factory once, expire old values, or put tenant id in the key.

**Multi-tenancy** means many customers share one app; each must only see their data. Thread-safe is not tenant-safe.

**New to this** → stay here. **Merging a PR** → [wrong vs right](#wrong-vs-right). **On-call / interview** → [GetOrAdd twice](#getoradd-the-factory-is-not-atomic) · [tenant keys](#tenant-keys-and-unbounded-growth) · [if an interviewer asks](#if-an-interviewer-asks).

**Terms used here:** **Factory** = the lambda `GetOrAdd` calls to create a missing value. **Stampede** = many threads miss the same key at once. **Single-flight** = only one expensive load runs; others wait for that result. **`IMemoryCache`** = cache with size and TTL; use it when you need expiration.

## Smallest example

```csharp
var map = new ConcurrentDictionary<string, int>();
map.TryAdd("a", 1);
map.TryGetValue("a", out var n);
```

You do not wrap `TryGetValue` in your own `lock` “to be safe.”

## GetOrAdd: the factory is not atomic

Microsoft’s docs: the `valueFactory` runs **outside** the dictionary lock so unknown code cannot block every writer.

```text
Thread A: miss → OpenConnection(id) ──────────────────► discard (leaked socket)
Thread B: miss → OpenConnection(id) → wins insert
```

```csharp
var map = new ConcurrentDictionary<string, SqlConnection>();

var connection = map.GetOrAdd(tenantId, id =>
{
    // Can run twice for the same id under a stampede
    return OpenConnection(id);
});
```

**Do not** put side effects, logging “initialized,” or `HttpClient.Send` in that factory.

### Single-flight with Lazy

```csharp
var map = new ConcurrentDictionary<string, Lazy<FeeSchedule>>();

FeeSchedule GetSchedule(string tenantId) =>
    map.GetOrAdd(
            tenantId,
            id => new Lazy<FeeSchedule>(() => LoadFromSql(id)))
        .Value;
```

You may still allocate extra `Lazy<T>` objects. Only one `LoadFromSql` runs per key with default `LazyThreadSafetyMode.ExecutionAndPublication`. `.Value` blocks other threads until the winner finishes.

**Advanced:** `Lazy<Task<T>>` — a faulted task stays cached until you remove the key. Do not capture a request `CancellationToken` into the factory (first caller cancels → everyone shares the canceled task).

## Wrong vs right

I would reject a key of `"fees"` in a multi-tenant app and `List.Add` on a value stored in the map.

```csharp
// Wrong — last clinic wins
map.GetOrAdd("fees", _ => Load(clinicId));

// Right
map.GetOrAdd($"{clinicId}:{version}", _ => Load(clinicId, version));
```

```csharp
var report = map.GetOrAdd(key, _ => new Report());
report.Lines.Add(line); // List<T> is not thread-safe
```

## AddOrUpdate vs GetOrAdd

_Comparison: GetOrAdd versus AddOrUpdate versus TryAdd._

| Method | Use when |
|---|---|
| `GetOrAdd` | Read-through: return existing or insert |
| `AddOrUpdate` | Insert or replace using an update delegate |
| `TryAdd` / `TryUpdate` / `TryRemove` | You need to branch on success |

`AddOrUpdate`’s delegates can also run more than once. Treat them as **pure**. For a hot counter, [Interlocked](/blog/csharp-interlocked-compareexchange) is cheaper.

## Tenant keys and unbounded growth

A key of `"fees"` is thread-safe and still a **cross-tenant leak**. Include tenant id (and a version) in the key. Thread-safe is not tenant-safe.

A singleton dictionary **grows until the process dies**. `IMemoryCache` with size limits is the product cache. `ConcurrentDictionary` is for coordination: single-flight, idempotency keys, “is this message in flight.”

## FrozenDictionary for read-mostly maps

A fee schedule loaded at startup and never mutated is not a `ConcurrentDictionary` problem. `using System.Collections.Frozen;` then `ToFrozenDictionary` — faster reader, not a concurrent writer. If ops publish a new schedule, build a new frozen map and swap the field.

## Common mistakes

- Factory that hits SQL with a request-scoped `DbContext` captured into a singleton map
- Caching `HttpContext` or [AsyncLocal](/blog/csharp-asynclocal-vs-threadlocal) user into a static dictionary
- Using `Count` in a hot loop

## What this is not

Broader primitives: [lock vs Monitor](/blog/csharp-lock-statement-monitor-mutex). Staff-loop cache questions: [expert C# interviews](/blog/csharp-expert-interview-questions).

## If an interviewer asks

Thread-safe collections; why Singleton services must be thread-safe; GetOrAdd running twice.

**Strong answer:** “Thread-safe structure, not a cache policy. Factory can run twice. Keys include tenant.”

If a multi-tenant cache is leaking clinic data or growing without bound, [contact me](/contact). Bring the key shape and the DI lifetime of the dictionary.

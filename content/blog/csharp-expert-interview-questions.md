---
title: "C# Expert-Level Interview Questions"
description: "C# expert level interview questions with production answers — IAsyncEnumerable exports, cancellation across MediatR, ConcurrentDictionary caches, Span parsers, and bounded Channels."
date: "2026-09-04"
updated: "2026-09-07"
category: "interview-questions"
tags: ["Interview Questions", "C#", ".NET", "ASP.NET Core", "Career"]
related:
  - csharp-iasyncenumerable-yield-return
  - csharp-channel-producer-consumer
  - csharp-concurrentdictionary-lock
faq:
  - q: "What C# expert-level interview questions get asked?"
    a: "Staff-level interviews ask IAsyncEnumerable exports that do not load 200k rows, cancellation through MediatR all the way to SQL, ConcurrentDictionary keys that include tenant id, Span parsers that do not allocate per claim, and bounded Channels instead of Task.Run per checkout. They do not ask what a delegate is. The expected answer names the production dump, not the textbook definition."
  - q: "Is ConcurrentDictionary enough for a multi-tenant cache?"
    a: "It is thread-safe, not tenant-safe. A key of \"fees\" lets clinic B read clinic A’s last writer. Include tenant id (and a version) in the key. GetOrAdd can still run the factory twice. For a product cache you usually want IMemoryCache with size and TTL, not an unbounded dictionary."
  - q: "Where do async await questions belong?"
    a: "Starvation, async void, WhenAll plus one DbContext, and ConfigureAwait live on the C# async await interview questions page. This page is the layer above that: streams, channels, tenant maps, and cancellation graphs."
---

**Staff / 6–10 year loop.** If you have under a year with async, start with [async await interview questions](/blog/csharp-async-await-interview-questions) and the [async & threading hub](/learning/async-concurrency) tracks. This page names the dump first; the how-tos teach the merge.

**C# expert-level interview questions** are not “what is a delegate.” Senior and staff loops ask whether you can keep an ASP.NET Core API correct under load: cancellation that actually reaches SQL, allocations in a hot parser, and caches that do not leak tenant data.

Framework storytelling lives in [ASP.NET Core interview scenarios](/blog/aspnet-core-interview-questions-scenarios). Implementation: [IAsyncEnumerable](/blog/csharp-iasyncenumerable-yield-return), [Channel producer-consumer](/blog/csharp-channel-producer-consumer), [ConcurrentDictionary](/blog/csharp-concurrentdictionary-lock).

---

## Scenario 1: Export endpoint that materializes 200k rows

**Prompt:** `GET /api/claims/export` does `await _db.Claims.ToListAsync()` then maps to CSV. Memory climbs, the App Service restarts, and Angular times out. What do you change, and what do you refuse to change?

### Weak answer

“Add pagination” with no product path, or “use `AsNoTracking`” as if tracking were the only leak.

### Strong answer

`ToListAsync` **owns the whole result** — every row is in RAM before the first CSV line. On a claims export that is a denial-of-service against yourself.

1. Stream with **`IAsyncEnumerable`** (or a bounded batch) so you never hold 200k entities.
2. Project in SQL (`Select` to a DTO / anonymous type). Do not hydrate full `Claim` graphs.
3. `AsNoTracking()` is required, not sufficient.
4. Cancellation must flow: if Angular aborts, EF should stop fetching.

```csharp
public async IAsyncEnumerable<ClaimExportRow> StreamAsync(
    [EnumeratorCancellation] CancellationToken cancellationToken)
{
    await foreach (var row in _db.Claims
        .AsNoTracking()
        .Select(c => new ClaimExportRow(c.Id, c.Status, c.Amount))
        .AsAsyncEnumerable()
        .WithCancellation(cancellationToken))
    {
        yield return row;
    }
}
```

The HTTP layer must write incrementally (`IAsyncEnumerable` + `PipeWriter`, or batched `WriteAsync`). Returning `List<ClaimExportRow>` in JSON undoes the work.

**Refuse:** loading into memory “just this once” because finance wants one file. Give them a job + blob, or a true stream. Healthcare exports that OOM at 8am are a product incident.

---

## Scenario 2: Cancel on the SPA, SQL keeps running

**Prompt:** The user closes the Angular tab. Kestrel logs a cancel. SQL Server still shows the report query for 40 seconds. Why, and how do you prove the fix?

### Weak answer

“CancellationToken is automatic in ASP.NET Core.”

### Strong answer

`HttpContext.RequestAborted` is only useful if you **pass it**. Expert interviewers listen for the seams where teams drop it:

- MediatR / Wolverine handlers that take no token
- EF calls without the token on `ToListAsync`, `SaveChangesAsync`, `ExecuteUpdateAsync`
- `IHttpClientFactory` outbound calls with the default timeout and no linked token
- Fire-and-forget `Task.Run` that captured the request token **or** captured none

```csharp
public async Task<ReportDto> Handle(BuildReport query, CancellationToken cancellationToken)
{
    return await _db.Encounters
        .AsNoTracking()
        .Where(e => e.ClinicId == query.ClinicId)
        .Take(500)
        .Select(e => new ReportDto(e.Id, e.Status))
        .ToListAsync(cancellationToken);
}
```

Do not wrap that in `ContinueWith(t => t.Result)` — that is a common mistake that reintroduces `.Result` on the continuation. Just `await ...ToListAsync(cancellationToken)`.

**Proof:** SQL session with the request id in the application name, cancel from Angular, watch the session die. If it does not, a layer ate the token. The [async interview set](/blog/csharp-async-await-interview-questions) covers `.Result` and `async void`. This scenario is only **where the token disappeared in the handler graph**.

---

## Scenario 3: `ConcurrentDictionary` as a tenant cache

**Prompt:** You replaced a `lock` with `ConcurrentDictionary<string, Report>`. Isolation bugs stopped. Then a clinic’s numbers stay stale for hours after a fee-schedule publish. What did you miss?

### Weak answer

“ConcurrentDictionary is always safe.”

### Strong answer

Thread-safe **structure** is not a **cache policy**.

- Keys must include tenant + version / published-at, not `"fees"`.
- `GetOrAdd` factory can run **twice**. The factory must be cheap and side-effect free.
- There is no TTL. You need eviction, size bounds, or `IMemoryCache` with expiration.
- A singleton dictionary **will** grow until the process dies unless you bound it.

On healthcare fee schedules I use `IMemoryCache` with a tenant key and a version stamp written when ops publish. `ConcurrentDictionary` is for coordination (single-flight, idempotency keys), not “the product cache.”

```csharp
// Wrong — last clinic wins
map.GetOrAdd("fees", _ => Load(clinicId));

// Right
map.GetOrAdd($"{clinicId}:{version}", _ => Load(clinicId, version));
```

---

## Scenario 4: EDI / CSV parser allocating itself to death

**Prompt:** An X12 or CSV intake job is CPU-light but gen-0 GC is 40% of the CPU. What do you look at in C# before buying a bigger App Service plan?

### Weak answer

“Use a faster serializer” with no allocation story.

### Strong answer

Hot parsers die on **`string` slices**. `Substring` copies a new string. `ReadOnlySpan<char>` is a **view** over existing memory — no copy. `Split(',')` allocates arrays.

Expert answer names **`ReadOnlySpan<char>` / `ReadOnlyMemory<char>`** for scanning, and rented buffers (`ArrayPool<byte>`) for the read loop. Keep strings only at the boundary where you persist a field.

I have seen this on [EDI intake](/blog/edi-x12-parser-csharp-dotnet): the envelope scanner can be span-based; the mapped claim row still becomes a DTO. Do not span the whole pipeline if you cannot — span the scan.

```csharp
static bool TrySegmentId(ReadOnlySpan<char> line, out ReadOnlySpan<char> id)
{
    var star = line.IndexOf('*');
    if (star <= 0)
    {
        id = default;
        return false;
    }

    id = line[..star];
    return true;
}
```

**Interview closer:** measure with `dotnet-counters` / alloc profiles, not feelings. If the profiler says `string.Split`, you have your ticket.

---

## Scenario 5: Background work — `Channel` vs `Task.Run` per request

**Prompt:** Each order POST starts `Task.Run(() => NotifyAsync())`. Under a flash sale, thread pool starves and checkout 200s take 8 seconds. Redesign it.

### Weak answer

“Use Hangfire” as the first sentence with no in-process model.

### Strong answer

Per-request `Task.Run` **competes with Kestrel**. Expert design:

1. Accept the write in the request.
2. Publish to a **bounded `Channel<T>`** (or a real queue: Azure Queue, RabbitMQ).
3. A hosted service consumes with a fixed degree of parallelism.
4. Bound the channel. `FullMode = Wait` or drop-with-metric — never unbounded growth.

```csharp
var channel = Channel.CreateBounded<OrderNotify>(new BoundedChannelOptions(256)
{
    FullMode = BoundedChannelFullMode.Wait,
});

public sealed class OrderNotifyWorker(OrderNotifyChannel channel, IServiceScopeFactory scopes)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var msg in channel.Reader.ReadAllAsync(stoppingToken))
        {
            await using var scope = scopes.CreateAsyncScope();
            var mail = scope.ServiceProvider.GetRequiredService<IOrderMailer>();
            await mail.SendAsync(msg, stoppingToken);
        }
    }
}
```

If notify **must** happen for compliance, it is not `Task.Run`. It is a durable message. In-process channels are for shedding and smoothing, not legal delivery.

---

## Scenario 6: Linked timeout + request abort

**Prompt:** A report handler takes `CancellationToken cancellationToken` from MediatR. You also need a 8-second timeout so one clinic cannot hold a SQL worker. How do you combine them without cancelling the wrong work?

### Weak answer

`CancellationToken.None` on EF “so the query finishes,” or a static `CancellationTokenSource` on a singleton.

### Strong answer

Link **request abort** and **timeout**. Dispose the linked source.

```csharp
using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(8));
using var linked = CancellationTokenSource.CreateLinkedTokenSource(
    cancellationToken,
    timeout.Token);

await _db.Encounters
    .AsNoTracking()
    .Where(e => e.ClinicId == query.ClinicId)
    .Take(500)
    .ToListAsync(linked.Token);
```

If you only pass `timeout.Token`, the user closing the tab does not stop SQL. If you only pass the request token, a hung query lives until Kestrel’s own limits. A singleton `CancellationTokenSource` shared across requests is a cross-tenant cancel bug — the same class of leak as a singleton cache key without tenant id.

`ValueTask` vs `Task` is [async interview scenario 8](/blog/csharp-async-await-interview-questions) — I will not re-ask it here.

---

## Rapid-fire (expert, 30 seconds each)

| Prompt | Answer I want |
|---|---|
| `record` as a dictionary key | Value equality; mutating a class-style property after insert breaks the bucket |
| `lock` vs `SemaphoreSlim` | `lock` for short in-memory critical sections; `SemaphoreSlim` when you `await` inside |
| `CreateLinkedTokenSource` | Combine request abort + timeout; dispose the linked source |
| `IQueryable` returned from a repository | The query is not executed; callers can still `Include` the world. Be honest about that leak |
| Why `GetHashCode` on mutable entities is a bug | Dictionary/set membership depends on a stable hash |

---

## How this differs from the other interview posts

- **This page:** language + runtime decisions that show up as memory, cancel, and throughput bugs
- **[ASP.NET Core scenarios](/blog/aspnet-core-interview-questions-scenarios):** middleware, JWT vs Angular, cache isolation, architecture judgment
- **[Async await questions](/blog/csharp-async-await-interview-questions):** `.Result`, `async void`, `WhenAll`, `ValueTask`, `ConfigureAwait`
- **[EF Core interview questions](/blog/ef-core-interview-questions):** concurrency tokens, query filters, `SaveChanges` — not N+1 SQL

If a loop is titled “expert C#,” start here, then use the framework post for the API story. The full set lives on the [interview questions hub](/learning/interview-questions).

Preparing a senior / staff C# loop, or writing one for a hiring team?. Bring a production incident, not a trivia list.

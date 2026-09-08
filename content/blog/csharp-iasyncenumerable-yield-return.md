---
title: "C# IAsyncEnumerable: Stream SQL Rows with yield return"
description: "IAsyncEnumerable lets you process SQL rows one at a time instead of loading 100,000 entities into RAM. yield return, AsAsyncEnumerable, EnumeratorCancellation, and streaming HTTP."
date: "2026-09-07"
updated: "2026-09-07"
category: "async-concurrency"
tags: ["C#", ".NET", "Asynchronous Programming", "Concurrency", "EF Core", "ASP.NET Core"]
related:
  - csharp-async-await-aspnet-core
  - csharp-cancellationtoken-aspnet-core
  - csharp-channel-producer-consumer
faq:
  - q: "How do I stream SQL rows with C# IAsyncEnumerable and yield return?"
    a: "Project to a DTO in SQL, AsNoTracking, AsAsyncEnumerable, then await foreach and yield return. Pass EnumeratorCancellation so Angular abort stops the reader. Do not ToListAsync the whole set first."
  - q: "Is IAsyncEnumerable the same as Task of List?"
    a: "No. Task<List<T>> waits until every row is in memory, then returns. IAsyncEnumerable yields as the SqlDataReader advances. The HTTP response must write incrementally or you undid the win. A proxy that buffers the entire body will also hide the benefit."
  - q: "Can I JSON-serialize IAsyncEnumerable in ASP.NET Core?"
    a: "Yes on modern ASP.NET Core — the output formatter streams items. For CSV exports I write the response body myself. Cancellation must flow or SQL keeps fetching after the tab closes."
---

`IAsyncEnumerable<T>` is a sequence you pull with `await foreach`. Each item can arrive after an I/O wait. **`yield return`** pauses the method and hands one item to the caller; the next pull continues from that line. `Task<List<T>>` waits until **every** row is in memory. Use the stream for exports. Use a paged list for grids.

```text
ToListAsync (warehouse)              IAsyncEnumerable (conveyor)

  SQL ──► [row1..row200000 in RAM]     SQL ──► row ──► HTTP write
          then first CSV line                  then next row
          App Service OOMs                     RAM stays flat
```

**New to this** → stay here. **Merging a PR** → [wrong vs right](#wrong-vs-right). **On-call / interview** → [HTTP stream](#http-stream-or-you-lied) · [if an interviewer asks](#if-an-interviewer-asks).

**Terms used here:** **Streaming** = write/read one row (or chunk) at a time instead of a full `List<T>`. **`AsNoTracking()`** = EF does not keep entities in the change tracker (still not enough if you `ToListAsync` 200k rows). **`[EnumeratorCancellation]`** = tell the compiler to pass the caller’s cancel token into `GetAsyncEnumerator` when they `await foreach`.

## Smallest example (no EF)

```csharp
async IAsyncEnumerable<int> CountAsync([EnumeratorCancellation] CancellationToken ct)
{
    for (var i = 1; i <= 3; i++)
    {
        await Task.Delay(10, ct); // stand-in for I/O
        yield return i;
    }
}

await foreach (var n in CountAsync(ct))
    Console.WriteLine(n); // 1, then 2, then 3 — not all at once
```

`IQueryable` is not awaitable. You cannot `await db.Claims.Where(...)`. You await **execution**: `ToListAsync`, `FirstOrDefaultAsync`, or `AsAsyncEnumerable()`.

## Wrong vs right

I would reject an export that `ToListAsync`s “just this once” because finance wants one file.

```csharp
// Wrong — owns 100,000 rows before the first CSV line
var rows = await db.Claims.AsNoTracking().ToListAsync(ct);

// Right — yields as the data reader advances
await foreach (var row in StreamClaimsAsync(clinicId, ct))
{
    await writer.WriteLineAsync(row.ToCsv(), ct);
}
```

Do not `ToListAsync` then `return rows.ToAsyncEnumerable()` — you already paid RAM.

## The shape I merge

```csharp
public async IAsyncEnumerable<ClaimExportRow> StreamClaimsAsync(
    Guid clinicId,
    [EnumeratorCancellation] CancellationToken cancellationToken)
{
    await foreach (var row in db.Claims
        .AsNoTracking()
        .Where(c => c.ClinicId == clinicId)
        .OrderBy(c => c.Id)
        .Select(c => new ClaimExportRow(c.Id, c.Status, c.Amount, c.Dos))
        .AsAsyncEnumerable()
        .WithCancellation(cancellationToken))
    {
        yield return row;
    }
}
```

`[EnumeratorCancellation]` exists because `await foreach` passes a token into `GetAsyncEnumerator`, which is **not** automatically your method parameter. Without the attribute, Angular abort often does not stop the SQL reader.

Non-negotiables:

1. **Project in SQL** — `Select` a DTO; do not load full `Claim` graphs
2. **`AsNoTracking()`** — required, not sufficient
3. **`[EnumeratorCancellation]`** + `WithCancellation`
4. **One enumerator, one `DbContext`** — do not `WhenAll` two streams on the same context

If Angular only wanted a grid of 50 rows, **do not stream 100k**. Page it.

## HTTP: stream or you lied

Returning `List<ClaimExportRow>` from a controller after `await foreach` into a list **undoes** the work.

```csharp
app.MapGet("/api/claims/export", (
    Guid clinicId,
    ClaimExportService exports,
    CancellationToken ct) =>
    exports.StreamClaimsAsync(clinicId, ct));
```

CSV I write myself so I control headers and flushing:

```csharp
app.MapGet("/api/claims/export.csv", async (
    Guid clinicId,
    ClaimExportService exports,
    HttpResponse response,
    CancellationToken ct) =>
{
    response.ContentType = "text/csv; charset=utf-8";
    response.Headers.ContentDisposition = "attachment; filename=claims.csv";
    await response.StartAsync(ct);
    await foreach (var row in exports.StreamClaimsAsync(clinicId, ct))
    {
        await response.WriteAsync(row.ToCsvLine(), ct);
    }
});
```

## yield return and the state machine

`async IAsyncEnumerable` is a second compiler machine: each `yield return` is a pause, each `await` is a pause. Do not mix `yield return` with `ToList` “just to count.” If you need a count, `CountAsync` is a separate SQL.

## Edge cases

- **Buffering reverse proxies** — some gateways buffer the whole response. Test through the real path.
- **Newtonsoft vs System.Text.Json** — confirm your formatter streams.
- **DbContext lifetime** — the context must live for the enumerator. Do not dispose in a `using` that ends before the formatter reads the stream.
- For work that must survive recycle, stream to **blob** from a [Channel](/blog/csharp-channel-producer-consumer) worker, then return a URL.

## Common mistakes

- `IEnumerable` + `yield return` of `Task` — that is not an async stream
- Sharing one context across two `await foreach` in `WhenAll`
- Logging every row (you will allocate more than the entities you avoided)

## What this is not

Tokens: [CancellationToken](/blog/csharp-cancellationtoken-aspnet-core). In-process queues: [Channel](/blog/csharp-channel-producer-consumer). Staff narration: [expert C# interviews](/blog/csharp-expert-interview-questions). Topic map: [async & threading hub](/learning/async-concurrency).

## If an interviewer asks

`IAsyncEnumerable` vs `Task<List<T>>`; streaming CSV; why `ToList()` on `IQueryable` is early.

**Strong answer:** names the HTTP write path and cancellation, not only `yield return`.

. Bring the action and the row count.

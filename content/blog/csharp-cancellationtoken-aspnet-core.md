---
title: "C# CancellationToken in ASP.NET Core"
description: "A CancellationToken is a cooperative please-stop flag. In ASP.NET Core, bind RequestAborted, pass it to EF Core and HttpClient, link timeouts, and do not log client abort as a 500."
date: "2026-09-07"
updated: "2026-09-07"
category: "async-concurrency"
tags: ["C#", ".NET", "Asynchronous Programming", "Threading", "ASP.NET Core"]
related:
  - csharp-async-await-aspnet-core
  - csharp-iasyncenumerable-yield-return
  - csharp-threadpool-starvation-sync-over-async
faq:
  - q: "How do I get a CancellationToken in an ASP.NET Core controller?"
    a: "Add a CancellationToken parameter to the action. The framework binds HttpContext.RequestAborted. Pass that same token to ToListAsync, SaveChangesAsync, and HttpClient. Do not new up a CancellationTokenSource per action unless you need a timeout linked to abort."
  - q: "Why does SQL keep running after Angular navigates away?"
    a: "Kestrel canceled RequestAborted. A service, MediatR handler, or helper dropped the token and called ToListAsync() with no argument. Cancellation is cooperative — SQL Server stops only if the provider sees the token."
  - q: "RequestAborted vs a custom CancellationToken?"
    a: "RequestAborted means the client disconnected. A CancellationTokenSource is your timeout or a business abort. Combine them with CreateLinkedTokenSource so either one stops the work, and dispose the linked source. A singleton CTS shared across requests is a cross-tenant cancel."
  - q: "How do I prove SQL stopped after Angular cancelled?"
    a: "In App Insights, client abort is 499 (Kestrel), not a 500, and the SQL dependency should stop. For a dump, stamp the SQL session with TraceIdentifier and watch sys.dm_exec_sessions. If Kestrel logged cancel and the session lives, a handler dropped the token."
---

A `CancellationToken` is a **“please stop” flag**. **Cooperative cancellation** means nothing is force-killed: each method must accept the token and pass it to the next I/O call. ASP.NET Core sets `HttpContext.RequestAborted` when Angular disconnects. If you drop the token on `ToListAsync()`, SQL keeps running after the tab closes.

**New to this** → stay here. **Merging a PR** → [wrong vs right](#wrong-vs-right). **On-call / interview** → [linked timeout](#linked-timeout-abort) · [prove it](#prove-it-app-insights-then-sql) · [if an interviewer asks](#if-an-interviewer-asks).

**Terms used here:** **`CancellationTokenSource` (CTS)** = the object that *owns* cancellation; you call `Cancel()` or set a timeout on it. The **token** is the flag you pass around. **499** = client closed the connection (Kestrel). **408 / 504** = *your* timeout with the tab still open.

```text
Angular closes the tab
   → Kestrel sets RequestAborted
      → action parameter CancellationToken
         → service BuildAsync(..., ct)
            → ToListAsync(ct)     ← if you omit ct, this arrow is broken
               → SQL can stop
```

## Binding at the edge

```csharp
[HttpGet("report")]
public async Task<ActionResult<ReportDto>> GetReport(
    [FromQuery] ReportQuery query,
    CancellationToken cancellationToken) // bound to RequestAborted
{
    var report = await _reports.BuildAsync(query, cancellationToken);
    return Ok(report);
}
```

Minimal APIs: add `CancellationToken ct` to the handler. You do not pass `HttpContext.RequestAborted` by hand unless you are in middleware that does not bind it.

**Never** capture `cancellationToken` into `Task.Run` fire-and-forget after the request ends — the token is already canceled. Durable work goes to a [Channel](/blog/csharp-channel-producer-consumer) or a queue with `CancellationToken.None` plus its own shutdown token.

## Wrong vs right

I would reject a PR that puts `CancellationToken` on the controller and then calls `ToListAsync()` with no argument.

```csharp
// Wrong — token dropped; SQL keeps running after Angular leaves
await _db.Encounters.AsNoTracking().Take(500).ToListAsync();

// Right
await _db.Encounters.AsNoTracking().Take(500).ToListAsync(ct);
```

Drop points I keep finding:

- MediatR handlers with no `CancellationToken` on `Handle`
- EF methods without the token (`ToListAsync()` overload)
- `HttpClient.GetAsync(url)` without `ct`
- Dapper `ExecuteAsync` without `ct`
- `Task.WhenAll` of children that ignored `ct`

Angular canceling `HttpClient` is necessary and **not sufficient**. The API must honor the token. Streams need [EnumeratorCancellation](/blog/csharp-iasyncenumerable-yield-return).

## Linked timeout + abort

A `CancellationTokenSource` is how *you* cancel — timeout or a business abort. Link it to the request token so **either** stops the work:

```csharp
using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(8));
using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, timeout.Token);

await _db.Encounters.AsNoTracking()
    .Where(e => e.ClinicId == query.ClinicId)
    .Take(500)
    .ToListAsync(linked.Token);
```

_Comparison: RequestAborted versus timeout versus a linked token._

| Token | Meaning | Typical HTTP |
|---|---|---|
| `RequestAborted` / action parameter | Client gone | **499** (Kestrel), not a 500 |
| Timeout CTS | Our budget, tab still open | **408** or **504** you own |
| Linked | Either | Whichever fired |
| `CancellationToken.None` | We refuse to stop | Rare; justify it |

Dispose the linked source. A singleton CTS shared across requests is a **cross-tenant cancel**.

## Exceptions and HTTP status

```csharp
catch (OperationCanceledException) when (ct.IsCancellationRequested)
{
    throw; // host treats abort as 499, not a 500
}
```

Do not log client cancels at Error on a busy SPA. Debug or none. Do not convert cancel into `ProblemDetails` 500. If **your** timeout fired (`timeout.IsCancellationRequested` but not `ct`), that is a 504 or 408 you own.

## Prove it: App Insights, then SQL

**Good enough for most teams:** cancel from the SPA, confirm Kestrel/App Insights shows cancel or 499, and the SQL dependency duration stops climbing. If Kestrel logged cancel and SQL duration keeps going, a handler dropped the token.

**Advanced: prove the session died**

1. Stamp the SQL connection with `HttpContext.TraceIdentifier`
2. Cancel from Angular (or `HttpContext.Abort()` in a test)
3. Watch `sys.dm_exec_sessions` — the session should die

```csharp
await using var conn = (SqlConnection)_db.Database.GetDbConnection();
if (conn.State != ConnectionState.Open)
    await conn.OpenAsync(ct);

await using var cmd = conn.CreateCommand();
cmd.CommandText = "EXEC sp_set_session_context @key = N'RequestId', @value = @id";
cmd.Parameters.AddWithValue("@id", http.TraceIdentifier);
await cmd.ExecuteNonQueryAsync(ct);
```

Staff-level “where did the token die” is [expert C# interviews](/blog/csharp-expert-interview-questions).

## Testing

```csharp
[Fact]
public async Task BuildAsync_Stops_WhenTokenCanceled()
{
    using var cts = new CancellationTokenSource();
    await cts.CancelAsync();

    await Assert.ThrowsAnyAsync<OperationCanceledException>(
        () => sut.BuildAsync(query, cts.Token));
}
```

For EF, a canceled token should not hit SQL if you cancel before execute; during execute, provider behavior varies — prove it with a long `WAITFOR` in an integration test if the report is expensive.

## PeriodicTimer vs Delay

```csharp
using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
while (await timer.WaitForNextTickAsync(stoppingToken))
{
    await PollAsync(stoppingToken);
}
```

`PeriodicTimer` does not overlap ticks the way a naive `Delay` + work loop can. Both honor a token. `Thread.Sleep` does not.

## Common mistakes

- `CancellationToken` on the controller, unused
- Linking then not disposing
- Passing `RequestAborted` into a background job
- Swallowing `OperationCanceledException` and returning an empty 200
- `GetAwaiter().GetResult()` “because the test was sync” — use `async Task` tests

## What this is not

Request-path async: [async await in ASP.NET Core](/blog/csharp-async-await-aspnet-core). Topic map: [async & threading hub](/learning/async-concurrency).

## If an interviewer asks

How to obtain the token; why every endpoint should accept one; linked timeout; RequestAborted vs custom; testing cancel; why SQL continues after the SPA leaves.

**Strong answer:** bind, pass, link+dispose, don’t 500 a cancel.

If reports keep running after users navigate away, [contact me](/contact). We grep for `ToListAsync()` without a token first.

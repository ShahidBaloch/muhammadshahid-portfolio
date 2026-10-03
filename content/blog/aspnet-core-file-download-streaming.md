---
title: "ASP.NET Core File Download Streaming for Large Exports"
description: "ASP.NET Core file download streaming for large CSV exports: async EF rows, an early flush, cancellation, and a one-time ticket instead of a query JWT."
date: "2026-10-03"
category: "api-design"
tags: ["ASP.NET Core", "Streaming", "EF Core", "Angular", "Exports"]
related:
  - aspnet-core-minimal-apis
  - ef-core-nplus1-include-vs-assplitquery
  - aspnet-core-jwt-auth
  - aspnet-core-rate-limiting
faq:
  - q: "Should a large ASP.NET Core export return Results.File with a byte array?"
    a: "No. A byte array means the whole file sat in memory before the first byte reached the client. Stream rows to Response.Body, or generate the file out of band and hand back a short-lived download."
  - q: "Why does Angular run out of memory on a CSV that the API streamed?"
    a: "HttpClient with responseType blob assembles the entire body in the browser. Streaming on the server does not stream through that call. Use a real navigation or the File System Access API for large files."
  - q: "Can I put the JWT in the query string so a plain link downloads the file?"
    a: "Do not. Query strings land in access logs, proxies, and Referer headers. Use the existing auth cookie, or a single-use download ticket that is not the access token."
---

**ASP.NET Core file download streaming** means the response body is written as rows (or file chunks) become available, instead of assembling a `byte[]` and handing it to `Results.File`. The client starts saving while the database is still reading.

```text
Angular (link or fetch stream)  GET /api/exports/orders.csv
    v
Authn + a short-lived ticket or cookie   (not a JWT in the query)
    v
EF Core  AsAsyncEnumerable()  --> one row in memory at a time
    v
StreamWriter on HttpResponse.Body  --> flush
    v
Kestrel / reverse proxy  (buffering disabled on this response)
```

A download endpoint is a query with a long life. Treat it like one: projection, backpressure, cancellation, and a plan for what happens when the client walks away halfway through.

**Endpoint shape** -> [Minimal APIs](/blog/aspnet-core-minimal-apis). **Query shape** -> [N+1 and projections](/blog/ef-core-nplus1-include-vs-assplitquery). **Auth** -> [JWT auth](/blog/aspnet-core-jwt-auth). **Abuse** -> [rate limiting](/blog/aspnet-core-rate-limiting).

Search intent for **asp.net core file download streaming** is a how-to for large exports: start the body early, keep memory flat, and do not pretend a blob download in Angular is a stream.

## Choose the channel before writing bytes

| Size and shape | Mechanism | Why |
|---|---|---|
| Small, already on disk (a generated PDF under a few MB) | `Results.File(path)` / `PhysicalFileResult` | The server can sendfile; you do not copy it into a string |
| Small, built in memory (a single invoice) | `Results.File(bytes, contentType, fileName)` | The allocation is bounded and obvious |
| Large tabular export | Stream CSV (below) | Row cost stays flat |
| Huge, slow, or shared (minutes, multi-GB, emailed later) | Background job writes blob storage, API returns 202 plus a status URL | A browser request is the wrong lifetime |

If the export can outlive a single HTTP request, do not stream it on that request. Persist it, then stream the finished object with range support. Streaming is for "the data exists in SQL and the user is waiting now," not for "please build a warehouse extract inside this GET."

Excel is the trap. ClosedXML and most DOM-style writers hold the workbook in memory. A "stream" that buffers a workbook is still a buffer. For large grids, write CSV or use the Open XML SAX writer. This article streams CSV because the wire format matches the technique. The same `Response.Body` loop is what a SAX writer would target.

## Stream the CSV from EF Core

> **Watch:** ToListAsync then write holds the whole file in memory. Quote fields, or the first comma splits the row. Do not log the body.

```csharp
public static IEndpointRouteBuilder MapOrderExport(this IEndpointRouteBuilder app)
{
    app.MapGet("/api/exports/orders.csv", ExportOrders)
        .RequireAuthorization("CanExportOrders");
    return app;
}

static async Task ExportOrders(
    AppDbContext db,
    HttpContext http,
    CancellationToken ct)
{
    http.Response.StatusCode = StatusCodes.Status200OK;
    http.Response.ContentType = "text/csv; charset=utf-8";
    http.Response.Headers.ContentDisposition =
        "attachment; filename=\"orders.csv\"";
    http.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();

    await using var writer = new StreamWriter(
        http.Response.Body,
        new UTF8Encoding(encoderShouldEmitUTF8Identifier: true),
        bufferSize: 64 * 1024,
        leaveOpen: true);

    await writer.WriteLineAsync("Id,CreatedUtc,Status,Total").ConfigureAwait(false);
    await writer.FlushAsync().ConfigureAwait(false);

    var rows = db.Orders.AsNoTracking()
        .OrderBy(o => o.Id)
        .Select(o => new { o.Id, o.CreatedUtc, o.Status, o.Total })
        .AsAsyncEnumerable();

    await foreach (var row in rows.WithCancellation(ct))
    {
        await writer.WriteLineAsync(string.Join(',',
            row.Id,
            row.CreatedUtc.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture),
            Csv(row.Status),
            row.Total.ToString(CultureInfo.InvariantCulture))).ConfigureAwait(false);
    }

    await writer.FlushAsync().ConfigureAwait(false);
}

static string Csv(string value)
{
    var safe = value;
    if (safe.Length > 0 && "=+-@\t\r".Contains(safe[0]))
        safe = "'" + safe;

    if (safe.Contains('"') || safe.Contains(',') || safe.Contains('\n') || safe.Contains('\r'))
        return "\"" + safe.Replace("\"", "\"\"") + "\"";

    return safe;
}
```

Details that matter:

- **Status and headers before the first row.** After the body starts you cannot change your mind and return 400.
- **UTF-8 BOM** so Excel on Windows detects the encoding. The rest of the file stays UTF-8, not the system ANSI code page.
- **Invariant numbers and ISO timestamps.** A CSV is a file, not a view. Formatting belongs in the spreadsheet, same rule as JSON APIs.
- **`DisableBuffering`** asks the server not to hold the body until completion. A reverse proxy in front can still buffer. On IIS, YARP, or nginx, turn off response buffering for this path or the "stream" still arrives as one blob and the proxy may time out waiting to measure `Content-Length`.
- **No `Content-Length`.** Chunked transfer is correct here. Clients that require a progress bar need the out-of-band file instead, where the length is known.
- **`leaveOpen: true`.** Disposing the writer must not dispose `Response.Body` out from under Kestrel.
- **Keyset order (`OrderBy(o => o.Id)`)** so you are not streaming an unstable sort. For very large tables, page by `Id > lastId` in a loop so SQL does not hold one giant reader past your command timeout. Increase the command timeout deliberately for this query; do not raise the global timeout.
- **Projection.** `Select` the columns you write. A covering query is the difference between a stream and a table scan that also drags unused columns. See [covering indexes](/blog/covering-index-ef-core).

Flush the header row immediately so the browser's download UI appears before the first thousand data rows. Flushing every row costs more than it saves; flush every few hundred if you need the file to grow on disk during a long export, or rely on the 64 KB buffer.

CSV formula injection is real: a status value of `=cmd|...` becomes a formula when someone opens the file in Excel. Prefix cells that start with `=`, `+`, `-`, `@`, or a tab. Quote embedded commas and quotes. Do not skip this because "statuses are an enum" unless they are actually an enum you control end to end.

## Plan for cancel and a truncated file

> **Watch:** A proxy idle timeout can cut the stream and leave a partial file with a finished-looking name. Test with a large row count, not ten rows.

Pass `HttpContext.RequestAborted` (the endpoint `CancellationToken` already is that token in minimal APIs) into `WithCancellation`. When the user cancels, the next write or read throws `OperationCanceledException`. Do not catch it and try to set status 499. The status is already 200. Log at information and return.

If a row throws for any other reason, the client has a truncated CSV and a 200. That is the sharp edge of streaming. Mitigations that work:

- Write into a temp file or blob, and only then start the HTTP response, when the export must be all-or-nothing. You give up early TTFB.
- On failure mid-stream, you cannot retract bytes. Log a correlation id you also wrote into a trailer only if the client knows to read trailers. Most browsers will not. Prefer the temp-file approach for financial extracts.
- Do not wrap the enumerator in a transaction that stays open for the whole download unless you need a snapshot. An open transaction plus a slow client pins a SQL connection from the pool. Snapshot isolation or a staged table is kinder.

Read-only queries still use a connection until the enumerator completes. A stalled downloader stalls a pooled connection. Cap concurrent exports with a concurrency limiter or the [rate limiter](/blog/aspnet-core-rate-limiting), and set Kestrel's minimum data rate so a client that stops reading does not hold the connection forever.

## Authorize a download the browser navigates to

> **Watch:** The URL is not a secret. Authorize the owner. Gzip middleware that buffers the response fights a chunked CSV.

`HttpClient` can send `Authorization`. A plain `<a href>` cannot, unless you use a cookie. Three patterns, in the order I reach for them:

1. **Cookie auth on the same site** as the SPA. The link is a normal same-origin GET. CSRF matters if the cookie is sent on cross-site GETs; `SameSite=Lax` plus GET-only exports that do not change state is the usual pairing. A download that mutates (burning a one-time token, marking "exported") should be a POST, not a GET.
2. **Short-lived ticket.** `POST /api/exports/orders` checks the bearer token, inserts a random 128-bit ticket with user id, filter hash, and expiry of a minute, returns `{ url: "/api/exports/orders.csv?ticket=..." }`. The GET accepts the ticket once, binds it to the same user, and does not accept a JWT in the query. Store only a hash of the ticket.
3. **Bearer via fetch, then stream to disk** (next section). No token in the URL.

The ticket POST is the small authenticated call. The GET is not.

```csharp
public sealed class DownloadTicket
{
    public byte[] TokenHash { get; set; } = [];
    public string UserId { get; set; } = "";
    public DateTimeOffset ExpiresUtc { get; set; }
    public bool Used { get; set; }
}

app.MapPost("/api/exports/orders/ticket", async (
    ClaimsPrincipal user, AppDbContext db, CancellationToken ct) =>
{
    var userId = user.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new InvalidOperationException("No subject.");
    var ticket = RandomNumberGenerator.GetBytes(16);
    db.DownloadTickets.Add(new DownloadTicket
    {
        TokenHash = SHA256.HashData(ticket),
        UserId = userId,
        ExpiresUtc = DateTimeOffset.UtcNow.AddMinutes(1)
    });
    await db.SaveChangesAsync(ct);
    return Results.Ok(new
    {
        url = "/api/exports/orders.csv?ticket=" + Convert.ToHexString(ticket)
    });
}).RequireAuthorization("CanExportOrders");
```

On the GET, hash the query value and load the row for that hash. Reject a missing row, a different user, an expiry in the past, or `Used == true`. Set `Used` and commit before the first CSV byte. A cancel after that spends the ticket; mint another. Do not accept a JWT in that query string.

Never log the ticket query string. Strip it in your request logging middleware the same way you strip `Authorization`.

## Keep a large export out of an Angular blob

Blob downloads buffer. This is fine for a PDF under a few megabytes and wrong for an export you bothered to stream.

```typescript
async downloadSmall(path: string, filename: string): Promise<void> {
  const response = await firstValueFrom(this.http.get(path, {
    responseType: 'blob',
    observe: 'response',
  }));
  const url = URL.createObjectURL(response.body!);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

For large files, prefer a same-origin navigation so the browser, not the JS heap, owns the stream:

```typescript
startExport(): void {
  window.location.assign('/api/exports/orders.csv');
}
```

That only sends cookies, not the bearer interceptor. If you are header-only, mint a ticket with `HttpClient` (the POST is small) and assign `window.location` to the ticket URL.

Where you control the browser baseline and need a bearer token plus a real stream, `fetch` with `ReadableStream` and `showSaveFilePicker` writes chunks to disk. Feature-detect it and fall back to the ticket. Do not read the whole `arrayBuffer()` and call that a fallback for the large path; that is the blob problem again.

Show "preparing" only until response headers arrive, then let the browser's download shelf take over. A custom progress bar without `Content-Length` is fiction unless you counted rows first (a separate `COUNT(*)` that can be as expensive as the export).

## What makes a streamed download buffer anyway?

- **`ToListAsync` then write.** The list is the file, in memory, twice.
- **Returning `Results.Stream` with a `MemoryStream` you already filled.** The signature says stream; the allocation says buffer. Stream from the enumerator, or from a `FileStream` opened read-only.
- **Gzip middleware buffering the response** so it can compress. Compression and chunked CSV fight. Disable compression on this route or accept the buffer.
- **Serilog request logging reading the body.** There is nothing to gain and a lot of PII to lose. CSV exports do not get body logging.
- **String interpolation of unquoted CSV fields.** The first status with a comma splits the row and shifts every column. Use the quoter.
- **Sharing one `DbContext` with other work on the request** while the enumerator is live. The context is busy. The export endpoint should be the only user of that context.
- **Proxy idle timeout shorter than the export.** The stream dies at 100 seconds into a 4-minute file and the user keeps a partial CSV named like a full one. Either finish faster, raise the timeout on this path only, or switch to the 202-plus-blob flow.
- **Testing only with 10 rows.** Buffering bugs show up at row 100,000. Assert process memory or at least that the response body starts before the query is finished (headers flushed, first line received, query still open).

## How do you verify the export actually streamed?

1. An export of a known fixture starts returning bytes before all rows are read. Log a timestamp at first flush and at enumerator completion if you need a one-off proof.
2. Cancelling the HTTP request stops the SQL reader. Watch `sys.dm_exec_requests` or your EF command log; the command should not run to the end after abort.
3. A field containing a comma, a quote, and a leading `=` round-trips through the quoter and does not shift columns.
4. Anonymous calls get 401 and an empty body, not a CSV of public data with a 401 halfway down.
5. The ticket GET rejects a reused ticket and rejects a ticket minted for a different user.
6. Angular's large path does not call `responseType: 'blob'`. Search the repo.
7. A forced exception on row N leaves a documented outcome: either you never started the response (temp file) or you accept a truncated body and a server log line. There is no third outcome where the status becomes 500 after the header flush.

Stream the rows you can bound. Move the rest to a file that already exists before the download starts.


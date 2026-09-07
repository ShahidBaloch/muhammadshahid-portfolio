---
title: "Headers are read-only, response has started in ASP.NET Core"
description: "InvalidOperationException: Headers are read-only, response has started — why IExceptionHandler is too late after WriteAsync, how Angular sees a CORS error, and the HasStarted check I use."
date: "2026-09-07"
category: "architecture"
tags: ["ASP.NET Core", "Exception Handling", "Middleware", "Angular", "Kestrel"]
related:
  - aspnet-core-global-exception-handling
  - aspnet-core-middleware-order
  - aspnet-core-json-object-cycle
---

**Headers are read-only, response has started.** That is the `InvalidOperationException` Kestrel throws when code tries to change `StatusCode` or a header after the first bytes already went to the client. It is not a ProblemDetails-shape bug. It is not a `Program.cs` ordering essay. Those live in [global exception handling](/blog/aspnet-core-global-exception-handling) and [middleware order](/blog/aspnet-core-middleware-order).

I see this on healthcare export endpoints and marketplace CSV downloads: the action starts streaming, SQL throws on row 40,000, and the exception handler tries to turn the response into a 500 JSON body. The body already started as `200 text/csv`. The handler throws **on top of** the original exception. Logs look like two failures. Angular reports CORS or a truncated download.

## What the exception is actually saying

Once Kestrel has flushed response headers (and usually the first chunk of the body), the HTTP contract is committed:

- Status is fixed
- `Content-Type` is fixed
- You cannot add `Access-Control-Allow-Origin`
- You cannot swap to ProblemDetails

`HttpContext.Response.HasStarted` is `true`. Setting `StatusCode` or `Headers[...]` throws. That is by design, not a Kestrel bug.

People paste the message into Google after a global handler that worked for ordinary 500s. Ordinary 500s fail **before** any write. Streaming and “write then `next()`” fail **after**.

## Where I still see it

### `IExceptionHandler` after a write

```csharp
await Response.WriteAsync(chunk, cancellationToken);
// SQL throws on the next page
throw;
```

`UseExceptionHandler` / `IExceptionHandler` runs. It sets `StatusCode = 500` and writes JSON. `HasStarted` is already true. Second exception: **Headers are read-only, response has started.**

The original SQL exception is the one you wanted. The headers exception is noise from a handler that assumed it still owned the response.

### Middleware that writes, then calls `next`

```csharp
app.Use(async (context, next) =>
{
    await context.Response.WriteAsync("{\"ok\":true}");
    await next(); // later middleware or the action throws
});
```

Never write a body and then continue the pipeline. If you must short-circuit, `return` after the write.

### `StatusCode` pages and HTTPS redirection after a body

`UseStatusCodePages` and some redirect middleware want to replace the response. If an action already wrote `200` with a body and then you try to convert it to a 404 page, you get the same exception. Pipeline order belongs on the middleware article; here the rule is: **do not rewrite a started response.**

## What Angular actually shows

The SPA often does **not** show the C# exception text.

| What already flushed | What Angular sees |
| --- | --- |
| CSV / file bytes, then throw | Truncated download, 200, no JSON |
| JSON fragment, then throw | Parse error in `HttpClient` |
| Headers without ACAO, then throw | Chrome “CORS error” — the exception handler cannot add CORS headers anymore |

Curl on the same URL may show a 200 with a cut-off body. That is why the Network tab and the App Insights exception look unrelated. They are the same request.

CORS policy design stays in [CORS between Angular and ASP.NET Core](/blog/cors-angular-aspnet-core). This URL is only: **once the response has started, your exception handler cannot fix CORS either.**

## The check I put in every handler

```csharp
public sealed class GlobalExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext http,
        Exception exception,
        CancellationToken cancellationToken)
    {
        if (http.Response.HasStarted)
        {
            // Do not touch StatusCode or headers. Log and give up on the body.
            return true; // we "handled" it by not throwing a second exception
        }

        http.Response.StatusCode = StatusCodes.Status500InternalServerError;
        http.Response.ContentType = "application/problem+json";
        await http.Response.WriteAsJsonAsync(/* ProblemDetails */, cancellationToken);
        return true;
    }
}
```

Returning `true` after `HasStarted` stops the headers exception. The client still has a broken 200. That is honest. You cannot un-send bytes.

ProblemDetails field names stay on the exception-handling article. Here the only new line is **`HasStarted` before any header mutation**.

## How I avoid starting the response too early

1. **Buffer until you know the status.** For JSON APIs, serialize to a `byte[]` or `MemoryStream`, then write once. Do not `WriteAsync` in a loop unless the product is a download.
2. **Fail before the first byte on exports.** Run the query far enough to know it will succeed (or use a temp file / blob, then stream a complete object). Healthcare fee-schedule exports that stream from an open reader will hit this the first time SQL times out mid-grid.
3. **Do not log into the response.** `ILogger` goes to App Insights. Writing the exception into the body after a 200 header is how this exception is born.
4. **Disable response buffering only when the file is already complete.** `IHttpResponseBodyFeature.DisableBuffering()` is for large successful downloads, not for “maybe it 500s later.”

```csharp
[HttpGet("export")]
public async Task<IActionResult> Export(CancellationToken cancellationToken)
{
    var rows = await _fees.ListForExportAsync(cancellationToken); // may throw — still 500 JSON
    var bytes = BuildCsv(rows);
    return File(bytes, "text/csv", "fees.csv");
}
```

If `ListForExportAsync` throws, `HasStarted` is still false. The global handler can return 500 JSON. If you `yield return` straight into the body, you do not get that luxury.

## What I check in logs

1. Two exceptions on one request? The second is almost always this headers message. Read the **first**.
2. `Response.HasStarted` in a custom middleware? Log it next to the path.
3. Did someone add `await next()` after writing a health payload?
4. Is the endpoint a stream (`IAsyncEnumerable`, `PipeWriter`, `BodyWriter`) with no try/catch around the producer?

Weak answer: “remove the exception handler.” Strong answer: **the handler must no-op when `HasStarted`, and streaming endpoints must not start the body until the operation can finish.**

## Related reading

- [ASP.NET Core global exception handling](/blog/aspnet-core-global-exception-handling)
- [ASP.NET Core middleware order](/blog/aspnet-core-middleware-order)
- [A possible object cycle was detected](/blog/aspnet-core-json-object-cycle)
- [Architecture hub](/learning/architecture)

If an Angular download returns 200 with a cut-off file and App Insights shows **Headers are read-only, response has started**, [send the request path](/contact) — that is this bug, not a missing `[Authorize]`.

---
title: "Headers are read-only, response has started in ASP.NET Core"
description: "Fix InvalidOperationException Headers are read-only response has started — IExceptionHandler after WriteAsync, streaming exports, Angular CORS errors, and the HasStarted guard."
date: "2026-09-07"
updated: "2026-09-08"
category: "architecture"
tags: ["ASP.NET Core", "Exception Handling", "Middleware", "Angular", "Kestrel"]
related:
  - aspnet-core-global-exception-handling
  - aspnet-core-middleware-order
  - aspnet-core-json-object-cycle
faq:
  - q: "What does Headers are read-only, response has started mean?"
    a: "Kestrel already flushed the body. IExceptionHandler cannot change status or CORS headers after WriteAsync. Check HttpContext.Response.HasStarted before writing."
  - q: "Why does Angular report CORS on this exception?"
    a: "The first write went out without ACAO. The exception handler is too late. Chrome then blames CORS instead of the original 500."
  - q: "Is this the same as global exception handling setup?"
    a: "No. That page is the ProblemDetails envelope. This page is the HasStarted failure when the envelope is too late."
---

## Definition

**Headers are read-only, response has started** is the `InvalidOperationException` Kestrel throws when code tries to change `StatusCode` or a header after the first bytes already went to the client. Once `HttpContext.Response.HasStarted` is `true`, the HTTP contract is committed — status, `Content-Type`, and CORS headers are fixed.

## Analogy

Sending an HTTP response is like sealing a letter:

```text
WriteAsync(first chunk)  →  envelope sealed, stamp applied
Exception fires          →  you want to change the address label
HasStarted = true        →  post office already has it — too late
```

Your `IExceptionHandler` is trying to rewrite the envelope after it left the building. The original exception (SQL timeout on row 40,000) is the real problem. The headers exception is noise from a handler that assumed it still owned the response.

## Routing

**"Headers are read-only" exception** → stay here.

**ProblemDetails shape and 500 envelope** → [global exception handling](/blog/aspnet-core-global-exception-handling).

**Middleware pipeline order** → [ASP.NET Core middleware order](/blog/aspnet-core-middleware-order).

**JSON cycle 500s that look like CORS** → [A possible object cycle was detected](/blog/aspnet-core-json-object-cycle).

**CORS policy design** → [CORS between Angular and ASP.NET Core](/blog/cors-angular-aspnet-core).

**Architecture topic map** → [architecture hub](/learning/architecture).

## Details

I see this on healthcare export endpoints and marketplace CSV downloads: the action starts streaming, SQL throws on row 40,000, and the exception handler tries to turn the response into a 500 JSON body. The body already started as `200 text/csv`. The handler throws **on top of** the original exception.

### What the exception is actually saying

Once Kestrel has flushed response headers (and usually the first chunk of the body):

- Status is fixed
- `Content-Type` is fixed
- You cannot add `Access-Control-Allow-Origin`
- You cannot swap to ProblemDetails

People paste the message into Google after a global handler that worked for ordinary 500s. Ordinary 500s fail **before** any write. Streaming and "write then `next()`" fail **after**.

### Where I still see it

#### `IExceptionHandler` after a write

```csharp
await Response.WriteAsync(chunk, cancellationToken);
// SQL throws on the next page
throw;
```

`UseExceptionHandler` / `IExceptionHandler` runs. It sets `StatusCode = 500` and writes JSON. `HasStarted` is already true. Second exception: **Headers are read-only, response has started.**

#### Middleware that writes, then calls `next`

```csharp
app.Use(async (context, next) =>
{
    await context.Response.WriteAsync("{\"ok\":true}");
    await next(); // later middleware or the action throws
});
```

Never write a body and then continue the pipeline. If you must short-circuit, `return` after the write.

#### `StatusCode` pages and HTTPS redirection after a body

`UseStatusCodePages` and some redirect middleware want to replace the response. If an action already wrote `200` with a body and then you try to convert it to a 404 page, you get the same exception.

### What Angular actually shows

The SPA often does **not** show the C# exception text.

| What already flushed | What Angular sees |
| --- | --- |
| CSV / file bytes, then throw | Truncated download, 200, no JSON |
| JSON fragment, then throw | Parse error in `HttpClient` |
| Headers without ACAO, then throw | Chrome "CORS error" — the exception handler cannot add CORS headers anymore |

Curl on the same URL may show a 200 with a cut-off body. That is why the Network tab and the App Insights exception look unrelated.

### The check I put in every handler

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

### How I avoid starting the response too early

1. **Buffer until you know the status.** For JSON APIs, serialize to a `byte[]` or `MemoryStream`, then write once.
2. **Fail before the first byte on exports.** Run the query far enough to know it will succeed (or use a temp file / blob, then stream a complete object).
3. **Do not log into the response.** `ILogger` goes to App Insights.
4. **Disable response buffering only when the file is already complete.**

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

### What I check in logs

1. Two exceptions on one request? The second is almost always this headers message. Read the **first**.
2. `Response.HasStarted` in a custom middleware? Log it next to the path.
3. Did someone add `await next()` after writing a health payload?
4. Is the endpoint a stream (`IAsyncEnumerable`, `PipeWriter`, `BodyWriter`) with no try/catch around the producer?

## If an interviewer asks

**"What does 'Headers are read-only, response has started' mean and how do you fix it?"**

**Strong answer:** Kestrel committed the HTTP response when the first bytes flushed — status and headers are fixed. If an exception fires after `WriteAsync`, `IExceptionHandler` cannot change status or add CORS headers. Check `HttpContext.Response.HasStarted` before mutating the response; return early from the handler if true. For streaming endpoints, buffer or complete the operation before writing, or accept that a mid-stream failure cannot become a clean 500 JSON body. Angular may show a CORS error because the handler could not add `Access-Control-Allow-Origin` after the response started.

**Weak answer:** "Remove the exception handler."

## Related reading

- [ASP.NET Core global exception handling](/blog/aspnet-core-global-exception-handling)
- [ASP.NET Core middleware order](/blog/aspnet-core-middleware-order)
- [A possible object cycle was detected](/blog/aspnet-core-json-object-cycle)
- [Architecture hub](/learning/architecture)

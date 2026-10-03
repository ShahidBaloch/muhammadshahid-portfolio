---
title: "ASP.NET Core Request Decompression and Large Payload Limits"
description: "Enable ASP.NET Core request decompression so gzip, Brotli, or deflate bodies bind as normal JSON, and cap the inflated size. Not response compression."
date: "2026-10-03"
category: "api-design"
tags: ["ASP.NET Core", "Kestrel", "HTTP", "Security", "Performance"]
related:
  - aspnet-core-rate-limiting
  - rfc-9457-problem-details-aspnet-core
  - aspnet-core-middleware-order
  - aspnet-core-api-validation
faq:
  - q: "How do I accept a gzip request body in ASP.NET Core?"
    a: "Call AddRequestDecompression and UseRequestDecompression before anything reads the body. The client sends Content-Encoding gzip (or br or deflate) and Content-Type application/json. The action then binds the decompressed JSON as usual."
  - q: "Does MaxRequestBodySize limit the compressed or the decompressed body?"
    a: "The decompression middleware stops reading once decompressed bytes exceed the endpoint or server body limit and throws InvalidOperationException. Proxies still limit the compressed size on the wire. You need both numbers."
  - q: "Is ASP.NET Core request decompression the same as response compression?"
    a: "No. Response compression shrinks what you send to the client. Request decompression inflates what the client sent. They are different middleware and a different Content-Encoding direction."
---

**ASP.NET Core request decompression** is middleware that wraps the request body when `Content-Encoding` is `br`, `deflate`, or `gzip`, so model binding and the rest of the pipeline read plain JSON or XML. It is how a partner posts a large catalog without making you inflate the bytes in every action.


```text
Client
  Content-Type: application/json
  Content-Encoding: gzip
  body: gzip bytes
        |
        v
UseRequestDecompression   (before anything reads Body)
        |
        v
Endpoint reads decompressed stream
  over the size limit -> InvalidOperationException
```

Metaphor: response compression is vacuum-sealing the box you ship out. Request decompression is opening a box the client vacuum-sealed. The warehouse door (the proxy) still has a width limit on the box as it arrives. The unpacking table has a limit on how much paper comes out.

**New to this** stay here. **Pipeline order in general** see [middleware order](/blog/aspnet-core-middleware-order). **How 413 and 400 should look** see [ProblemDetails](/blog/rfc-9457-problem-details-aspnet-core). **Binding rules after the body is plain** see [API validation](/blog/aspnet-core-api-validation). **Abuse after you accept large bodies** see [rate limiting](/blog/aspnet-core-rate-limiting).

## How to enable ASP.NET Core request decompression

> **Watch:** If something reads Body before UseRequestDecompression, the action sees compressed bytes or an empty stream. A bad encoding is pass-through by default, then a JSON error, not a clean 415.

The types live in the shared framework. No extra NuGet package.

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRequestDecompression();
builder.Services.AddProblemDetails();
builder.Services.AddControllers();

builder.WebHost.ConfigureKestrel(k =>
{
    k.Limits.MaxRequestBodySize = 1_048_576;
});

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseRequestDecompression();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();
```

`UseRequestDecompression` must run before any middleware or endpoint that reads `Request.Body`. Decompression is lazy: the gzip stream is inflated when something reads, not when the middleware is entered. If a logging middleware reads the body first and buffers the compressed bytes, your action sees leftovers or already-consumed compressed data. Put decompression first among body readers.

Default providers are Brotli (`br`), deflate, and gzip. You do not register them again.

Unsupported `Content-Encoding`, or **more than one** `Content-Encoding` value, is not decompressed. The request continues. There is no automatic 415. The action then tries to parse gzip bytes as JSON and returns 400. If your contract says "gzip required", reject other encodings yourself before binding:

```csharp
app.Use(async (ctx, next) =>
{
    var encoding = ctx.Request.Headers.ContentEncoding.ToString();
    if (!string.IsNullOrEmpty(encoding) &&
        !encoding.Equals("gzip", StringComparison.OrdinalIgnoreCase) &&
        !encoding.Equals("br", StringComparison.OrdinalIgnoreCase) &&
        !encoding.Equals("deflate", StringComparison.OrdinalIgnoreCase))
    {
        await Results.Problem(
            statusCode: StatusCodes.Status415UnsupportedMediaType,
            title: "Unsupported Content-Encoding").ExecuteAsync(ctx);
        return;
    }

    if (ctx.Request.Headers.ContentEncoding.Count > 1)
    {
        await Results.Problem(
            statusCode: StatusCodes.Status415UnsupportedMediaType,
            title: "Multiple Content-Encoding values are not decompressed").ExecuteAsync(ctx);
        return;
    }

    await next();
});
```

Place that check before `UseRequestDecompression` if you want to reject early, or after it if you only care about what the middleware refused. Do not confuse `Content-Encoding` with `Content-Type`. `Content-Type: application/gzip` is the wrong signal. The media type stays `application/json`. The encoding header says the bytes are gzip.

## What the size limit actually counts

> **Watch:** The middleware limit is decompressed bytes. A proxy limit is the compressed size on the wire. DisableRequestSizeLimit is not the fix for a gzip body.

Microsoft's request decompression middleware limits how many **decompressed** bytes a reader may pull. The ceiling is, in order:

1. Endpoint metadata such as `[RequestSizeLimit(n)]` or `[DisableRequestSizeLimit]` on an MVC action.
2. The server limit: Kestrel `MaxRequestBodySize`, IIS `IISServerOptions.MaxRequestBodySize`, or HTTP.sys `HttpSysOptions.MaxRequestBodySize`.

Kestrel's default is about 30 MB (30,000,000 bytes). When the decompressed read passes the ceiling, the stream throws `InvalidOperationException`. That is not, by itself, a clean 413. Map it.

```csharp
app.UseExceptionHandler(a => a.Run(async ctx =>
{
    var feature = ctx.Features.Get<IExceptionHandlerFeature>();
    if (feature?.Error is InvalidOperationException or BadHttpRequestException)
    {
        ctx.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
        await Results.Problem(
            title: "Request body is too large",
            statusCode: StatusCodes.Status413PayloadTooLarge).ExecuteAsync(ctx);
        return;
    }

    ctx.Response.StatusCode = StatusCodes.Status500InternalServerError;
    await Results.Problem(statusCode: 500, title: "Unexpected error").ExecuteAsync(ctx);
}));
```

Check the exception type in a test before you ship that mapping. A genuine bug that throws `InvalidOperationException` for a different reason must not become 413. Narrow the check with the exception message your runtime actually throws for the decompression cap, or catch it at the endpoint. The requirement is: the client receives 413 ProblemDetails, not an empty 500.

`[DisableRequestSizeLimit]` removes the decompressed cap for that endpoint. That is how a decompression bomb becomes your process memory. Do not put it on a public action. A tiny gzip can expand to gigabytes if nothing stops the reader.

Proxies do not see decompressed size. nginx `client_max_body_size`, IIS `maxAllowedContentLength`, and Azure App Service / Front Door limits apply to the **compressed** request on the wire. If the proxy is smaller than Kestrel, the client gets the proxy's error (often 413 HTML, sometimes a reset) and your exception handler never runs. Set the proxy limit to the maximum compressed size you accept, and set Kestrel to the maximum decompressed size you are willing to materialize. Example: partners gzip roughly 5:1, you allow 1 MB compressed at the proxy and 5 MB decompressed in Kestrel. Write the two numbers down next to each other. A single "10 MB limit" in a ticket is how they drift.

Also set form limits separately if the body is multipart. Request decompression is usually for a raw JSON body, not for a file upload. A gzip JSON catalog and a multipart file use different knobs (`MultipartBodyLengthLimit`). Do not assume one attribute covers both.

## Client: send gzip on purpose

```csharp
var json = JsonSerializer.SerializeToUtf8Bytes(catalog);
using var compressed = new MemoryStream();
using (var gzip = new GZipStream(compressed, CompressionLevel.SmallestSize, leaveOpen: true))
{
    gzip.Write(json);
}
compressed.Position = 0;

using var content = new StreamContent(compressed);
content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
content.Headers.ContentEncoding.Add("gzip");

using var response = await http.PostAsync("/api/catalog/import", content, ct);
```

`HttpClient` automatic request compression is not something you get from `AddHttpClient` by default. If you forget `Content-Encoding`, you post raw JSON and the server never decompresses. If you set `Content-Encoding: gzip` and forget to gzip, the server throws while inflating and the client sees 500 or 400. Test both mistakes.

Angular should not gzip ordinary small JSON. The CPU cost and the interceptor complexity are not worth it below the size where a gateway starts complaining. When an export must be gzip, do it in a dedicated upload client, set both headers, and still send the bearer token from the existing interceptor. Browsers can send a `Blob` of gzip bytes with `HttpClient` `post` if you built that blob yourself. Do not set `Content-Encoding` and also let the browser gzip again.

## Endpoint shape

> **Watch:** A webhook that verifies an HMAC over the compressed bytes must see the raw body. Decompressing first checks the wrong bytes.

```csharp
[HttpPost("import")]
[RequestSizeLimit(5_242_880)]
[Authorize(Policy = "CatalogWriter")]
public IActionResult Import([FromBody] CatalogImport body)
{
    if (!ModelState.IsValid)
        return ValidationProblem(ModelState);

    // persist body.Items
    return Accepted();
}
```

`[FromBody]` reads the decompressed stream. Validation after that is normal [API validation](/blog/aspnet-core-api-validation). Decompression does not make the JSON trustworthy. Cap array length in the DTO (`[MaxLength]`) so a 4 MB body of a million tiny objects does not become a CPU problem after you allowed the bytes. Rate-limit this route. A body-size cap without a rate limit still lets a client pin a core by inflating the maximum legal payload all day. See [rate limiting](/blog/aspnet-core-rate-limiting).

Authenticated only. Anonymous decompression on a public POST is a cheap CPU attack even with a size cap.

## Custom provider

You rarely need one. The hook is `RequestDecompressionOptions.DecompressionProviders` keyed by the encoding name. Use it to disable deflate if you do not want it, by replacing the dictionary with gzip and br only, not to "add logging". If you wrap the stream, still enforce the framework size limit. A custom provider that returns a raw `GZipStream` and ignores the server limit undoes the bomb protection. Prefer the built-in providers.

## Pitfalls

- **Middleware after an early body reader** (request logging that drains `Body`). The action sees compressed bytes or an empty stream.
- **Assuming 415 on bad encoding.** The default is pass-through, then a JSON parse failure.
- **Assuming 413 on a bomb.** You get `InvalidOperationException` unless you map it. Proxies may 413 first, with an HTML body Angular cannot parse.
- **`[DisableRequestSizeLimit]` on the import action** "because gzip confused the limit". It did not. It made the limit apply to decompressed bytes, which is what you want.
- **One number for proxy and Kestrel.** They measure different things.
- **Turning on request decompression globally and forgetting a raw endpoint** that already accepts gzip itself (a webhook that verifies an HMAC over the compressed bytes). Decompressing before HMAC checks the wrong bytes. Exclude that path or compute the HMAC on the raw body first.
- **Confusing this with response compression** (`UseResponseCompression` / `AddResponseCompression`). Enabling one does not enable the other.

## Verification

1. Post a small JSON payload with `Content-Encoding: gzip`. The action receives the object. Logs show a compressed `Content-Length` smaller than the DTO's UTF-8 size.
2. Post the same JSON without `Content-Encoding`. The action still receives it. Clients that cannot gzip keep working.
3. Post `Content-Encoding: gzip` with a plain JSON body. Expect a failure from the inflater, mapped to a client error, not a committed partial write.
4. Post two encodings (`gzip, br`). Expect your 415, not a mysterious 400.
5. Build a highly compressible body whose inflated size exceeds `RequestSizeLimit` while the gzip size stays under the proxy limit. Expect 413 ProblemDetails and a process that does not grow without bound. Repeat with a body the proxy rejects and confirm the proxy's status so you know which layer spoke.
6. Integration test with `WebApplicationFactory`: gzip a fixture, set the header, assert 202. Second test asserts 415 for `Content-Encoding: zstd` until you actually add a zstd provider.

Watch memory during test 5. If the worker grows by the full inflated size and only then throws, the cap is applied too late for your custom reader. The built-in stream is supposed to throw as the limit is crossed, not after the whole bomb is buffered. If you buffered the body yourself, you bypassed it.

## What this page does not cover

Response compression, output caching of those responses, and validation attributes in depth are other posts. Chunked transfer encoding is allowed; you do not need `Content-Length` for decompression to work, but proxies are easier to reason about when the compressed length is known.

**Related:** [Middleware order](/blog/aspnet-core-middleware-order) | [ProblemDetails](/blog/rfc-9457-problem-details-aspnet-core) | [API validation](/blog/aspnet-core-api-validation) | [Rate limiting](/blog/aspnet-core-rate-limiting)

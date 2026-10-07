---
title: "Angular Blob Download and Upload Progress with ASP.NET Core"
description: "Download a file with Angular HttpClient as a blob from an ASP.NET Core API, and report upload progress, without parsing that file body as JSON."
date: "2026-10-03"
category: "api-design"
tags: ["Angular", "HttpClient", "ASP.NET Core", "File Upload", "File Download"]
related:
  - azure-blob-aspnet-core-uploads
  - angular-interceptor-401-refresh-queue
  - cors-angular-aspnet-core
  - aspnet-core-401-vs-403
faq:
  - q: "How do I download a file with Angular HttpClient from ASP.NET Core?"
    a: "Call get with responseType blob and observe response so you can read Content-Disposition. Create an object URL, click a temporary anchor, then revoke the URL. Keep the auth interceptor on that call."
  - q: "Why does upload progress stay at zero?"
    a: "reportProgress only emits HttpEventType.UploadProgress when observe is events. observe body collapses the stream to the final JSON and drops progress. Do not set Content-Type yourself on FormData."
  - q: "Does this replace uploading straight to Azure Blob Storage?"
    a: "No. This page is HttpClient against your API. Direct-to-blob SAS uploads, container layout, and virus scanning stay in the Azure Blob post."
---

**Angular blob download and upload progress** means using `HttpClient` so a secured ASP.NET Core endpoint can stream a file down as a `Blob` and accept a `multipart/form-data` upload while the SPA reports bytes sent. The bearer interceptor still runs. The response is not JSON.


```text
Download: GET /api/files/{id}
  Authorization: Bearer ...
  <- 200, Content-Disposition, body bytes
  Angular: responseType blob -> object URL -> <a download>

Upload: POST /api/files  (FormData)
  events: Sent -> UploadProgress -> Response
  Angular: percent = loaded / total
```

Metaphor: `observe: 'body'` is a courier who only hands you the package at the door. Progress needs the courier to call you from the road. A blob download is a package that is not a letter; if you try to read it as JSON you tear it up.

**New to this** stay here. **Storing bytes in Azure** see [Azure Blob uploads](/blog/azure-blob-aspnet-core-uploads). **401 while the file is in flight** see [401 refresh queue](/blog/angular-interceptor-401-refresh-queue). **Browser calls blocked before they start** see [CORS](/blog/cors-angular-aspnet-core). **401 versus 403** see [401 vs 403](/blog/aspnet-core-401-vs-403).

## How to download a blob with Angular HttpClient from ASP.NET Core

Set `responseType` to `blob` and `observe` to `response` so `Content-Disposition` survives. The bearer interceptor still runs. Upload progress is a later section, not a second download mode.

The Angular app and the ASP.NET Core API already share an auth interceptor that adds `Authorization`. Files are not public CDN links. Downloads are authorized per user (an invoice PDF, an export the user is allowed to see). Uploads land on your API first, even if the API then copies them to blob storage.

Skip this page for anonymous static files under `wwwroot`. Use a normal link. Skip it for multi-gigabyte media: the browser should upload with a SAS URL to storage, which is the blob post, not a `FormData` post through Kestrel.

## Download: ask for a blob and keep the headers

> **Watch:** observe body drops upload progress, and a JSON interceptor will parse a PDF and report failure on a 200. Expose Content-Disposition or the cross-origin save is named download.

The default `responseType` is `json`. A PDF will fail to parse and the subscriber receives an error even when the status was 200. Set `blob`. Use `observe: 'response'` because the filename is in a header, not in the body.

```typescript
download(id: string): Observable<void> {
  return this.http
    .get(`/api/files/${id}`, {
      responseType: "blob",
      observe: "response"
    })
    .pipe(
      tap((res) => {
        const blob = res.body;
        if (!blob) throw new Error("Empty file body");
        const name = fileNameFromDisposition(res.headers.get("Content-Disposition"));
        saveBlob(blob, name);
      }),
      map(() => void 0)
    );
}

function fileNameFromDisposition(header: string | null): string {
  if (!header) return "download";
  const star = /filename\*=(?:UTF-8''|utf-8'')([^;]+)/i.exec(header);
  if (star) return decodeURIComponent(star[1].trim().replace(/"/g, ""));
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : "download";
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

The parser is deliberately small. It handles the `filename*` form ASP.NET Core emits from `File(..., fileDownloadName)` and a simple `filename=`. It is not a full RFC 6266 library. If you need dozens of legacy agents, test those headers explicitly rather than growing a silent regex.

`URL.revokeObjectURL` belongs in a `finalize` if you move the click into the component, otherwise a cancelled subscription leaks the object URL. Revoke after the click, not before: some browsers read the URL asynchronously.

The auth interceptor must clone the GET and set the bearer token the same way it does for JSON. `responseType` does not bypass interceptors. Do not drop down to raw `fetch` unless you also copy the header logic; teams do that once and then wonder why downloads 401.

## Errors are blobs too

> **Watch:** An error body is a blob when responseType is blob. Read it as text before you show a problem document. The download attribute is not authorization.

When `responseType` is `blob`, a 400 ProblemDetails body arrives as a `Blob`, not as an object. A JSON error interceptor that reads `error.error.title` sees nothing.

```typescript
async function readProblem(err: HttpErrorResponse): Promise<{ title?: string; status?: number }> {
  const body = err.error;
  if (body instanceof Blob) {
    const text = await body.text();
    try {
      return JSON.parse(text) as { title?: string; status?: number };
    } catch {
      return { title: text.slice(0, 200), status: err.status };
    }
  }
  return (body ?? {}) as { title?: string; status?: number };
}
```

Call this from the component's error path, or teach the interceptor to await `blob.text()` only when `error.error` is a `Blob` and the content type contains `json` or `problem`. Do not parse every blob; a failed download of a real file should not be JSON-parsed into a mojibake title.

401 during download: the [queue](/blog/angular-interceptor-401-refresh-queue) can retry a blob GET after refresh. The retried request must keep `responseType: 'blob'`. Cloning with `req.clone()` preserves it. Rebuilding the request from `req.url` alone drops it back to JSON.

403 means the user is authenticated and not allowed to see that file. Do not refresh on 403. [401 vs 403](/blog/aspnet-core-401-vs-403) is the status-code rule.

## ASP.NET Core download action

Stream. Do not `File.ReadAllBytes` a large export into a `byte[]` just to return `File(bytes, ...)`.

```csharp
[Authorize]
[HttpGet("{id:guid}")]
public async Task<IActionResult> Download(Guid id, CancellationToken ct)
{
    var file = await _files.FindAsync(id, User, ct);
    if (file is null) return NotFound();

    var stream = await _store.OpenReadAsync(file.StorageKey, ct);
    return File(
        stream,
        file.ContentType,
        fileDownloadName: file.DownloadName,
        enableRangeProcessing: true);
}
```

`File` sets `Content-Disposition: attachment; filename=...; filename*=UTF-8''...` when you pass `fileDownloadName`. `enableRangeProcessing: true` lets the browser request a range if the client supports it. Authorization still runs before the stream opens. Check the current user inside `FindAsync`; do not trust the guid alone. That is the same object-level rule as [BOLA](/blog/prevent-bola-idor-aspnet-core).

If the SPA is on another origin, CORS must expose the header or Angular reads `null`:

```csharp
builder.Services.AddCors(o => o.AddPolicy("spa", p => p
    .WithOrigins("https://app.example.com")
    .AllowAnyHeader()
    .AllowAnyMethod()
    .AllowCredentials()
    .WithExposedHeaders("Content-Disposition")));
```

Without `WithExposedHeaders`, the file still downloads as `download` because the filename was not visible to script. The bytes were fine. The bug is the header.

## Upload progress

`FormData` plus `reportProgress` plus `observe: 'events'`.

```typescript
upload(file: File): Observable<number | { id: string }> {
  const form = new FormData();
  form.append("file", file, file.name);

  return this.http.post<{ id: string }>("/api/files", form, {
    reportProgress: true,
    observe: "events"
  }).pipe(
    map((event) => {
      if (event.type === HttpEventType.UploadProgress) {
        const total = event.total ?? file.size;
        return total > 0 ? Math.round((100 * event.loaded) / total) : 0;
      }
      if (event.type === HttpEventType.Response) {
        return event.body ?? { id: "" };
      }
      return 0;
    })
  );
}
```

Do not set `Content-Type: multipart/form-data` yourself. The browser must add the boundary. A hand-set content type without a boundary makes ASP.NET Core reject the form.

`HttpEventType.Sent` means the request left the client; it is not 100 percent. `UploadProgress.total` can be missing. Fall back to `file.size`. Small files often emit a single progress event at 100. The bar is still correct; do not invent intermediate ticks.

Show the bar from the number events and navigate when the value is an object with `id`. Keep the subscription tied to the component (`takeUntilDestroyed`) so a destroyed dialog does not keep writing progress. Cancelling the subscription aborts the HTTP call if you pass an `HttpContext` token... Angular aborts when the subscriber unsubscribes, which is what you want for a Cancel button.

The interceptor runs on this POST. Refresh-on-401 for a large upload is painful: the queue will resend the entire body. Prefer failing the upload and asking the user to retry after a silent refresh, or refresh on startup and on a timer so the access token will not die mid-upload. Document that choice. Blindly replaying a 200 MB body through the 401 queue looks clever and times out.

## ASP.NET Core upload action

> **Watch:** DisableRequestSizeLimit lets one client pin a worker. Set an explicit cap, and check the owner, not only the route id.

```csharp
[Authorize]
[HttpPost]
[RequestSizeLimit(52_428_800)]
[RequestFormLimits(MultipartBodyLengthLimit = 52_428_800)]
public async Task<IActionResult> Upload(IFormFile? file, CancellationToken ct)
{
    if (file is null || file.Length == 0)
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "File is required");

    if (file.Length > 52_428_800)
        return Results.Problem(statusCode: StatusCodes.Status413PayloadTooLarge, title: "File is too large");

    await using var input = file.OpenReadStream();
    var id = await _store.SaveAsync(input, file.FileName, file.ContentType, User, ct);
    return Results.Ok(new { id });
}
```

Kestrel's `MaxRequestBodySize` must be at least this large or the host rejects the request before the action. IIS `maxAllowedContentLength` and any reverse proxy limit must match. The smallest limit wins, and it often fails as an HTML 404 or a connection reset rather than your ProblemDetails. Set them together and test with a file just over the cap.

Stream `OpenReadStream()` to storage. Buffering `CopyTo` a `MemoryStream` doubles RAM and defeats the point. The Azure side of that stream is [blob uploads](/blog/azure-blob-aspnet-core-uploads). This action's job is auth, the limit, and handing off the stream.

Validate content type with an allow-list you mean (pdf, png, jpeg), and do not trust `file.FileName` for a path. Store a generated key. Virus scanning, if you need it, happens after the stream is stored, not inside this Angular article.

## Pitfalls

- **`observe: 'body'` with `reportProgress: true`.** Progress is dropped. You only get the final DTO and an empty bar.
- **JSON interceptor on every response.** `JSON.parse` on a PDF blob throws and you report failure for a 200. Branch on `responseType` or `Blob`.
- **Forgetting `Content-Disposition` in CORS exposed headers.** The file saves as `download` only on the cross-origin environment. Localhost same-origin hides the bug.
- **`[DisableRequestSizeLimit]`** copied from a forum post. One client can pin a worker with a huge body. Set an explicit cap.
- **Authorization that checks the route id and not the owner.** The download URL is not a secret. See object-level authorization.
- **Revoking the object URL before click**, or never revoking it. Both leak or break the save.
- **Using the download attribute as an auth mechanism.** Anyone who can call the API can download. The attribute only names the file.

## Verification

Download:

1. Sign in. Click download. The network row is GET, status 200, type blob or the file's content type.
2. Request headers include `Authorization`. Response headers include `Content-Disposition` visible to script (console `headers.get`, not only the network panel; the panel shows headers CORS hides from script).
3. The saved name matches the server file name. Task manager does not show the tab holding the file after revoke (object URL count).
4. Call the same GET as another user. Expect 403 or 404, one response, no file on disk.
5. Force a 400 with ProblemDetails. The UI shows `title`, not `[object Blob]`.

Upload:

1. Choose a 5 MB file. The progress handler runs with `loaded` increasing. The last event is `Response` with `{ id }`.
2. The request content type starts with `multipart/form-data; boundary=`.
3. A file over the limit returns 413 from your action or from Kestrel, and the bar stops. The UI does not claim success.
4. Unsubscribe (Cancel). The browser aborts. The API honors `CancellationToken` and does not keep writing the blob.

Integration: `WebApplicationFactory` posts `MultipartFormDataContent` and gets an id; a second client downloads and the first bytes match. An Angular test uses `HttpTestingController`, flushes an `HttpResponse` with a `Blob`, and expects `responseType` to be `blob`.

## What this page does not cover

Container names, SAS tokens, chunked block uploads to Azure, and malware scanning live in the blob post. The 401 replay queue is only referenced so blob retries do not drop `responseType`. Large CSV generation on the server, as a background job, is a different feature than an immediate `FileStreamResult`.

**Related:** [Azure Blob uploads](/blog/azure-blob-aspnet-core-uploads) | [401 refresh queue](/blog/angular-interceptor-401-refresh-queue) | [CORS](/blog/cors-angular-aspnet-core) | [401 vs 403](/blog/aspnet-core-401-vs-403)

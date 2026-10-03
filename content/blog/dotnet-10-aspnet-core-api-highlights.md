---
title: ".NET 10 ASP.NET Core New Features for API Developers"
description: ".NET 10 ASP.NET Core new features for APIs: Minimal API validation, OpenAPI 3.1, cookie 401s, and the transformer compile break after you upgrade."
date: "2026-10-03"
category: "api-design"
tags: ["ASP.NET Core", ".NET 10", "OpenAPI", "Minimal APIs", "Checklist"]
faq:
  - q: "Does .NET 10 replace Swashbuckle with nothing?"
    a: "No. Microsoft.AspNetCore.OpenApi remains the document generator, and in .NET 10 it defaults to OpenAPI 3.1. A UI such as Scalar or Swagger UI is still a separate package. Client generators are still separate."
  - q: "Are the Minimal API validation methods experimental?"
    a: "AddValidation and the built-in validation filter are the stable entry points. Microsoft marked some underlying resolver APIs experimental so they can change. Call the documented AddValidation surface, and check the release notes for your exact patch version."
  - q: "How does this differ from the .NET 9 OpenAPI versus Swashbuckle post?"
    a: "That post chooses a generator and a UI, with .NET 9 as the baseline. This checklist is the .NET 10 delta for people who already ship APIs: validation, 3.1 documents, YAML, auth status codes, and related breaking changes."
---

**.NET 10 ASP.NET Core new features** for API developers are the concrete changes in Minimal APIs, OpenAPI, authentication responses, and JSON handling. This checklist is those items only. It is not a tour of Blazor, and it is not a history of .NET Framework versus .NET Core.

**New to this** -> walk the checklist against one API project. **Related** -> [.NET 9 OpenAPI vs Swashbuckle, NSwag, and Scalar](/blog/dotnet-9-openapi-vs-swashbuckle) if you have not picked a generator yet. **Not this page** -> Angular hosting, Identity cookie design, or a promise that every preview API survived unchanged into the release you installed.

## New features that change an API

Microsoft's "What's new in ASP.NET Core in .NET 10" article is the source of truth, and it moved during previews. Before you adopt a snippet, confirm it against the docs build that matches your installed SDK (`net10.0`, plus the patch you actually run). Where this page is confident, it says what shipped in that article. Where a name might still differ by patch, it says to verify. Nothing here is a Semrush study, and nothing here is a Blazor component catalog.

Target the project at `net10.0`, then walk top to bottom. Skip sections that do not match your host (for example HTTP.sys security descriptors if you are only on Kestrel in a container).

## Minimal API validation

> **Watch:** AddValidation only sees types in the assemblies you register. A silent skip looks like validation is broken. Confirm attribute targets on the SDK you installed, not a preview blog.

- Call `builder.Services.AddValidation()` if you want the runtime to validate DataAnnotations on query, header, and body parameters bound to Minimal API handlers.
- A failed check becomes a 400. If you register an `IProblemDetailsService`, validation errors can flow through that service instead of a one-off error shape. Turn this on so clients see the same problem document as the rest of the API.
- Disable it per endpoint with `DisableValidation()` when a route must accept a payload the attributes would reject (rare; write down why).
- Records and classes both participate. Attributes such as `[Required]` and `[Range]` belong on the record parameters or properties you actually bind.
- The source generator discovers validatable types in the assembly where `AddValidation` runs. If endpoints live in another assembly, follow the docs to register validation from that assembly. A silent skip looks like "validation is broken" and is really a generator boundary.
- Some resolver APIs under the feature were marked experimental after the first .NET 10 previews. The public `AddValidation` entry point and the filter were documented as stable. Do not take a dependency on internal resolver types.
- The validation types moved to the `Microsoft.Extensions.Validation` package and namespace so non-HTTP code can use them. Existing call sites were redirected. If a using fails to compile, retarget the package instead of copying a preview namespace from a blog.
- Empty strings in `[FromForm]` complex objects now bind to null for nullable value types instead of failing the parse. If you treated an empty due date as a validation error, add an explicit rule. The parse will no longer save you.

```csharp
builder.Services.AddValidation();
builder.Services.AddProblemDetails();

app.MapPost("/products", (Product body) => Results.Ok(body));

public record Product(
    [property: Required] string Name,
    [property: Range(1, 1000)] int Quantity);
```

Verify the attribute target (`[property: Required]` versus a parameter attribute) against the language version in your repo. The behavior to test is a missing name returning 400 with a problem body, not the attribute syntax you remember from a preview.

## OpenAPI 3.1 and friends

> **Watch:** A client generator that only reads OpenAPI 3.0 will reject the new default. Custom transformers also fail to compile against Microsoft.OpenApi 2.x even if you pin the document to 3.0.

.NET 9 already centered `Microsoft.AspNetCore.OpenApi`. .NET 10 changes the document, not the reason you picked that package. The comparison of generator versus UI versus NSwag stays on [the .NET 9 OpenAPI post](/blog/dotnet-9-openapi-vs-swashbuckle).

- The default document version is OpenAPI **3.1**, with JSON Schema 2020-12. Nullable values show up as a type union that includes `null`, not as the older `nullable: true` property.
- Integers can render differently when `JsonSerializerOptions.NumberHandling` allows reading numbers from strings (the ASP.NET default). The docs describe a pattern-based schema unless you set number handling to strict. Diff a real document; do not assume every `int` still says `type: integer` the way a 3.0 doc did.
- Pin 3.0 only if clients cannot read 3.1 yet: set `OpenApiOptions.OpenApiVersion` to `OpenApi3_0` in `AddOpenApi`, and the matching `--openapi-version` for build-time generation. Pinning is a compatibility choice, not a moral one.
- Serve YAML by mapping an endpoint whose path ends in `.yaml` or `.yml` (`MapOpenApi("/openapi/{documentName}.yaml")`). JSON is still there if you map it. Build-time YAML was called out as not the same milestone as the runtime endpoint; verify if your pipeline needs a YAML file at build.
- `ProducesResponseType` accepts a `Description` string, and that description is written into the operation response. Use it for the cases clients actually branch on.
- XML doc comments can be pulled into the document when `GenerateDocumentationFile` is true. The generator does not see XML comments on lambdas. Move the handler to a named method if the summary must come from XML.
- The native AOT web API template includes `Microsoft.AspNetCore.OpenApi` unless you pass `--no-openapi`.
- `IOpenApiDocumentProvider` can be injected to read the document outside an HTTP request (background jobs, tests). Confirm the interface name in the API browser for your patch before you build a library on it.
- Transformers can create schemas with `GetOrCreateSchemaAsync` and add them to the document. Endpoint-level operation transformers exist so one route can diverge without a global transformer.
- **Breaking:** `Microsoft.OpenApi` 2.0 types are interfaces (`IOpenApiSchema` and friends). `OpenApiAny` is gone; examples use `JsonNode`. A .NET 9 transformer often fails to compile on `net10.0` even if you pin the OpenAPI version to 3.0. Budget time to rewrite transformers. This is the item that blocks upgrades in real API repos.

```csharp
builder.Services.AddOpenApi(options =>
{
    options.OpenApiVersion = Microsoft.OpenApi.OpenApiSpecVersion.OpenApi3_0;
});
```

That pin is optional. The compile break from OpenAPI.NET 2.x is not optional if you have custom transformers.

`IncludeOpenApiAnalyzers` is deprecated (docs warning `ASPDEPR007`). Plan to stop setting it. If a client generator is strict, diff one sample route for enum forms, JSON Patch media types, and invariant number formatting rather than assuming the .NET 9 document shape.

## Authentication responses and metrics

> **Watch:** Cookie authentication on known API endpoints returns 401 or 403, not a redirect to a login page. Clients that only followed 302s will look logged out.

- Cookie authentication now returns **401 and 403** for known API endpoints instead of redirecting to a login page. Known APIs include `[ApiController]` endpoints, Minimal API endpoints that read or write JSON, endpoints that return `TypedResults`, and SignalR. Browser redirects on `/api/...` were a long-standing client bug.
- If you depended on the redirect, override `OnRedirectToLogin` and `OnRedirectToAccessDenied`. Do that only for endpoints that are actually browsed by humans.
- Authentication and authorization emit metrics (challenge count, forbid count, sign-in, and similar). Identity adds its own meter, `Microsoft.AspNetCore.Identity`, for user creates, sign-ins, and token checks. Wire them to the same OpenTelemetry pipeline you already use. Names are in the ASP.NET Core metrics docs; copy them from there if you alert on them, because this checklist is not the metric registry.

## JSON, redirects, and hosting details that touch APIs

- **JSON Patch on System.Text.Json.** The package is `Microsoft.AspNetCore.JsonPatch.SystemTextJson`. It is not a drop-in replacement for the Newtonsoft implementation. Dynamic types such as `ExpandoObject` are not supported. `ApplyTo` mutates the object even when a later operation fails; the docs tell you to discard the instance on error. Patch documents are an authorization and denial-of-service surface (copy operations, mass assignment). Validate size and protect the route. Do not expose EF entities to patch.
- **PipeReader JSON.** MVC and Minimal APIs read JSON via the PipeReader-based serializer path. A custom `JsonConverter` that ignores `Utf8JsonReader.HasValueSequence` can throw or drop data. The temporary switch is `Microsoft.AspNetCore.UseStreamBasedJsonParsing=true`. Fix the converter.
- **`RedirectHttpResult.IsLocalUrl`** helps you reject off-site redirects. Use it anywhere you turn a query string into a redirect. It does not make an open redirect safe by itself if you forget to call it.
- **Exception handler diagnostics.** Exceptions handled by `IExceptionHandler` are no longer logged as errors by default. `ExceptionHandlerOptions.SuppressDiagnosticsCallback` lets you opt back in. If an alert searched for those error logs, retune it or you will think production went quiet.
- **`.localhost` / `*.dev.localhost`.** Kestrel treats `*.localhost` as loopback, and the .NET 10 dev cert covers `*.dev.localhost`. Re-trust with `dotnet dev-certs https --trust` after the SDK upgrade.
- **Memory pools** used by Kestrel evict idle buffers on their own. A custom `IMemoryPoolFactory` does not get that behavior unless you implement it.
- **Tests and top-level statements.** The SDK emits a public partial `Program` so `WebApplicationFactory` can see the entry point. Remove a handwritten duplicate if the analyzer says it is redundant.
- **HTTP.sys** request-queue security descriptors matter only when that server is the host. Skip them on Linux containers.

Server-Sent Events are in the framework: `TypedResults.ServerSentEvents` accepts an `IAsyncEnumerable<T>` (optional event type) from Minimal APIs or controllers. Pass the request `CancellationToken` so a disconnect stops the stream. SSE is not SignalR: the client does not get a matching call channel. Confirm the generic overload against the docs for your patch before you copy a preview signature.

## Explicitly out of scope

Blazor's .NET 10 work (persistent state, passkeys in the Identity UI, WebAssembly fingerprinting, reconnection) is out of scope unless this API hosts that UI. EF Core 10 and the runtime notes are separate documents. Do not block an API upgrade on them.

## Upgrade order

1. Retarget to `net10.0` and fix package versions (`Microsoft.AspNetCore.OpenApi`, any Swashbuckle build that supports `Microsoft.OpenApi` 2.x, Azure and JSON libraries).
2. Compile. Fix OpenAPI transformers (`JsonNode`, interface types) and any `JsonConverter` that touches raw reader spans.
3. Diff `/openapi/v1.json` against the previous document. Decide 3.1 versus a temporary 3.0 pin. Regenerate clients.
4. Hit one `[ApiController]` or JSON Minimal API anonymously and confirm 401, not a 302 to `/Account/Login`.
5. If you use DataAnnotations on Minimal APIs, add `AddValidation` and test one bad body.
6. Run the integration tests under `WebApplicationFactory`. Delete a redundant `Program` class only if the compiler or analyzer tells you it is unused.
7. Read breaking-change announcements for ASP.NET Core 10, not only this list. The official list is updated when a behavior is found late.

## Pitfalls

- Treating a preview blog as the RTM signature. Verify types in the docs for your patch.
- Shipping OpenAPI 3.1 to a client generator that only parses 3.0, then "fixing" it by hand-editing the generated client.
- Assuming cookie redirects still protect APIs. They do not, on known API endpoints. Clients must handle 401.
- Turning on JSON Patch for an EF model because the package is new and faster. Speed does not fix over-posting.
- Logging handled exceptions twice because you set `SuppressDiagnosticsCallback` back to the old behavior and also log inside `IExceptionHandler`.

## Verification

You can leave the upgrade when: the API builds on the .NET 10 SDK you will deploy, the OpenAPI diff is accepted, one unauthenticated API call returns 401, one invalid Minimal API body returns the problem document you expect, and no transformer or converter remains on a preview type that does not exist in the installed shared framework.

## Boundaries

This is not "what is ASP.NET Core." It is the **.NET 10** delta for HTTP APIs. Generator choice remains [.NET 9 built-in OpenAPI versus Swashbuckle, NSwag, and Scalar](/blog/dotnet-9-openapi-vs-swashbuckle). If a feature you need is absent above, it may still exist -- check the official what's-new article before you invent a workaround or skip the upgrade.


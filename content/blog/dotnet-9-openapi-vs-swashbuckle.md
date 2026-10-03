---
title: ".NET 9 Built-in OpenAPI vs Swashbuckle, NSwag, and Scalar"
description: ".NET 9 built-in OpenAPI versus Swashbuckle: who writes the document, who only draws a UI, and where NSwag or Scalar still fits. Do not run two generators."
date: "2026-10-03"
category: "api-design"
tags: ["ASP.NET Core", "OpenAPI", ".NET 9", "Swashbuckle", "NSwag", "Scalar"]
faq:
  - q: "Did .NET 9 remove Swagger from ASP.NET Core?"
    a: "The Web API template stopped including Swashbuckle. ASP.NET Core still generates an OpenAPI document through Microsoft.AspNetCore.OpenApi. Swagger UI is optional and comes from a UI package you add, not from the shared framework."
  - q: "Is Scalar a replacement for Swashbuckle?"
    a: "Scalar replaces the UI. It reads an OpenAPI document that something else generated. It does not replace NSwag's client generator, and it does not replace document transformers."
  - q: "How does this differ from a .NET 10 API highlights page?"
    a: "This page chooses a generator and a UI on the .NET 9 built-in OpenAPI stack. A .NET 10 highlights page covers later deltas such as OpenAPI 3.1 by default, YAML endpoints, and Minimal API validation. Do not use this slug as that checklist."
---

**Microsoft.AspNetCore.OpenApi versus Swashbuckle, NSwag, and Scalar** means separating three jobs that used to be one NuGet package: producing the OpenAPI document, showing it to humans, and generating clients. In .NET 9 the document job has a first-party library. The other two jobs are still a choice.

**New to this** -> use this comparison to pick a generator and a UI. **Related** -> [.NET 10 API highlights](/blog/dotnet-10-aspnet-core-api-highlights) for what changed after this baseline. **Not this page** -> how to annotate every operation for a public partner portal, and not Entra or Angular login.

## What replaced /swagger

A template upgrade deletes `AddSwaggerGen` and the project no longer has a `/swagger` page. You need to know what replaced it, whether to add Swashbuckle back, and where NSwag and Scalar fit. This is that decision. It assumes .NET 9 unless a sentence says otherwise.

## The four names, without the marketing

**Microsoft.AspNetCore.OpenApi** (package, also brought in by the .NET 9 Web API templates) registers services with `AddOpenApi` and exposes a document with `MapOpenApi`. The default URL is `/openapi/v1.json`. It uses `System.Text.Json` metadata, works with Minimal APIs and controllers, and is the path that stays compatible with native AOT. In the .NET 9 generation, documents are OpenAPI 3.0 unless you are on a later runtime that changed the default. UI is not included.

**Swashbuckle.AspNetCore** generates a document with Swashbuckle filters and, in the same package family, serves Swagger UI. This is what templates used before .NET 9. It is still valid. You keep it when you depend on `ISchemaFilter`, `IOperationFilter`, `IDocumentFilter`, or Swagger UI features you have already customized. You do not need it just to have a JSON document.

**NSwag** can generate a document (NSwag.AspNetCore) and can generate C# or TypeScript clients from a document (NSwag.MSBuild, NSwagStudio, or the CLI). Teams often keep NSwag for the second job even after they stop using it as middleware. Mixing two middleware generators in one app (Swashbuckle and NSwag and the built-in package all serving different URLs) is how you publish three contradictory contracts.

**Scalar** (Scalar.AspNetCore) is a UI. You point it at the document URL. It does not discover your endpoints by itself. If `MapOpenApi` is missing, Scalar has nothing to render.

A phrase to keep: **generator, viewer, codegen**. Most "Swagger versus Scalar" arguments are viewer arguments. Most build breaks are generator arguments.

## What the .NET 9 template is doing

> **Watch:** A new .NET 9 Web API does not serve /swagger until you add a UI. The document is /openapi/v1.json.

A new Minimal API on .NET 9 looks like this in substance:

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapGet("/api/invoices/{id:guid}", (Guid id) =>
{
    return TypedResults.Ok(new InvoiceDto(id, "Open"));
})
.WithName("GetInvoice")
.WithTags("Invoices")
.WithSummary("Get one invoice by id.")
.Produces<InvoiceDto>(StatusCodes.Status200OK)
.ProducesProblem(StatusCodes.Status404NotFound);

app.Run();

public sealed record InvoiceDto(Guid Id, string Status);
```

`MapOpenApi` is inside `IsDevelopment` on purpose. A production document can leak internal routes, error shapes, and remarks you wrote for yourself. If partners need a contract, publish a reviewed document from CI (build-time generation) or expose the endpoint behind authentication. Do not leave an anonymous UI on the internet because the dev box had one.

`WithName`, `WithSummary`, `WithTags`, and `Produces` are endpoint metadata. The built-in generator reads them. `TypedResults.Ok<InvoiceDto>` already tells the generator the 200 JSON shape. You do not need a Swashbuckle `[SwaggerResponse]` attribute for that case.

Controllers keep using `[ProducesResponseType]`, `[Tags]`, and XML comments if you enable documentation generation. The built-in package understands those attributes. You do not rewrite controllers into Minimal APIs just to get a document.

## Transformers replace Swashbuckle filters

> **Watch:** Swashbuckle filters and built-in document transformers are different types. Running two generators means clients will not agree which file is canonical.

When the document is almost right, customize it with transformers instead of a schema filter. The .NET 9 APIs are `AddDocumentTransformer`, `AddOperationTransformer`, and `AddSchemaTransformer` on `OpenApiOptions`.

```csharp
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi.Models;

builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer((document, context, cancellationToken) =>
    {
        document.Info = new OpenApiInfo
        {
            Title = "Portfolio API",
            Version = "v1"
        };
        return Task.CompletedTask;
    });

    options.AddOperationTransformer((operation, context, cancellationToken) =>
    {
        // Security requirement shape differs once Microsoft.OpenApi 2.x
        // is on the compile path (.NET 10). Keep this transformer on the
        // Microsoft.OpenApi version your TFM actually references.
        operation.Description ??= "Portfolio operation.";
        return Task.CompletedTask;
    });
});
```

Document the bearer scheme in a transformer only if callers need it in the UI. The transformer edits the document. It does not authenticate anyone. The API still needs `AddAuthentication` and `RequireAuthorization`.

If you already own a pile of `ISchemaFilter` classes, staying on Swashbuckle until you port them is a reasonable project plan. Porting is mechanical but not free: filters see Swashbuckle types; transformers see `Microsoft.OpenApi` types. Do not run Swashbuckle and `MapOpenApi` against the same routes and then hand clients whichever URL happened to be bookmarked.

## Side-by-side

> **Watch:** Scalar replaces the UI only. It does not generate clients, and it does not replace document transformers.

| Need | Prefer | Why |
| --- | --- | --- |
| JSON document on .NET 9, Minimal APIs, AOT-friendly | `Microsoft.AspNetCore.OpenApi` | First-party, template default, `System.Text.Json` |
| Existing Swashbuckle filters and Swagger UI you will not rewrite this quarter | Swashbuckle | Lowest migration cost |
| TypeScript or C# client checked in on build | NSwag or Kiota, fed by one document | Codegen is a separate pipeline |
| A readable UI for the dev team | Scalar or Swagger UI | Both are viewers |
| Two generators "just in case" | Neither | Conflicting contracts |

NSwag client generation from the built-in document is a normal pairing:

1. `dotnet build` the API.
2. Fetch `https://localhost:port/openapi/v1.json` or, better, emit the file at build time so CI does not have to boot the site.
3. Run NSwag's `openapi2tsclient` or the C# generator against that file.
4. Fail the build if the spec URL 404s.

Do not hand-edit the generated client and also hand-edit the document. The document is the source.

Scalar registration is a viewer on top of `MapOpenApi`. The exact extension method name depends on the Scalar package version you restore; the durable part is the document path. A typical development setup enables the UI only in Development and points it at `/openapi/v1.json`. If the package's quick start differs, follow that package's readme for the method name, not a blog snippet from a random year. The decision is still "Scalar displays, it does not generate."

## Swashbuckle, if you keep it

Pin a Swashbuckle version that supports the `Microsoft.OpenApi` major version on your target framework. .NET 9's move, and the later Microsoft.OpenApi 2.x line, broke older Swashbuckle builds at compile time (`OpenApiSecurityScheme` and similar types moved). "Add Swashbuckle back" means "add a current Swashbuckle," not the 5.x package copied from a 2021 gist.

If Swagger UI and Scalar are both on, pick one public URL for humans so support does not debug the wrong viewer. Both can read the same JSON.

Turn on `GenerateDocumentationFile` only when you are ready to fix missing-comment warnings. XML comments improve the document. They also fail CI if you treat warnings as errors and only commented half the controllers.

## What the built-in generator will not do

- It will not invent business descriptions you did not put in metadata or XML comments. Empty summaries are a content problem.
- It will not hide an endpoint that is mapped. Remove the map, add an environment check, or filter in a document transformer. Security through an unpublished UI is not security.
- It will not keep a second contract for your Angular models unless you generate those models. Drift between a hand-written TypeScript interface and the document is still drift. See client generation above.
- It will not choose OpenAPI 3.1 features for you on the .NET 9 default. Nullable schema style, YAML output, and `Microsoft.OpenApi` 2.x transformer breaks are later-runtime topics. Check the [.NET 10 highlights](/blog/dotnet-10-aspnet-core-api-highlights) before you copy a 3.1 transformer sample into a `net9.0` project.

## A practical migration order

1. Add `Microsoft.AspNetCore.OpenApi` if the project does not already reference it. Call `AddOpenApi` and `MapOpenApi` in Development.
2. Hit `/openapi/v1.json` and diff it against the old `/swagger/v1/swagger.json` for path coverage, auth scheme, and the two or three DTOs partners actually use.
3. Re-home document title, servers, and security scheme into transformers.
4. Point Scalar or Swagger UI at the new URL.
5. Point NSwag at the new file. Regenerate clients. Fix compile errors in the client project before you delete Swashbuckle.
6. Remove Swashbuckle when nothing references `AddSwaggerGen`. Leaving both "for one sprint" usually becomes permanent.

Diff the documents. Do not eyeball the UI. UIs collapse `oneOf` and nullable in ways that hide a breaking schema change.

## Pitfalls

- **Expecting `/swagger` after a .NET 9 template.** The new path is `/openapi/v1.json` until you add a UI.
- **`MapOpenApi` in all environments** with remarks that include internal hostnames.
- **Two generators.** Clients and reviewers will not agree which file is canonical.
- **Disabling schema validation in the generator** to silence a cycle in a domain entity. Do not put EF entities in the document. Return a DTO. Cycles are a model problem.
- **Confusing Scalar's "try it" console with authorization.** The console sends whatever token you paste. It is not a substitute for integration tests.
- **Using Swashbuckle `WithOpenApi` samples and the built-in package interchangeably.** Similar names, different types. Compile against the package you registered.
- **Native AOT plus an old Swashbuckle.** If AOT is a requirement, prefer the built-in generator; it is the one the AOT web API template is aligned with. Confirm with a published trimmed build, not only with `dotnet run`.

## Verification

- Development: `/openapi/v1.json` returns a document whose `openapi` field matches the major you think you generate (3.0.x on the .NET 9 default).
- Every public route you intend to support appears once. Experimental routes do not.
- A known DTO shows the properties and nullability you serialize, not the EF navigation properties.
- The UI you chose loads that URL and can call one authorized endpoint with a real bearer token.
- CI regenerates clients from the same document and the client project builds.
- Production does not expose the UI anonymously unless you meant to publish a public contract.

## Boundaries

Older write-ups that only show `AddSwaggerGen` are describing Swashbuckle, not the .NET 9 built-in shift. This page is the comparison. Feature deltas that landed in ASP.NET Core for .NET 10 -- OpenAPI 3.1 as the default, serving YAML, XML comment source generation, Minimal API `AddValidation` -- belong on [.NET 10 ASP.NET Core feature highlights](/blog/dotnet-10-aspnet-core-api-highlights). Use that page when the question is "what did the framework add," and this page when the question is "which package should produce and display the contract."

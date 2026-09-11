---
title: "Swagger vs OpenAPI in ASP.NET Core — Swashbuckle, NSwag, and Scalar"
description: "Swagger vs OpenAPI in ASP.NET Core — Swashbuckle, built-in OpenAPI (.NET 9+), Scalar, NSwag, JWT in Swagger UI, FluentValidation envelopes, and Angular codegen."
date: "2026-09-12"
updated: "2026-09-13"
category: "api-design"
tags: ["Swagger", "OpenAPI", "ASP.NET Core", "Swashbuckle", "NSwag", "Scalar", "Web API", ".NET", "Angular"]
related:
  - api-design-principles
  - aspnet-core-api-validation
  - aspnet-core-minimal-apis
  - angular-dotnet-integration
  - aspnet-core-jwt-auth
  - aspnet-core-middleware-order
faq:
  - q: "What is the difference between Swagger and OpenAPI?"
    a: "OpenAPI is the specification (the contract JSON/YAML file). Swagger is the tooling ecosystem — Swagger UI, Swagger Editor, Swagger Hub — and the colloquial name people still use for the file itself. In ASP.NET Core you generate an OpenAPI 3 document and browse it with Swagger UI, Scalar, or NSwag."
  - q: "Swagger vs OpenAPI — which term should I use?"
    a: "Say OpenAPI 3.x for the machine-readable document and Swagger UI when you mean the browser explorer. Job posts still say Swagger; Microsoft docs say OpenAPI. Your README should name both so search and onboarding align."
  - q: "OpenAPI vs Swagger — is it the same thing?"
    a: "Same comparison, words reversed. OpenAPI is the standard; Swagger is the brand and tools. The spec file is openapi.json; the lobby piano is Swagger UI."
  - q: "OpenAPI or Swagger on a README?"
    a: "Write: We publish OpenAPI 3; browse at /scalar (Development) or import openapi.json from CI. Name both terms so onboarding and job-post vocabulary align."
  - q: "Is Swashbuckle.AspNetCore still supported?"
    a: "Yes — Swashbuckle.AspNetCore 10.x supports .NET 10 with opt-in OpenAPI 3.1. .NET 9+ templates ship Microsoft.AspNetCore.OpenApi instead of Swashbuckle by default. You can keep full Swashbuckle, use built-in generation + Scalar, or hybrid built-in spec + Swagger UI only."
  - q: "What are Swagger alternatives in .NET?"
    a: "Built-in OpenAPI (MapOpenApi), Scalar for a modern UI, NSwag for spec + client generation, Redoc for read-only partner docs, Postman import, and .http files in Visual Studio. Swagger UI remains the most recognized explorer."
  - q: "How do I add Swagger to ASP.NET Core?"
    a: "Controllers: AddEndpointsApiExplorer + AddSwaggerGen (Swashbuckle) or AddOpenApi + MapOpenApi (.NET 9+). Minimal APIs: same services; metadata from WithSummary, Produces, or operation transformers. Map Swagger UI or Scalar only in Development unless you protect it."
  - q: "How do I use swashbuckle asp net core on .NET 10?"
    a: "dotnet add package Swashbuckle.AspNetCore, then AddSwaggerGen, UseSwagger, UseSwaggerUI. Or install only Swashbuckle.AspNetCore.SwaggerUi and point it at /openapi/v1.json from Microsoft.AspNetCore.OpenApi — spec from Microsoft, UI from Swashbuckle."
  - q: "OpenAPI vs Swagger 2.0 — what changed?"
    a: "OpenAPI 3.x uses requestBody, components/schemas, nullable, and oneOf/anyOf. Swagger 2.0 used in: body parameters and definitions. Modern ASP.NET Core emits OpenAPI 3; use SerializeAsV2 only for legacy gateways."
  - q: "What is swagger version in ASP.NET Core?"
    a: "The document version is OpenAPI 3.0 (.NET 9 default) or 3.1 (.NET 10 default). The URL path version (v1, v2) is your API versioning strategy — separate concern."
  - q: "How do I test JWT in Swagger UI?"
    a: "Add a Bearer security scheme in AddSwaggerGen or document security in OpenAPI transformers. Click Authorize, paste the access token without the Bearer prefix. Swagger bypasses CORS — a green Authorize button does not prove Angular works."
  - q: "What is the opposite of Swagger?"
    a: "No standard antonym — people mean undocumented HTTP, ad-hoc Postman folders, or gRPC without a contract story. For REST .NET APIs, skipping OpenAPI is the risky path."
  - q: "Does swagger net mean something specific?"
    a: "It is how people search for Swagger in .NET — same topic as Swashbuckle, MapOpenApi, and Scalar on ASP.NET Core Web APIs."
---

## Definition

**Swagger** and **OpenAPI** describe the same workflow with different words: your ASP.NET Core app exposes HTTP endpoints; a tool reflects them into an **OpenAPI document** (`openapi.json`); humans browse that document in **Swagger UI** or **Scalar**; Angular and partners consume the same file for typed clients. Since **.NET 9**, Microsoft generates the document with **`Microsoft.AspNetCore.OpenApi`** — **`Swashbuckle.AspNetCore`** is no longer in the template, but it is not deleted from NuGet.

_Article sections — jump links for screen readers and keyboard users._

| You need… | Start here |
|---|---|
| Vocabulary (Swagger vs OpenAPI) | [Same family, different words](#swagger-vs-openapi-same-family-different-words) |
| Pick Swashbuckle, Scalar, or NSwag | [Decision matrix](#which-stack-should-you-use-decision-matrix) |
| .NET 9/10 default path | [Built-in OpenAPI + Scalar](#path-2-built-in-openapi-scalar-net-9-net-10) |
| Keep familiar Swagger UI | [Hybrid: built-in spec + Swagger UI only](#path-0-hybrid-built-in-openapi-swagger-ui-only) |
| Angular contract + validation | [FluentValidation in the spec](#keep-openapi-aligned-with-fluentvalidation-and-problemdetails) |
| Production / Azure | [Never ship public Swagger by accident](#production-swagger-is-not-a-feature-flag-you-forget) |

Think of it like **sheet music vs the piano in the lobby**. **OpenAPI** is the score every musician (Angular, mobile, Azure API Management) reads from the same page. **Swagger UI** is the piano — fine for trying a few notes in Development, not a substitute for browser-testing the SPA.

```text
Your C# endpoints + DTOs
        │
        ▼
  OpenAPI document (openapi.json)  ← the contract file
        │
        ├── Swagger UI / Scalar     ← humans click Try it out
        ├── NSwag / OpenAPI Generator ← Angular TypeScript clients
        └── Azure API Management    ← partners import the same file
```

**New to this** → stay here. **Migrating from Swashbuckle** → [step-by-step migration](#migrate-from-swashbuckle-to-built-in-openapi). **Angular contract** → [FluentValidation + ProblemDetails in the spec](#keep-openapi-aligned-with-fluentvalidation-and-problemdetails). **Production** → [security checklist](#production-swagger-is-not-a-feature-flag-you-forget). **Interview** → [If an interviewer asks](#if-an-interviewer-asks).

Every Angular + ASP.NET Core rescue I walk into has the same Monday standup: frontend expected `{ items, totalCount }`, backend returned a bare array, and both sides pointed at Swagger like it was a signed contract. Swagger is a **printed menu** — useful only when it matches what the kitchen serves. This guide is the full stack: vocabulary, Swagger-in-.NET package choices, JWT in the explorer, keeping the spec honest when [FluentValidation](/blog/aspnet-core-api-validation) owns your error envelope, and not exposing `/swagger` on a misconfigured App Service.

## Swagger vs OpenAPI: same family, different words

_Swagger vs OpenAPI vocabulary._

| Term | What it actually is |
|---|---|
| **OpenAPI** | The open specification for describing HTTP APIs (**OpenAPI 3.1** on .NET 10, **3.0** on .NET 9). The file is `openapi.json` or `openapi.yaml`. |
| **Swagger** | Brand and tools from SmartBear — **Swagger UI**, Swagger Editor, Swagger Hub. Colloquially people still say “Swagger spec” for an OpenAPI file. |
| **Swashbuckle** | Community NuGet package **`Swashbuckle.AspNetCore`**: generates OpenAPI from your routes and can host **Swagger UI**. Name from the old .NET templates — not SmartBear. `dotnet add package Swashbuckle.AspNetCore` |

**Swagger vs OpenAPI** in interview rooms: OpenAPI is the standard; Swagger is the tooling ecosystem. **OpenAPI vs Swagger** is the same comparison with the words reversed.

**OpenAPI or Swagger** on a README? I write: “We publish **OpenAPI 3**; browse it at `/scalar` (Development) or download `openapi.json` from CI.” That names the standard and the explorer without mixing them up.

## OpenAPI 3.x vs Swagger 2.0 (swagger version)

Older gateways and Power Platform imports still say **Swagger 2.0**. Modern ASP.NET Core APIs emit **OpenAPI 3.x**.

_OpenAPI 3.x compared with Swagger 2.0._

| Area | Swagger 2.0 | OpenAPI 3.x |
|---|---|---|
| Request body | `in: body` parameter | `requestBody` with content types |
| Reusable models | `definitions` | `components/schemas` |
| One endpoint, multiple bodies | Painful | `oneOf` / `anyOf` |
| Nullable | `x-nullable` hacks | `nullable: true` |
| JSON Schema | Draft 4 | Draft 2020-12 (3.1) |

If a corporate gateway only imports Swagger 2, add a conversion step or push the gateway team toward 3.0 — do not downgrade your ASP.NET Core app unless you must. Swashbuckle still supports `SerializeAsV2` for legacy:

```csharp
options.SwaggerDoc("v1", new OpenApiInfo { Title = "Clinic API", Version = "v1" });
// Legacy gateway only:
// options.SerializeAsV2 = true;
```

## Why .NET dropped Swagger from the template (and what that means for you)

For years the default Swagger-in-.NET setup was three lines everyone memorized:

1. `Swashbuckle.AspNetCore.SwaggerGen`
2. `Swashbuckle.AspNetCore.SwaggerUI`
3. Browse `/swagger`

**Swashbuckle** had maintenance gaps around .NET 8; Microsoft shipped **`Microsoft.AspNetCore.OpenApi`** as the first-party generator. **.NET 9** templates use `AddOpenApi()` + `MapOpenApi()` instead of `AddSwaggerGen()`. **.NET 10** defaults to **OpenAPI 3.1** documents with richer transformer APIs and Native AOT compatibility.

**Swagger is not dead.** `Swashbuckle.AspNetCore` 10.x is actively maintained. Microsoft removed it from the **template**, not from NuGet. Three valid responses:

1. **Greenfield .NET 9/10** → built-in `AddOpenApi` + **Scalar** (or Redoc for public docs).
2. **Existing Swashbuckle investment** → keep `AddSwaggerGen` until you have a migration window.
3. **Hybrid** → built-in spec at `/openapi/v1.json` + **Swagger UI only** package (no Swashbuckle generator).

The mistake I see on freelance rescues: copying a .NET 8 `Program.cs` into a .NET 10 repo “because Swagger broke,” then running **both** generators and wondering why two JSON files disagree.

## Package map (.NET 8, 9, 10)

_OpenAPI and Swagger NuGet packages for ASP.NET Core._

| Package | Role | When |
|---|---|---|
| `Microsoft.AspNetCore.OpenApi` | Built-in document generation (.NET 9+) | Default for new APIs |
| `Swashbuckle.AspNetCore` | Generator + Swagger UI | Legacy apps, heavy custom filters |
| `Swashbuckle.AspNetCore.SwaggerUi` | UI only, points at `/openapi/v1.json` | Teams that want familiar UI on built-in spec |
| `Scalar.AspNetCore` | Modern explorer | Default UI I recommend for new work |
| `NSwag.AspNetCore` | Spec + optional UI + MSBuild codegen | Angular monorepos with generated clients |
| `NSwag.MSBuild` | CI client generation | Same repo API + Angular |

Install examples:

```bash
# Built-in (already in .NET 9+ Web API template)
# dotnet add package Microsoft.AspNetCore.OpenApi

# Full Swashbuckle
dotnet add package Swashbuckle.AspNetCore

# Hybrid UI only
dotnet add package Swashbuckle.AspNetCore.SwaggerUi

# Scalar
dotnet add package Scalar.AspNetCore

# NSwag
dotnet add package NSwag.AspNetCore
dotnet add package NSwag.MSBuild
```

## Which stack should you use? (decision matrix)

_Which OpenAPI stack to choose — Swashbuckle, Scalar, NSwag, or built-in only._

| Stack | Document | UI | Best for | When not |
|---|---|---|---|---|
| **Built-in OpenAPI + Scalar** | `Microsoft.AspNetCore.OpenApi` | Scalar | New .NET 9/10 APIs, Angular teams | You need Swashbuckle-only filters today |
| **Built-in OpenAPI + Swagger UI** | Built-in | `Swashbuckle.AspNetCore.SwaggerUi` | Familiar UI, fewer packages than full Swashbuckle | You want Scalar’s schema panel |
| **Full Swashbuckle** | Swashbuckle | Swagger UI | Existing `IOperationFilter` investments | Greenfield without a reason |
| **NSwag** | NSwag | Swagger UI / ReDoc | **TypeScript client in CI** | Tiny API, hand-written interfaces |
| **Built-in, no UI in prod** | Built-in | None | Internal APIs, security-first | Onboarding devs who need Try it out |
| **Redoc** | Any generator | Redoc (read-only) | Partner-facing docs portal | Interactive JWT testing |

Worth knowing besides Swagger UI: Scalar, Redoc, Postman (import OpenAPI), Visual Studio **.http** files, and **Endpoints Explorer**. None replace the machine-readable spec — they replace the lobby piano.

My default on a new healthcare SaaS API: **built-in OpenAPI + Scalar** in Development, **`openapi.json` artifact in CI** for Angular codegen, **no public UI** on the App Service host.

## Path 0 — Hybrid: built-in OpenAPI + Swagger UI only

The path Tim Deschryver and Microsoft docs recommend when your team wants **Swagger UI** but not a second OpenAPI generator — common when migrating from older **Swashbuckle** templates.

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
builder.Services.AddOpenApi(); // Microsoft generates /openapi/v1.json

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();

    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/openapi/v1.json", "Clinic API v1");
        options.RoutePrefix = "swagger";
    });
}

app.MapControllers();
app.Run();
```

```bash
dotnet add package Microsoft.AspNetCore.OpenApi
dotnet add package Swashbuckle.AspNetCore.SwaggerUi
```

One generator. Familiar `/swagger` URL. No duplicate schemas from `AddSwaggerGen` + `AddOpenApi` fighting each other.

`Properties/launchSettings.json`:

```json
"https": {
  "commandName": "Project",
  "launchBrowser": true,
  "launchUrl": "swagger",
  "applicationUrl": "https://localhost:7153;http://localhost:5231",
  "environmentVariables": {
    "ASPNETCORE_ENVIRONMENT": "Development"
  }
}
```

Environment pitfalls: [appsettings and ASPNETCORE_ENVIRONMENT](/blog/aspnet-core-appsettings-localappsettings).

## Path 1 — Swashbuckle.AspNetCore (full stack)

Still the familiar full-**Swashbuckle** path from older templates. Works on **.NET 8**, **.NET 9**, and **.NET 10** when you add the package explicitly.

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Clinic Scheduling API",
        Version = "v1",
        Description = "OpenAPI 3 — browsed via Swagger UI at /swagger"
    });

    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Paste access token only (no 'Bearer ' prefix)."
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });

    options.OperationFilter<ProblemDetailsOperationFilter>();
    options.SchemaFilter<FluentValidationSchemaFilter>();

    var xml = Path.Combine(AppContext.BaseDirectory, "Clinic.Api.xml");
    if (File.Exists(xml))
        options.IncludeXmlComments(xml, includeControllerXmlComments: true);
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "Clinic API v1");
        options.RoutePrefix = "swagger";
    });
}

app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();
```

Enable XML comments in the API `.csproj`:

```xml
<PropertyGroup>
  <GenerateDocumentationFile>true</GenerateDocumentationFile>
  <NoWarn>$(NoWarn);1591</NoWarn>
</PropertyGroup>
```

### Swashbuckle filters that save Angular teams

Document **400** with your real validation envelope so codegen does not assume every error is a string:

```csharp
public sealed class ProblemDetailsOperationFilter : IOperationFilter
{
    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        if (operation.RequestBody is null) return;

        operation.Responses.TryAdd("400", new OpenApiResponse
        {
            Description = "Validation failed — same envelope as model binding",
            Content = new Dictionary<string, OpenApiMediaType>
            {
                ["application/problem+json"] = new OpenApiMediaType
                {
                    Schema = context.SchemaGenerator.GenerateSchema(
                        typeof(HttpValidationProblemDetails), context.SchemaRepository)
                }
            }
        });
    }
}
```

### Complete controller example (pagination + documented errors)

What Mukesh’s tutorials show with a bare `BrandsController`, I want on every PR that touches Angular:

```csharp
[ApiController]
[Route("api/v1/clinics/{clinicId:guid}/appointments")]
[Authorize]
[Produces("application/json")]
public sealed class AppointmentsController : ControllerBase
{
    private readonly IMediator _mediator;

    public AppointmentsController(IMediator mediator) => _mediator = mediator;

    /// <summary>List appointments for a clinic (paged).</summary>
    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<AppointmentListItemDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<PagedResult<AppointmentListItemDto>>> List(
        Guid clinicId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
        => Ok(await _mediator.Send(new ListAppointmentsQuery(clinicId, page, pageSize), ct));

    /// <summary>Book an appointment.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(AppointmentDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(HttpValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<AppointmentDto>> Create(
        Guid clinicId,
        [FromBody] CreateAppointmentRequest request,
        CancellationToken ct)
    {
        var dto = await _mediator.Send(
            new CreateAppointmentCommand(clinicId, request), ct);
        return CreatedAtAction(nameof(GetById), new { clinicId, id = dto.Id }, dto);
    }

    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(AppointmentDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<AppointmentDto>> GetById(
        Guid clinicId, Guid id, CancellationToken ct)
    {
        var dto = await _mediator.Send(new GetAppointmentQuery(clinicId, id), ct);
        return dto is null ? NotFound() : Ok(dto);
    }
}

public sealed record PagedResult<T>(
    IReadOnlyList<T> Items,
    int TotalCount,
    int Page,
    int PageSize);
```

Angular searches for `{ items, totalCount }` — `PagedResult<T>` matches when the spec lists property names explicitly. Bare arrays in OpenAPI teach the wrong client code.

## Path 2 — Built-in OpenAPI + Scalar (.NET 9 / .NET 10)

The stack Microsoft steers new .NET 9+ projects toward:

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi("v1", options =>
{
    options.AddDocumentTransformer((document, context, ct) =>
    {
        document.Info = new()
        {
            Title = "Clinic Scheduling API",
            Version = "v1",
            Description = "OpenAPI 3.1 — generated by Microsoft.AspNetCore.OpenApi"
        };
        return Task.CompletedTask;
    });

    options.AddOperationTransformer(async (operation, context, ct) =>
    {
        // Document 400 for any endpoint with a request body
        if (operation.RequestBody is not null)
        {
            operation.Responses.TryAdd("400", new OpenApiResponse
            {
                Description = "Validation failed (ProblemDetails + errors dictionary)"
            });
        }
        await Task.CompletedTask;
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi(); // /openapi/v1.json

    app.MapScalarApiReference(options =>
    {
        options.WithTitle("Clinic API");
        options.WithOpenApiRoutePattern("/openapi/{documentName}.json");
        options.WithTheme(ScalarTheme.Moon);
    });
}

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();
```

```bash
dotnet add package Scalar.AspNetCore
```

Scalar is a strong **Swagger UI** alternative — faster navigation, better schemas panel, same underlying **OpenAPI** file. Launch URL: `scalar/v1` in `launchSettings.json`.

### YAML document (.NET 10)

Some teams prefer YAML in git (readable diffs, AWS API Gateway imports):

```csharp
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi(); // JSON at /openapi/v1.json
    app.MapOpenApi("/openapi/{documentName}.yaml"); // YAML variant when supported
}
```

Check your target framework’s release notes — YAML export matured in .NET 10.

### Minimal APIs with built-in OpenAPI

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddOpenApi();

var app = builder.Build();

var orders = app.MapGroup("/api/orders")
    .WithTags("Orders");

orders.MapGet("/{id:guid}", async (Guid id, IOrderService svc, CancellationToken ct) =>
{
    var order = await svc.GetAsync(id, ct);
    return order is null ? Results.NotFound() : Results.Ok(order);
})
.WithName("GetOrder")
.WithSummary("Get order by id")
.Produces<OrderDto>(StatusCodes.Status200OK)
.Produces(StatusCodes.Status404NotFound);

orders.MapPost("/", async (CreateOrderRequest body, IValidator<CreateOrderRequest> validator, IOrderService svc, CancellationToken ct) =>
{
    var result = await validator.ValidateAsync(body, ct);
    if (!result.IsValid)
        return Results.ValidationProblem(result.ToDictionary());

    var created = await svc.CreateAsync(body, ct);
    return Results.Created($"/api/orders/{created.Id}", created);
})
.WithSummary("Create order")
.Produces<OrderDto>(StatusCodes.Status201Created)
.ProducesValidationProblem();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.Run();
```

In .NET 10, `WithOpenApi()` on individual routes is deprecated in favor of `AddOpenApiOperationTransformer` when you need per-route surgery. Prefer `WithSummary`, `Produces`, and `ProducesValidationProblem` for the 90% case.

Full Minimal API patterns: [ASP.NET Core Minimal APIs](/blog/aspnet-core-minimal-apis).

## Path 3 — NSwag (spec + Angular TypeScript client)

When your toolchain must include **code generation**, NSwag is the **.NET-native** choice.

```csharp
builder.Services.AddControllers();
builder.Services.AddOpenApiDocument(config =>
{
    config.Title = "Clinic API";
    config.Version = "v1";
    config.AddSecurity("Bearer", Array.Empty<string>(), new OpenApiSecurityScheme
    {
        Type = OpenApiSecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = OpenApiSecurityApiKeyLocation.Header,
        Name = "Authorization"
    });
    config.OperationProcessors.Add(new AspNetCoreOperationSecurityScopeProcessor("Bearer"));
});

var app = builder.Build();
app.UseOpenApi();    // /swagger/v1/swagger.json (NSwag default path)
app.UseSwaggerUi();  // optional — or use Scalar pointing at NSwag JSON
app.MapControllers();
```

**nswag.json** (run on build or in CI):

```json
{
  "runtime": "Net90",
  "documentGenerator": {
    "aspNetCoreToOpenApi": {
      "project": "Clinic.Api.csproj",
      "output": "openapi.json"
    }
  },
  "codeGenerators": {
    "openApiToTypeScriptClient": {
      "className": "ClinicApiClient",
      "template": "Angular",
      "output": "../clinic-portal/src/app/api/clinic-api-client.ts",
      "injectionTokenType": "InjectionToken",
      "useSingletonProvider": true
    }
  }
}
```

**Clinic.Api.csproj**:

```xml
<Target Name="NSwag" AfterTargets="Build" Condition="'$(Configuration)' == 'Debug'">
  <Exec Command="$(NSwagExe_Net90) run nswag.json" />
</Target>
```

One pipeline: ASP.NET Core builds the spec, Angular gets a typed client. When the C# DTO changes, CI fails until someone regenerates — that is a feature, not friction.

## Path 4 — Redoc (read-only partner docs)

Redoc is the right read-only choice when docs are **customer-facing** (Stripe-style) and you do not want Try it out on production.

```csharp
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapGet("/docs", async context =>
    {
        context.Response.ContentType = "text/html";
        await context.Response.WriteAsync("""
            <!DOCTYPE html>
            <html>
            <head>
              <title>Clinic API</title>
              <meta charset="utf-8"/>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <link href="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.css" rel="stylesheet">
            </head>
            <body>
              <redoc spec-url='/openapi/v1.json'></redoc>
              <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
            </body>
            </html>
            """);
    });
}
```

Host Redoc on a static site behind Entra ID for partners; keep the API host UI-free.

## Migrate from Swashbuckle to built-in OpenAPI

Step-by-step for a live API without a big-bang PR:

1. **Add** `Microsoft.AspNetCore.OpenApi` and call `AddOpenApi()` alongside existing `AddSwaggerGen()` — temporary dual output is OK in a feature branch.
2. **Diff** `/swagger/v1/swagger.json` vs `/openapi/v1.json` — fix missing `ProducesResponseType`, XML comments, and security schemes on the built-in side.
3. **Port filters** — `IOperationFilter` → `AddOperationTransformer`; `ISchemaFilter` → `AddSchemaTransformer` (names vary by version; check Microsoft docs for your TFMs).
4. **Switch UI** — `UseSwaggerUI(o => o.SwaggerEndpoint("/openapi/v1.json", "v1"))` or Scalar.
5. **Remove** `AddSwaggerGen`, `UseSwagger`, and Swashbuckle package references when the diff is clean.
6. **CI** — publish `openapi.json` as a build artifact; fail Angular build if codegen drifts.

Do not ship dual generators to Production.

## Keep OpenAPI aligned with FluentValidation and ProblemDetails

If the OpenAPI schema marks a field optional but FluentValidation rejects it on submit, Angular built the wrong form — and the standup still blames CORS.

Your validation guide owns the envelope: [ASP.NET Core API validation](/blog/aspnet-core-api-validation). OpenAPI must describe the same keys Angular maps in forms.

```csharp
public sealed class CreateAppointmentRequest
{
    public Guid PatientId { get; init; }
    public DateTimeOffset Start { get; init; }
}

public sealed class CreateAppointmentValidator : AbstractValidator<CreateAppointmentRequest>
{
    public CreateAppointmentValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.Start).GreaterThan(DateTimeOffset.UtcNow);
    }
}
```

Swashbuckle picks up `CreateAppointmentRequest` automatically. It does **not** pick up FluentValidation rules unless you add a filter or duplicate `[Required]` for discovery only.

### FluentValidation → OpenAPI schema filter (working code)

```csharp
public sealed class FluentValidationSchemaFilter : ISchemaFilter
{
    private readonly IServiceProvider _services;

    public FluentValidationSchemaFilter(IServiceProvider services) => _services = services;

    public void Apply(OpenApiSchema schema, SchemaFilterContext context)
    {
        var validatorType = typeof(IValidator<>).MakeGenericType(context.Type);
        if (_services.GetService(validatorType) is not IValidator validator)
            return;

        schema.Required ??= new HashSet<string>();
        var descriptor = validator.CreateDescriptor();

        foreach (var member in descriptor.GetMembersWithValidators())
        {
            var hasNotEmpty = member.Value.Any(v =>
                v.Validator is INotEmptyValidator ||
                v.Validator.Name.Contains("NotEmpty", StringComparison.Ordinal));

            if (hasNotEmpty)
                schema.Required.Add(ToCamelCase(member.Key));
        }
    }

    private static string ToCamelCase(string name) =>
        char.ToLowerInvariant(name[0]) + name[1..];
}
```

Register in `AddSwaggerGen`:

```csharp
builder.Services.AddTransient<FluentValidationSchemaFilter>();
options.SchemaFilter<FluentValidationSchemaFilter>();
```

**Practical rule:** one source of truth in FluentValidation. Use the filter for OpenAPI `required` arrays — not diverging `[Required]` messages from `RuleFor` text.

Alternative: **MicroElements.Swashbuckle.FluentValidation** if you prefer a package over 40 lines of filter code. I still document the error **response** shape myself.

### Error envelope in the spec

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "Validation failed",
  "status": 400,
  "errors": {
    "start": ["Start must be in the future."],
    "patientId": ["Patient is required."]
  }
}
```

Add `400` / `application/problem+json` on POST and PUT. Middleware that produces it: [global exception handling](/blog/aspnet-core-global-exception-handling).

## JWT auth in Swagger UI and Scalar

Most Swagger tutorials stop at `AddJwtBearer`. Production teams need **Authorize** to work.

1. Define Bearer security scheme (examples above).
2. Apply global security requirement or per-endpoint `[Authorize]`.
3. Obtain a token from your real token endpoint — not a hard-coded dev secret in the repo.
4. Paste token in Swagger UI **Authorize** (no `Bearer ` prefix).

```csharp
if (app.Environment.IsDevelopment())
{
    app.MapPost("/dev/token", (DevTokenRequest req, ITokenService tokens) =>
        tokens.IssueForSwaggerAsync(req.UserId))
       .ExcludeFromDescription();
}
```

**Critical mentor note:** Swagger and Postman **do not enforce CORS**. Angular does. A green checkmark in Swagger UI does not prove the SPA integration. Verify from the browser: [CORS between Angular and ASP.NET Core](/blog/cors-angular-aspnet-core).

JWT deep dive: [ASP.NET Core JWT auth](/blog/aspnet-core-jwt-auth).

## Angular: from OpenAPI to TypeScript

_TypeScript client generation approaches from OpenAPI._

| Approach | When |
|---|---|
| **NSwag** MSBuild | Same repo or monorepo, regenerate on API build |
| **openapi-generator-cli** | Polyglot, many language targets |
| **Orval** | Angular/React hooks from OpenAPI |
| **Hand-written interfaces** | Tiny APIs — still publish OpenAPI for partners |

Contract workflow I enforce:

1. API PR changes DTO → OpenAPI diff in CI (e.g. `oasdiff` or committed `openapi.json` hash).
2. Regenerate TypeScript (or fail build).
3. Angular PR updates services in the same merge.
4. QA uses Scalar/Swagger for spot checks only.

More on the handshake: [Angular + .NET integration](/blog/angular-dotnet-integration).

### Enums and strategy keys

```csharp
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum FulfillmentMode
{
    Retail,
    Wholesale,
    Partner
}
```

Swashbuckle and built-in OpenAPI emit `enum` arrays. That prevents “works in Swagger, typo in Angular” incidents.

## API versioning in OpenAPI

Version in URL (`/api/v1/orders`), header (`Api-Version`), or query — pick one and document it.

**Swashbuckle:**

```csharp
options.SwaggerDoc("v1", new OpenApiInfo { Title = "Clinic API", Version = "v1" });
options.SwaggerDoc("v2", new OpenApiInfo { Title = "Clinic API", Version = "v2" });
options.DocInclusionPredicate((docName, apiDesc) =>
    (apiDesc.GroupName ?? "v1") == docName);
```

**Built-in OpenAPI:** named `AddOpenApi("v1")` / `AddOpenApi("v2")` with separate `MapOpenApi` routes.

Breaking changes belong in changelog **and** spec diff — not surprise field renames on a Friday deploy.

## Advanced: multipart uploads, polymorphism, modular monoliths

### File upload (multipart/form-data)

```csharp
[HttpPost("import")]
[Consumes("multipart/form-data")]
[ProducesResponseType(typeof(ImportJobDto), StatusCodes.Status202Accepted)]
public async Task<ActionResult<ImportJobDto>> Import(
    [FromForm] IFormFile file,
    CancellationToken ct)
{
    // virus scan, enqueue job...
}
```

If the OpenAPI spec shows `string` instead of `binary`, add an operation filter or NSwag attribute so Angular does not send JSON.

### Polymorphism (oneOf)

Payment integrations often need `oneOf` card vs ACH. Swashbuckle:

```csharp
[JsonDerivedType(typeof(CardPaymentDto), "card")]
[JsonDerivedType(typeof(AchPaymentDto), "ach")]
public abstract record PaymentMethodDto;

options.UseOneOfForPolymorphism();
options.SelectSubTypesUsing(baseType => /* discover derived types */);
```

Built-in OpenAPI: use schema transformers to emit `oneOf` — test the JSON in Scalar before Angular codegen.

### Modular monolith — multiple OpenAPI documents

Catalog and billing modules each get a doc — partners see only their surface:

```csharp
options.SwaggerDoc("catalog", new OpenApiInfo { Title = "Catalog", Version = "v1" });
options.SwaggerDoc("billing", new OpenApiInfo { Title = "Billing", Version = "v1" });
options.DocInclusionPredicate((docName, apiDesc) =>
    apiDesc.GroupName == docName);
```

Controllers: `[ApiExplorerSettings(GroupName = "catalog")]`. Modular layout: [modular monolith vs microservices](/blog/modular-monolith-vs-microservices-dotnet).

## Production: Swagger is not a feature flag you forget

The expensive incident: **Swagger enabled in Production** on App Service because `ASPNETCORE_ENVIRONMENT` was wrong or someone mapped UI unconditionally.

```csharp
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}
```

**When not to expose UI publicly:**

- Production APIs with PHI operation names in paths
- Admin endpoints you do not want enumerated
- Pen-test findings that treat `/swagger` as reconnaissance

**Production-safe patterns:**

- Publish `openapi.json` to a **private** artifact (Azure DevOps feed, internal Static Web App behind Entra ID)
- Import spec into **Azure API Management** for partners
- CI uploads spec to Blob; **no UI** on the API host

### CI: export openapi.json for Angular

```yaml
# azure-pipelines.yml excerpt
- script: |
    dotnet build Clinic.Api/Clinic.Api.csproj -c Release
    dotnet run --project Clinic.Api/Clinic.Api.csproj --no-build -c Release \
      --urls http://localhost:5050 &
    sleep 5
    curl -s http://localhost:5050/openapi/v1.json -o $(Build.ArtifactStagingDirectory)/openapi.json
  displayName: Export OpenAPI document
- publish: $(Build.ArtifactStagingDirectory)/openapi.json
  artifact: openapi
```

Better long-term: MSBuild target or `dotnet openapi` CLI when your SDK version supports document generation at build time without booting the host.

### Azure API Management

Import the same `openapi.json` APIM uses for policies, rate limits, and the developer portal. Your API host stays minimal; partners get docs without `/swagger` on production.

Config environment pitfalls: [appsettings and local overrides](/blog/aspnet-core-appsettings-localappsettings). Middleware placement: [middleware order](/blog/aspnet-core-middleware-order).

### Rate limiting and Swagger

If login is rate-limited, document `429` on auth routes. If `/swagger` is anonymous in Development but the API requires JWT, newcomers think Swagger is broken. Add a one-line description on the security scheme: how to get a dev token.

## Controllers vs Minimal APIs — same spec, different metadata

_Where OpenAPI metadata comes from in controllers vs Minimal APIs._

| Style | OpenAPI source |
|---|---|
| Controllers | `[ProducesResponseType]`, XML comments, `[Authorize]` |
| Minimal APIs | `.WithSummary()`, `.Produces<T>()`, `.WithTags()` |

Both can appear in one document. Hide internal ops: `[ApiExplorerSettings(IgnoreApi = true)]` or `ExcludeFromDescription()`.

## Alternatives to clicking Try it out

_Alternatives to Swagger UI Try it out for API testing._

| Tool | Role |
|---|---|
| **Visual Studio .http files** | Source-controlled requests, no UI on server |
| **Endpoints Explorer** | Quick local tests in VS / VS Code |
| **Postman** | Import `/openapi/v1.json` — collections, not a spec replacement |
| **Scalar / Swagger UI** | Interactive docs in Development |

**Opposite of Swagger?** Undocumented HTTP. For REST **.NET APIs**, OpenAPI is the discovery layer.

## Troubleshooting checklist

_Common Swagger and OpenAPI problems and likely causes._

| Symptom | Likely cause |
|---|---|
| Empty Swagger / 404 on json | `AddEndpointsApiExplorer` missing (Swashbuckle + controllers) |
| Two different JSON files | Both `AddSwaggerGen` and `AddOpenApi` without meaning to |
| 401 on every Try it out | Forgot Authorize or wrong audience |
| Schema shows `string` for GUIDs | Custom converter without schema filter |
| Angular codegen missing properties | `internal` setters or `[JsonIgnore]` on DTO |
| Works locally, no spec in Azure | UI gated on Development — artifact not published |
| Two different error shapes in UI | Model binding vs FluentValidation not unified |
| Required fields wrong in spec | FluentValidation rules not reflected — add schema filter |
| Multipart shows as JSON | Missing `[Consumes("multipart/form-data")]` or filter |

## Checklist before you call the API “documented”

```text
□ OpenAPI 3.x generated from real routes (not week-one hand YAML)
□ 400/401/403/404/409/429 documented with ProblemDetails shape
□ JWT security scheme + dev token instructions
□ Enums and required fields match FluentValidation / DTO reality
□ Pagination DTOs match Angular expectations (items + totalCount)
□ Swagger UI or Scalar only in Development (or behind auth)
□ CI publishes openapi.json for Angular codegen
□ Breaking changes versioned and in changelog
□ Browser-tested Angular path — not only Swagger Try it out
□ Production host has no anonymous /swagger unless intentional
```

## If an interviewer asks

**“What is the difference between Swagger and OpenAPI?”**  
OpenAPI is the specification; Swagger is the tool ecosystem (UI, Editor). In ASP.NET Core we generate OpenAPI 3 and browse it with Swagger UI or Scalar.

**“Why did .NET 9 move away from Swashbuckle?”**  
Microsoft shipped first-party `Microsoft.AspNetCore.OpenApi` for document generation and decoupled UI choice. Swashbuckle still works; it is not the template default.

**“Swashbuckle vs built-in OpenAPI?”**  
Built-in: fewer dependencies, .NET 10 OpenAPI 3.1, transformers, AOT. Swashbuckle: mature filters, teams already invested. Hybrid: built-in spec + Swagger UI package.

**“How do you keep Angular and .NET in sync?”**  
OpenAPI as source of truth, CI regeneration of TypeScript clients, one validation error envelope documented in the spec — not manual interfaces that drift.

**“Would you expose Swagger in production?”**  
Not publicly on the API host. Publish the spec through a controlled channel; protect operational endpoints from anonymous enumeration.

**“What are swagger alternatives?”**  
Scalar, Redoc, NSwag codegen, Postman import, .http files — all consume the same OpenAPI document.

More API design context: [API design principles](/blog/api-design-principles). Hub: [API design](/learning/api-design).

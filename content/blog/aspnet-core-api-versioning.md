---
title: "ASP.NET Core API Versioning for Angular Clients: Asp.Versioning Guide"
description: "Implement API versioning in ASP.NET Core with Asp.Versioning.Http, URL/Header strategies, OpenAPI Swagger docs, and deprecation sunset headers."
date: "2026-09-18"
updated: "2026-10-03"
category: "api-design"
tags: ["ASP.NET Core", "API Design", "Angular", "OpenAPI", "Architecture", "REST"]
related:
  - aspnet-core-minimal-apis
  - swagger-openapi-aspnet-core
  - angular-dotnet-integration
  - aspnet-core-api-validation
faq:
  - q: "What is the best API versioning strategy for Angular applications?"
    a: "URL segment versioning (e.g. /api/v1/orders, /api/v2/orders) is the most reliable strategy for Angular SPAs. It is transparent in proxy rules, integrates seamlessly with OpenAPI codegen tools (like ng-openapi-gen), and avoids header-dropping bugs across CDN caches or reverse proxies."
  - q: "What package should I use for API versioning in modern .NET 8/9/10?"
    a: "Use Asp.Versioning.Http (for Minimal APIs) and Asp.Versioning.Mvc.ApiExplorer. The legacy Microsoft.AspNetCore.Mvc.Versioning package has been superseded by the official .NET Foundation Asp.Versioning suite."
  - q: "How do I communicate API deprecation and sunset to frontend teams?"
    a: "Emit standard HTTP response headers: 'Deprecation: @<timestamp>' and 'Sunset: <date>', or configure ReportApiVersions = true to automatically return 'api-supported-versions' and 'api-deprecated-versions' headers on every response."
  - q: "When should I increment an API major version?"
    a: "Increment a major version only for breaking contract changes: removing a field, renaming a property, changing field data types, altering status codes, or adding mandatory request headers. Adding optional fields or new endpoints does not require a new version."
---

**API versioning in ASP.NET Core** decouples backend schema evolutions from frontend release cycles. Because Angular SPAs are cached in user browser tabs across shifts or days, an unversioned breaking change on the server immediately causes runtime JSON parsing failures or broken form submissions.

```text
Angular Client (Cached in Tab v1.4) ──► GET /api/v1/orders ──► Returns { "total": 120.50 }
                                                                 (Supported, returns 200)

Angular Client (New Release v2.0)   ──► GET /api/v2/orders ──► Returns { "amount": 120.50, "currency": "USD" }
                                                                 (New schema, returns 200)
```

**New to this** → start with [URL vs Header strategies](#versioning-strategies-url-vs-header-vs-query). **Minimal API setup** → [Asp.Versioning code example](#complete-aspversioning-setup-for-minimal-apis). **OpenAPI docs** → [Swagger/OpenAPI guide](/blog/swagger-openapi-aspnet-core). **Interview prep** → [If an interviewer asks](#if-an-interviewer-asks).

## Real-world analogy

Imagine a restaurant menu: When the kitchen introduces an updated recipe (v2), they print a new menu card with the updated ingredients. They do not snatch the older menu (v1) out of the hands of diners who are already sitting at Table 4 placing their order. Table 4 receives what their card promised. When Table 4 leaves, the table is reset with the new menu card. A silent in-place schema change is serving an unannounced ingredient to a customer expecting the original recipe.

## Versioning strategies: URL vs Header vs Query

| Strategy | Example | Pros | Cons | Recommendation |
|---|---|---|---|---|
| **URL Path Segment** | `/api/v1/orders`<br>`/api/v2/orders` | Clear in logs, easy caching, trivial OpenAPI separation, works with all HTTP clients. | Violates pure REST URI purism (resource URI changes). | **Strongly Recommended for SPAs & Mobile** |
| **Request Header** | `X-Api-Version: 2.0` | Clean URIs, easy default fallbacks. | Prone to being stripped by proxies; harder to share links in browser address bars. | Good for internal enterprise microservices. |
| **Query Parameter** | `/api/orders?api-version=2.0` | Simple for ad-hoc browser testing. | Pollutes cache keys; easy for frontend developers to omit. | Avoid for core APIs. |

## Complete Asp.Versioning setup for Minimal APIs

Install `Asp.Versioning.Http` and `Asp.Versioning.Mvc.ApiExplorer`:

```bash
dotnet add package Asp.Versioning.Http
dotnet add package Asp.Versioning.Mvc.ApiExplorer
```

### 1. Registering versioning services in Program.cs

```csharp
// Program.cs
using Asp.Versioning;
using Asp.Versioning.Builder;

var builder = WebApplication.CreateBuilder(args);

// 1. Add API versioning services
builder.Services.AddApiVersioning(options =>
{
    options.DefaultApiVersion = new ApiVersion(1, 0);
    options.AssumeDefaultVersionWhenUnspecified = true;
    options.ReportApiVersions = true; // Emits api-supported-versions headers
    options.ApiVersionReader = ApiVersionReader.Combine(
        new UrlSegmentApiVersionReader(),
        new HeaderApiVersionReader("X-Api-Version")
    );
})
.AddApiExplorer(options =>
{
    // Format version as "'v'major[.minor][-status]" (e.g. 'v1', 'v2.1')
    options.GroupNameFormat = "'v'VVV";
    options.SubstituteApiVersionInUrl = true;
});

var app = builder.Build();

// 2. Define an ApiVersionSet for route groups
ApiVersionSet versionSet = app.NewApiVersionSet()
    .HasApiVersion(new ApiVersion(1, 0))
    .HasApiVersion(new ApiVersion(2, 0))
    .HasDeprecatedApiVersion(new ApiVersion(1, 0)) // Marks v1 as deprecated
    .ReportApiVersions()
    .Build();

// 3. Map Versioned Minimal API Groups
var v1Group = app.MapGroup("/api/v{version:apiVersion}/orders")
    .WithApiVersionSet(versionSet)
    .MapToApiVersion(new ApiVersion(1, 0));

var v2Group = app.MapGroup("/api/v{version:apiVersion}/orders")
    .WithApiVersionSet(versionSet)
    .MapToApiVersion(new ApiVersion(2, 0));

// V1 Handler (Deprecated legacy schema)
v1Group.MapGet("/", (CancellationToken ct) =>
{
    return Results.Ok(new[]
    {
        new { Id = Guid.NewGuid(), Total = 150.00m, Customer = "Alice" }
    });
});

// V2 Handler (New enriched schema with ISO currency)
v2Group.MapGet("/", (CancellationToken ct) =>
{
    return Results.Ok(new[]
    {
        new { Id = Guid.NewGuid(), Amount = 150.00m, Currency = "USD", CustomerName = "Alice" }
    });
});

app.Run();
```

## Automating multi-version OpenAPI / Swagger documents

To generate individual OpenAPI documents (`/openapi/v1.json`, `/openapi/v2.json`) for frontend client generation:

```csharp
// Infrastructure/Swagger/ConfigureSwaggerOptions.cs
using Asp.Versioning.ApiExplorer;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;

public class ConfigureSwaggerOptions : IConfigureOptions<SwaggerGenOptions>
{
    private readonly IApiVersionDescriptionProvider _provider;

    public ConfigureSwaggerOptions(IApiVersionDescriptionProvider provider) =>
        _provider = provider;

    public void Configure(SwaggerGenOptions options)
    {
        foreach (var description in _provider.ApiVersionDescriptions)
        {
            options.SwaggerDoc(description.GroupName, new OpenApiInfo
            {
                Title = $"Portfolio API {description.ApiVersion}",
                Version = description.ApiVersion.ToString(),
                Description = description.IsDeprecated
                    ? "⚠️ This API version has been deprecated."
                    : "Active API version."
            });
        }
    }
}
```

## Deprecation, Sunsetting, and HTTP 410 Gone

When retiring an older API version, adhere to standard HTTP lifecycle headers:

1. **Step 1 (Deprecation warning)**: Return `Deprecation: @<timestamp>` header. The endpoint continues to return 200 OK.
2. **Step 2 (Sunset date announced)**: Return `Sunset: Wed, 11 Nov 2026 00:00:00 GMT` header, notifying developers of the shutdown date.
3. **Step 3 (Decommission)**: Return `410 Gone` with a ProblemDetails payload pointing to the v2 migration guide, rather than a generic 404.

```csharp
app.MapGet("/api/v0/legacy-orders", (HttpResponse response) =>
{
    response.Headers["Sunset"] = "Wed, 11 Nov 2026 00:00:00 GMT";
    return Results.Problem(
        statusCode: StatusCodes.Status410Gone,
        title: "API Version Decommissioned",
        detail: "API v0 has been sunset. Please update your client to call /api/v2/orders.",
        instance: "/api/v0/legacy-orders"
    );
});
```

## Common mistakes and pitfalls

- **Breaking v1 schema because "frontend already updated"**: Deploying a backend breaking change to `/api/v1` before all user browser sessions refresh will cause immediate JavaScript client errors.
- **Versioning every minor internal refactor**: Creating `/api/v2` because you refactored a repository or added an optional field introduces version sprawl. Only version breaking contract changes.
- **Neglecting OpenAPI version segregation**: Mixing all API versions into a single OpenAPI document creates duplicate method signatures in generated TypeScript client libraries.
- **Hardcoding version numbers inside Angular components**: Instead of typing `/api/v1/` in individual services, configure versioned endpoints in OpenAPI codegen scripts or environment config.

## If an interviewer asks

**30-second answer:** API versioning manages breaking contract changes between client and server without disrupting active users. In ASP.NET Core, we use `Asp.Versioning.Http` with URL path segments (`/api/v1`, `/api/v2`), emit `api-supported-versions` and `Sunset` headers, and generate versioned OpenAPI specifications for typed Angular client generation.

**Strong answer:** In production ASP.NET Core architectures, URL segment versioning is the gold standard for SPAs and mobile apps because it isolates caching layers and enables automated OpenAPI client generation per version. We group routes using `ApiVersionSet`, mark older versions with `HasDeprecatedApiVersion` so response headers warn consuming teams, and follow a phased deprecation policy (`Deprecation` → `Sunset` → `410 Gone`). Non-breaking additive changes (new optional fields or endpoints) remain in the current version to avoid version explosion.

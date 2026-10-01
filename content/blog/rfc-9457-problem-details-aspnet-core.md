---
title: "RFC 9457 Problem Details Deep Dive for ASP.NET Core"
description: "RFC 9457 Problem Details for ASP.NET Core — type URIs, extensions, IProblemDetailsService, validation vs exceptions, Minimal APIs, and Angular-consumable shapes. Deepens global-exception and validation posts without inventing a second error standard."
date: "2026-10-01"
category: "api-design"
tags: ["ASP.NET Core", "ProblemDetails", "RFC 9457", "API Design", "Angular"]
related:
  - aspnet-core-global-exception-handling
  - aspnet-core-api-validation
  - aspnet-core-minimal-apis
  - angular-dotnet-integration
faq:
  - q: "What is RFC 9457 Problem Details in ASP.NET Core?"
    a: "RFC 9457 defines a standard JSON error shape — type, title, status, detail, instance — plus extensions. ASP.NET Core ProblemDetails and IProblemDetailsService implement that contract for APIs Angular can parse uniformly."
  - q: "Is RFC 9457 different from RFC 7807?"
    a: "9457 revises and replaces 7807. Members are familiar; use ASP.NET Core ProblemDetails and stable type URIs rather than a custom envelope."
  - q: "Should I keep a custom success/error wrapper?"
    a: "Prefer ProblemDetails for HTTP APIs. A proprietary envelope fights Angular interceptors and OpenAPI. Migrate deliberately — do not dual-emit forever."
---

**RFC 9457 Problem Details for ASP.NET Core** is the standard machine-readable error document your API returns with Content-Type application/problem+json, so Angular forms, interceptors, and support tools share one parsing path.


```text
Validation / domain rule / unhandled exception
        |
        v
IProblemDetailsService / IExceptionHandler
        |
        v
application/problem+json
{ type, title, status, detail, instance, errors?, code? }
```

Metaphor: Problem Details is a nutrition label for failures — same fields in the same places, so clients do not scrape English sentences.

**New to this** stay here for type URIs, extensions, and service customization. **Middleware vs IExceptionHandler** see [global exception handling](/blog/aspnet-core-global-exception-handling). **Field errors** see [API validation](/blog/aspnet-core-api-validation). **Minimal APIs** see [Minimal APIs](/blog/aspnet-core-minimal-apis).

Search intent for **asp.net core problemdetails rfc 9457** is a deep how-to beyond return Problem().

## RFC 9457 vs older RFC 7807 naming

RFC 7807 introduced application/problem+json. RFC 9457 updates the specification. In ASP.NET Core you still primarily touch ProblemDetails and ValidationProblemDetails. The practitioner move is standard members plus typed extensions, not debating RFC numbers in standup.

When you write type URIs, prefer stable HTTPS identifiers you own, for example https://httpproblems.example.com/codes/appointment-conflict, not random GUID strings per environment.

## application/problem+json shape

| Member | Role |
|---|---|
| type | URI identifying the problem class |
| title | Short, stable summary |
| status | HTTP status code |
| detail | Human-specific explanation safe for clients |
| instance | URI referencing this occurrence |

Example conflict payload:

```json
{
  "type": "https://httpproblems.example.com/codes/appointment-conflict",
  "title": "Appointment conflict",
  "status": 409,
  "detail": "Provider already has an appointment in that interval.",
  "instance": "/api/clinics/.../appointments/...",
  "code": "APPT_CONFLICT",
  "traceId": "00-abc..."
}
```

code and traceId are extensions — allowed and useful. Keep them consistent across endpoints.

Validation flavor uses an errors dictionary Angular forms can bind — see the validation guide for FluentValidation wiring into the same envelope.

## IProblemDetailsService and CustomizeProblemDetails

```csharp
builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = ctx =>
    {
        ctx.ProblemDetails.Extensions["traceId"] =
            ctx.HttpContext.TraceIdentifier;
    };
});

var app = builder.Build();
app.UseExceptionHandler();
app.UseStatusCodePages();
```

IProblemDetailsService writes problems from status code pages and exception handlers in a unified way. Prefer it over ad-hoc Results.Json(new { message = ... }).

In controllers, return Problem(...) and ValidationProblem(...) remain idiomatic. In Minimal APIs, use TypedResults.Problem and TypedResults.ValidationProblem.

## Validation vs unhandled exceptions

| Path | Status | Shape |
|---|---|---|
| Model validation / FluentValidation | 400 | errors dictionary |
| Domain rule (conflict, invariant) | 409/422 | Problem with code |
| AuthN missing | 401 | Challenge; can still problem |
| AuthZ failed | 403 | Problem or empty — be consistent |
| Unhandled | 500 | Generic title/detail; no stack in prod |

Wire FluentValidation to the same envelope as DataAnnotations so Angular never branches on two shapes. Global handler maps exceptions to problems.

```csharp
public sealed class AppointmentConflictException : Exception
{
    public string Code => "APPT_CONFLICT";
    public AppointmentConflictException(string detail) : base(detail) { }
}
```

Wire it to a concrete `IExceptionHandler` so domain exceptions become Problem Details without try/catch in every controller:

```csharp
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

public sealed class DomainExceptionHandler : IExceptionHandler
{
    private readonly IProblemDetailsService _pds;

    public DomainExceptionHandler(IProblemDetailsService pds) => _pds = pds;

    public async ValueTask<bool> TryHandleAsync(
        HttpContext ctx,
        Exception exception,
        CancellationToken ct)
    {
        if (exception is not AppointmentConflictException conflict)
            return false;  // let the next handler (global 500) take it

        ctx.Response.StatusCode = StatusCodes.Status409Conflict;

        await _pds.WriteAsync(new ProblemDetailsContext
        {
            HttpContext = ctx,
            ProblemDetails =
            {
                Type    = "https://httpproblems.example.com/codes/appointment-conflict",
                Title   = "Appointment conflict",
                Status  = StatusCodes.Status409Conflict,
                Detail  = conflict.Message,
            },
            AdditionalMetadata = null
        }, ct);

        // Add stable extension code after write so shape is consistent
        // (works in .NET 8+ — for older versions assign before WriteAsync)
        return true;
    }
}
```

Register handlers in order — most specific first, generic last:

```csharp
builder.Services.AddExceptionHandler<DomainExceptionHandler>();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>(); // catches everything else → 500
builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = ctx =>
    {
        ctx.ProblemDetails.Extensions["traceId"] = ctx.HttpContext.TraceIdentifier;
        ctx.ProblemDetails.Extensions["code"] =
            ctx.HttpContext.Items.TryGetValue("errorCode", out var c) ? c : null;
    };
});

app.UseExceptionHandler();
```

With this in place, `throw new AppointmentConflictException("Provider already booked")` in any service or controller produces:

```json
{
  "type": "https://httpproblems.example.com/codes/appointment-conflict",
  "title": "Appointment conflict",
  "status": 409,
  "detail": "Provider already booked",
  "traceId": "00-abc123..."
}
```

No try/catch in controllers needed — the exception bubbles, the handler intercepts.

## Type URIs and product error codes

1. Own a URI namespace under your domain for product codes.
2. Put stable code extension for Angular switch statements — URIs are for docs; codes are for UI.
3. Document codes in a living markdown table in the repo.
4. Do not change code meaning; add a new code instead.

Angular sketch: if err.error?.code === 'APPT_CONFLICT' set form errors from detail. Align with [Angular + .NET integration](/blog/angular-dotnet-integration).

## Minimal APIs and status-code pages

Minimal APIs should not invent a third error style. UseStatusCodePages plus ProblemDetails converts bare 404s into problem documents when configured — verify middleware order in the exception handling post.

```csharp
group.MapPost("/", async (CreateOrderRequest req, IValidator<CreateOrderRequest> v) =>
{
    var val = await v.ValidateAsync(req);
    if (!val.IsValid)
        return TypedResults.ValidationProblem(val.ToDictionary());
    return TypedResults.Created($"/orders/{id}", payload);
});
```

## Angular consumption contract

Interceptor responsibilities: detect application/problem+json; parse title, detail, errors, code, traceId; map field errors onto reactive form controls; toast for non-field problems; surface traceId in support dialogs. Do not stringify the whole blob into one alert.

## Migration checklist from ad-hoc error JSON

1. Inventory current envelopes ({ message }, { success:false }, etc.).
2. Enable AddProblemDetails plus exception handler emitting RFC shape.
3. Update Angular parser to accept both during transition.
4. Switch endpoints in slices; remove legacy envelope when traffic stops.
5. Update OpenAPI examples to ProblemDetails.
6. Add contract tests asserting application/problem+json on 400/409/500.

Avoid inventing ProblemDetails plus a wrapping data success field — that is a second standard.

## Pitfalls

- Leaking exception messages from EF/SQL into detail in production.
- Inconsistent 404 bodies — sometimes problem, sometimes empty.
- Using type as free-text English instead of a URI.
- Duplicating validation errors in both detail and errors with conflicting text.
- Returning 200 with a problem payload — status must match.

## Verification

1. Trigger validation → 400, errors keys match form control names.
2. Trigger domain conflict → 409, code stable.
3. Throw unhandled in Development vs Production → stack only in Dev or logs; generic problem in Prod.
4. curl -i shows Content-Type application/problem+json.
5. Angular interceptor maps fields correctly.
6. OpenAPI documents problem responses for critical endpoints.

## Practitioner checklist

1. AddProblemDetails with traceId extension.
2. One IExceptionHandler for unhandled and domain exceptions.
3. FluentValidation → ValidationProblemDetails.
4. Catalog of code values published to frontend.
5. No proprietary wrapper on new endpoints.
6. Contract tests in CI.

## If an interviewer asks

**How do you return errors from ASP.NET Core APIs?** RFC 9457 Problem Details via IProblemDetailsService / Problem(), validation problems for field errors, stable extension codes for UI, no secret leakage.

**7807 or 9457?** 9457 is the current RFC lineage; implement with ASP.NET Core ProblemDetails and focus on consistent shape for clients.


## Concrete controller examples

Bad — proprietary envelope that Angular must special-case:

```csharp
return Ok(new { success = false, error = "Invalid date" }); // HTTP 200!
```

Good — validation problem:

```csharp
[HttpPost]
public IActionResult Create(CreateAppointmentRequest req)
{
    if (!ModelState.IsValid)
        return ValidationProblem(ModelState);
    // ...
    return CreatedAtAction(nameof(Get), new { id }, dto);
}
```

Good — domain conflict:

```csharp
[HttpPut("{id:guid}")]
public async Task<IActionResult> Update(Guid id, UpdateAppointmentRequest req, CancellationToken ct)
{
    try
    {
        await _orders.UpdateAsync(id, req, ct);
        return NoContent();
    }
    catch (AppointmentConflictException ex)
    {
        return Problem(
            type: "https://httpproblems.example.com/codes/appointment-conflict",
            title: "Appointment conflict",
            detail: ex.Message,
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = ex.Code });
    }
}
```

Note: depending on your ASP.NET Core version, extensions may be assigned on the ProblemDetails instance after construction — check the overload you have and keep one helper method so every controller does not invent a slightly different shape.

## Mapping identity failures without leaking

401 and 403 should remain distinguishable for Angular ([401 vs 403](/blog/aspnet-core-401-vs-403)). You can still emit Problem Details bodies for 403 with a stable code like AUTHZ_FORBIDDEN while keeping detail generic ("You cannot perform this action") so you do not reveal whether an id exists. For cross-tenant id guessing, prefer 404-shaped problems for non-visible resources — product security decision, document it once.

## Correlation with logging

Always include traceId / correlation id in the problem extensions and in structured logs with the same value. Support engineers paste the id from the Angular error dialog into App Insights. Do not put PII in detail; put it in redacted logs only if policy allows ([Serilog PII](/blog/serilog-pii-redaction-healthcare-aspnet-core)).

## Contract test snippet

```csharp
[Fact]
public async Task Validation_failure_returns_problem_json()
{
    var client = _factory.CreateClient();
    var res = await client.PostAsJsonAsync("/api/appointments", new { });
    Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    Assert.StartsWith("application/problem+json", res.Content.Headers.ContentType!.MediaType!);
    var body = await res.Content.ReadFromJsonAsync<Dictionary<string, JsonElement>>();
    Assert.True(body!.ContainsKey("errors") || body.ContainsKey("title"));
}
```

Run these beside Testcontainers suites when the pipeline is up — shape regressions hurt Angular harder than silent server changes.



## What this page is not

This is not a rewrite of the global exception middleware comparison, and not a FluentValidation setup guide. Those posts own the plumbing. This page owns the **RFC-shaped document**, type URI discipline, extension codes, Minimal API consistency, and Angular parsing contract.

If your team still returns `{ "error": "something went wrong" }` with random status codes, migrate with the checklist above before adding more Angular if/else branches.

## Operational go-live order

1. Agree the problem media type and required extensions (code, traceId) with the Angular team.
2. Ship AddProblemDetails + exception handler behind a feature flag or on a new API version if partners depend on the old envelope.
3. Publish the code catalog in the developer portal or repo docs.
4. Turn on contract tests in CI.
5. Remove the legacy envelope when dashboards show zero clients parsing it (or after a dated deprecation).

## Edge cases worth deciding once

- **Empty 403 vs problem 403:** pick one; document for the SPA.
- **Multiple validation libraries:** still one errors dictionary shape.
- **gRPC or SignalR errors:** different channel; do not force problem+json into hub protocols — keep REST/Minimal HTTP consistent first.
- **Localization:** title can be stable English for machines; detail may be localized — then code becomes even more important for UI branching.



## Helper to keep controllers thin

Centralize construction so status, type, and code never drift:

```csharp
public static class AppProblems
{
    public static IActionResult Conflict(ControllerBase c, string code, string detail) =>
        c.Problem(
            type: $"https://httpproblems.example.com/codes/{code.ToLowerInvariant().Replace('_','-')}",
            title: code,
            detail: detail,
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = code });
}
```

Call AppProblems.Conflict(this, "APPT_CONFLICT", ex.Message) from actions. The Angular team programs against code, not against whichever title string a developer typed that day.

With that helper, RFC 9457 stops being a theoretical standard and becomes the boring, reliable error bus between ASP.NET Core and Angular.



## OpenAPI documentation snippet

Document problem responses so Angular generators and partner integrators see the shape:

```csharp
[ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
[ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
public async Task<IActionResult> Update(...) { }
```

Keep examples in Swagger with a sample `code` extension. Humans read detail; machines branch on code.


## Related

**Related:** [Global exception handling](/blog/aspnet-core-global-exception-handling) · [API validation](/blog/aspnet-core-api-validation) · [Minimal APIs](/blog/aspnet-core-minimal-apis) · [Angular integration](/blog/angular-dotnet-integration)

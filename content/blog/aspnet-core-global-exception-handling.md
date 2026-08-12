---
title: "ASP.NET Core Global Exception Handling for Angular APIs"
description: "Set up ASP.NET Core global exception handling with ProblemDetails so Angular forms show consistent errors — middleware vs IExceptionHandler, 400 vs 500, and what not to leak."
date: "2026-08-04"
category: "architecture"
tags: ["ASP.NET Core", "Exception Handling", "ProblemDetails", "Angular", "APIs"]
---

Search traffic for **ASP.NET Core global exception handling** stays high because every Angular + API team hits the same pain: one endpoint returns a string, another returns a nested validation object, a third returns an HTML error page in production. The SPA then needs special cases forever.

I standardize exception and error envelopes early on healthcare and SaaS APIs so Angular reactive forms and toasts can bind to one shape. This guide is the production-minded version — not “wrap everything in try/catch.”

## What “global” should mean

Global exception handling should:

1. Catch unhandled exceptions once
2. Map them to stable HTTP status codes
3. Return a consistent JSON body (preferably **ProblemDetails**)
4. Log enough server detail without leaking it to browsers
5. Leave expected business failures on an explicit path (validation, conflict), not as random 500s

It should **not**:

- Hide programming bugs by returning 200 with `{ success: false }` for everything
- Show stack traces to end users in production
- Replace FluentValidation / model validation for input errors

For validation-focused envelopes, see [ASP.NET Core API validation](/blog/aspnet-core-api-validation). This article focuses on the unhandled and cross-cutting path.

## Prefer ProblemDetails as the contract

RFC 7807-style ProblemDetails gives Angular a predictable object:

```json
{
  "type": "https://httpstatuses.com/500",
  "title": "An unexpected error occurred.",
  "status": 500,
  "traceId": "00-abc123..."
}
```

For 400 validation failures I extend with an `errors` dictionary Angular can map to controls. For 409 conflicts I use a clear `title` and optional `code` the UI can branch on.

One contract beats three ad-hoc error DTOs invented by different developers across sprints.

## Modern ASP.NET Core: IExceptionHandler

On recent ASP.NET Core versions, `IExceptionHandler` is cleaner than a giant middleware class for many apps:

```csharp
public sealed class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _logger;

    public GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger)
        => _logger = logger;

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        _logger.LogError(exception, "Unhandled exception");

        var problem = new ProblemDetails
        {
            Status = StatusCodes.Status500InternalServerError,
            Title = "An unexpected error occurred.",
            Instance = httpContext.Request.Path,
        };

        problem.Extensions["traceId"] = httpContext.TraceIdentifier;

        httpContext.Response.StatusCode = problem.Status.Value;
        await httpContext.Response.WriteAsJsonAsync(problem, cancellationToken);
        return true;
    }
}
```

Register:

```csharp
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

var app = builder.Build();
app.UseExceptionHandler();
```

Middleware order still matters. Exception handling must wrap the pipeline so MVC/minimal API failures are caught.

## Map known exceptions on purpose

Not every exception is a 500:

| Exception / domain result | Typical status |
|---|---|
| Validation failure | 400 |
| Not found | 404 |
| Conflict / duplicate | 409 |
| Forbidden after auth | 403 |
| Unauthorized | 401 |
| Dependency timeout you treat as availability | 503 |
| Unknown | 500 |

I often use typed domain exceptions sparingly (`NotFoundException`, `ConflictException`) **or** Result types in application handlers. Pick one style per codebase. Mixing Result everywhere plus random thrown exceptions creates two error highways.

## What Angular should do with the response

Centralize parsing in an interceptor or small helper:

- Read `status`
- Prefer `title` + `errors` for toasts and form binding
- Surface `traceId` in support dialogs so ops can find logs
- Never show raw exception messages from 500s to end users

Example mindset for forms:

- 400 + `errors.email` → set control error
- 409 → inline banner “already registered”
- 500 → generic message + offer to retry

This is how provider registration and admin UIs stay calm under failure instead of dumping JSON into a snackbar.

## Logging: the other half of global handling

A handler that returns pretty JSON but logs poorly wastes the whole investment.

Log:

- exception + stack (server only)
- `traceId` / correlation id
- user id if authenticated (careful with PII policies)
- request path and method

Do not log:

- passwords, tokens, full card-like payloads
- entire PHI documents “for debugging”

In healthcare-related systems I treat logging redaction as part of the error design, not an afterthought.

## Development vs production behavior

In Development I sometimes include more detail in ProblemDetails extensions for speed — never the full stack in the `title`, but a safe `detail` for the developer running Angular locally. In Production, `detail` stays generic and the real story lives in logs.

Use environment checks in the handler:

```csharp
if (env.IsDevelopment())
{
    problem.Detail = exception.Message;
}
```

That single branch prevents the classic “works on my machine” where local Angular shows useful errors and production shows HTML or empty bodies.

## Minimal APIs and controllers share the same handler

Teams migrating from controllers to Minimal APIs often reintroduce inconsistent errors. Register the global handler once at the host level so both styles emit the same ProblemDetails family. Angular should not care which endpoint style produced the failure.

If you use filters for MVC-only concerns, keep them aligned with the same status mapping table — or delete them once `IExceptionHandler` covers the cases.

## Common mistakes I still see

1. **try/catch in every controller action** — duplicates handling and still misses filter/middleware failures  
2. **Different error JSON per feature team** — Angular grows `if (err.error.message)` forever  
3. **Returning 500 for bad input** — teaches clients the wrong recovery  
4. **Exposing `exception.Message` in production** — information disclosure  
5. **Swallowing exceptions** — empty catch that returns 200  

## Minimal production checklist

1. `AddProblemDetails` + global handler registered  
2. Validation errors use the same family of response shapes  
3. Angular interceptor understands ProblemDetails  
4. Production never returns stack traces  
5. Trace id visible to support and present in logs  
6. Load test that forced 500s still return JSON, not HTML error pages  
7. Support can find logs from a `traceId` shown in the UI  

If you want this envelope standardized across your .NET + Angular API, [contact me](/contact).

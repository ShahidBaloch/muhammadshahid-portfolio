---
title: "Clean API Validation and Error Envelopes in ASP.NET Core"
description: "ASP.NET Core API validation with ProblemDetails: FluentValidation without the deprecated AspNetCore package, one error envelope, and Angular form mapping."
date: "2026-08-17"
category: "architecture"
tags: ["ASP.NET Core", "Validation", "Problem Details", "Angular", "API Design"]
---

Nothing erodes trust in an API faster than three different error shapes for the same validation failure. The login form expects `{ message: string }`. The checkout endpoint returns `{ errors: { field: ["..."] } }`. A middleware wraps 500s in yet another envelope. The Angular team builds three parsers, misses edge cases, and users see "Something went wrong" when the server actually sent a useful field error.

I standardize validation and error responses early on every .NET + Angular project — healthcare patient intake forms, marketplace seller listings, admin bulk imports. The investment pays off when you add a fourth client or turn on global exception handling without breaking the SPA.

This post walks through the stack I use: FluentValidation **without** the deprecated `FluentValidation.AspNetCore` MVC package, `ProblemDetails`, a consistent validation envelope, and Angular consumption patterns that stay boring in a good way.

## One envelope for the Angular client

Define a contract your front end can depend on:

```json
{
  "type": "https://api.example.com/problems/validation",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "traceId": "00-abc...",
  "errors": {
    "email": ["Email is required."],
    "lines[0].quantity": ["Quantity must be at least 1."]
  }
}
```

Field keys must match **Angular form control names** or a documented mapping layer. Nested collection indexes (`lines[0].quantity`) should align with how the client serializes arrays — I document that in OpenAPI and stick to it.

For non-validation failures (404, 409 conflict, 403 forbidden), keep the same outer shape: `type`, `title`, `status`, `traceId`, optional `detail`, and optional extension members — but omit `errors` when there are no field-level issues.

Angular interceptors then branch simply:

- `400` with `errors` → patch form controls or show inline messages
- `409` / `422` → business rule message in a toast or dialog
- `401` / `403` → auth flow
- `500` → generic user message; log `traceId` for support

## Validation layers and responsibilities

### Request DTO validation (FluentValidation)

I use FluentValidation for command and request models. Co-locate validators with features:

```csharp
public class CreateListingValidator : AbstractValidator<CreateListingCommand>
{
    public CreateListingValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(120);
        RuleFor(x => x.Price).GreaterThan(0);
        RuleForEach(x => x.Images).SetValidator(new ImageRefValidator());
    }
}
```

Register validators in DI (`AddValidatorsFromAssembly...` from the **FluentValidation** package, not the old AspNetCore integration). Run them in **one** front door: a MediatR pipeline behavior, an endpoint filter, or an `IActionFilter`. Not two of those silently, and not automatic MVC validation from `FluentValidation.AspNetCore`.

### FluentValidation.AspNetCore is the wrong package now

Jeremy Skinner deprecated **FluentValidation.AspNetCore** (the package that hooked automatic validation into ASP.NET Core MVC). The library authors want you to call `IValidator<T>` yourself. Automatic integration fought model binding, `ProblemDetails`, and endpoint routing in ways that produced two error shapes for one request.

What I do in 2026:

- Reference **FluentValidation** (and the DI extension package if you want assembly scanning)
- Do **not** `AddFluentValidationAutoValidation()` / `AddFluentValidationClientsideAdapters()` from the deprecated package
- Validate in a behavior or filter and map failures to the same `errors` dictionary as model binding (below)

If an old template still calls `services.AddFluentValidation()`, treat that as tech debt in the same PR as the envelope work. Data annotations can stay on DTOs for simple `[Required]` if you want; I still prefer FluentValidation for anything with collection rules or async checks (unique NPI in a clinic, SKU exists).

Pick one front door, not both silently.

```csharp
public class ValidationBehavior<TRequest, TResponse>
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken ct)
    {
        var failures = /* run all IValidator<TRequest> */;
        if (failures.Count != 0)
            throw new ValidationException(failures);

        return await next();
    }
}
```

### Domain validation (inside handlers)

"Seller cannot list in a category they are not approved for" is not a `[Required]` attribute. It belongs in the handler after loading state:

```csharp
if (!await _sellerPolicy.CanListInCategoryAsync(sellerId, command.CategoryId, ct))
    throw new BusinessRuleException("Seller is not approved for this category.");
```

Map domain failures to **409 Conflict** or **422 Unprocessable Entity** with a clear `detail` string, not a fake field error on `categoryId` unless the UI truly treats it as user input correction.

Separating **input shape validation** (400 + `errors`) from **business rule rejection** (409 + `detail`) keeps Angular logic clean.

## Global exception handling with ProblemDetails

ASP.NET Core's `IProblemDetailsService` and exception handlers (minimal hosting in .NET 8+) centralize mapping:

```csharp
public class GlobalExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken ct)
    {
        var (status, title, errors) = exception switch
        {
            ValidationException ve => (400, "Validation failed", ve.ToDictionary()),
            BusinessRuleException br => (409, br.Message, null),
            NotFoundException nf => (404, nf.Message, null),
            _ => (500, "An unexpected error occurred.", null)
        };

        var problem = new HttpValidationProblemDetails(errors ?? new Dictionary<string, string[]>())
        {
            Status = status,
            Title = title,
            Detail = exception is BusinessRuleException or NotFoundException
                ? exception.Message
                : null,
            Type = $"https://httpstatuses.com/{status}"
        };

        httpContext.Response.StatusCode = status;
        await httpContext.Response.WriteAsJsonAsync(problem, ct);
        return true;
    }
}
```

Always emit **`traceId`** (from `Activity.Current` or `HttpContext.TraceIdentifier`) so support can correlate Angular console logs with server logs. Healthcare and marketplace clients ask for this on day one.

Never return stack traces to browsers in production.

## Model binding errors belong in the same envelope

When JSON is malformed or enum values fail to bind, ASP.NET Core produces its own validation state. Customize `InvalidModelStateResponseFactory` so binding errors match FluentValidation output:

```csharp
builder.Services.AddControllers()
    .ConfigureApiBehaviorOptions(options =>
    {
        options.InvalidModelStateResponseFactory = context =>
        {
            var errors = context.ModelState
                .Where(e => e.Value?.Errors.Count > 0)
                .ToDictionary(
                    kvp => kvp.Key,
                    kvp => kvp.Value!.Errors.Select(e => e.ErrorMessage).ToArray());

            return new BadRequestObjectResult(new ValidationProblemDetails(errors));
        };
    });
```

Normalize keys: camelCase for JSON clients, consistent with serializer settings. Angular sends camelCase; your `errors` keys should match.

## Angular: map errors without spaghetti

Create one `ApiErrorService`:

```typescript
export interface ApiProblemDetails {
  status: number;
  title: string;
  detail?: string;
  traceId?: string;
  errors?: Record<string, string[]>;
}

export function applyValidationErrors(
  form: FormGroup,
  errors: Record<string, string[]>
): void {
  for (const [key, messages] of Object.entries(errors)) {
    const control = form.get(key);
    if (control) {
      control.setErrors({ server: messages[0] });
      control.markAsTouched();
    }
  }
}
```

For nested forms, either flatten keys server-side to match control paths or maintain a small mapping table for known commands. I prefer server keys that match the form structure — less client magic.

Reactive forms show `control.errors?.['server']` under inputs. Toasts display `detail` for 409/500. The HTTP interceptor catches `HttpErrorResponse`, parses `error` as `ApiProblemDetails`, and routes to a shared handler.

Optional: log `traceId` to Application Insights from the client on 500s so users can paste one id in support tickets.

## OpenAPI and code generation

Document error responses on endpoints:

```csharp
[ProducesResponseType(typeof(HttpValidationProblemDetails), StatusCodes.Status400BadRequest)]
[ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
```

Angular teams benefit from generated types that include `errors`. Even without codegen, a checked-in example JSON in the repo README prevents drift.

## Bulk import and grid editing edge cases

Healthcare bulk CSV imports and marketplace inventory uploads fail with **row-level errors**. Two patterns:

1. **Synchronous small files:** return `400` with keys like `rows[12].Npi` in `errors`
2. **Async large jobs:** return `202` with a job id; poll a status endpoint that returns an error report document

Do not force row 847 of an import into the same envelope as a login form unless the UI is built for it. Sometimes a dedicated `ImportResultDto` with `rowErrors[]` is clearer — but still use ProblemDetails for the HTTP failure that rejected the upload entirely (wrong content type, virus scan failed).

## Security and UX boundaries

Validation messages should be **safe to show users** — no internal ids leaking schema hints attackers want. "Invalid credentials" beats "User not found" on login. Field-level messages on authenticated forms can be specific.

Log rich detail server-side; send sanitized detail client-side.

Rate-limit public validation-heavy endpoints (registration, contact forms) separately from authenticated APIs.

## Checklist before go-live

- All 400 validation paths return the same `errors` dictionary shape
- Model binding and FluentValidation share key naming rules
- Domain conflicts use 409 with `detail`, not fake field errors
- Every error response includes `traceId`
- Angular interceptor tested against sample ProblemDetails fixtures
- OpenAPI documents error types per route

Consistent validation envelopes turn API errors from a front-end guessing game into a predictable contract. That is one of the highest-leverage integrations between ASP.NET Core and Angular on multi-form SaaS products.

If you want your .NET API and Angular client aligned on validation, ProblemDetails, and error handling before your next release, [get in touch](/contact).

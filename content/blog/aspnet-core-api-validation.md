---
title: "FluentValidation in ASP.NET Core: One Error Envelope for Angular"
description: "FluentValidation in ASP.NET Core without the deprecated AspNetCore package — one ProblemDetails envelope, field errors Angular forms can bind, and validation in ASP.NET APIs."
date: "2026-08-17"
updated: "2026-09-12"
category: "architecture"
tags: ["ASP.NET Core", "Validation", "FluentValidation", "Problem Details", "Angular", "API Design"]
related:
  - aspnet-core-global-exception-handling
  - angular-dotnet-integration
  - aspnet-core-json-object-cycle
faq:
  - q: "What is FluentValidation?"
    a: "A .NET library for writing validation rules as classes (AbstractValidator<T>) instead of attributes. In ASP.NET Core I run those validators in one pipeline and map failures to ProblemDetails errors Angular forms can bind."
  - q: "How do I use FluentValidation in ASP.NET Core?"
    a: "Reference FluentValidation (not FluentValidation.AspNetCore). Register validators in DI, run IValidator<T> in a MediatR behavior or endpoint filter, and return the same errors dictionary as model binding."
  - q: "How should ASP.NET Core API validation return errors?"
    a: "One ProblemDetails (or equivalent) envelope with field errors Angular forms can bind. Do not return a string from login and a nested object from checkout."
  - q: "Should FluentValidation replace DataAnnotations?"
    a: "Use one pipeline, not both. FluentValidation wins for cross-field rules, collections, and async uniqueness. DataAnnotations are enough for a one-field DTO if that is the only pipeline. Domain policy after load is 409 in the handler — not a validator."
  - q: "Do 500s belong in the same envelope as 400s?"
    a: "Same family of ProblemDetails, different status. Unhandled exceptions are the global handler article. This page is expected 400s."
---

A consistent **validation envelope** returns one ProblemDetails shape with an `errors` dictionary Angular forms can bind — same keys for model binding, FluentValidation, and domain conflicts.

```text
Bad input → 400 ProblemDetails { errors: { field: ["msg"] } }
Conflict  → 409 ProblemDetails { detail: "..." }
Angular   → one interceptor parser
```

**New to this** → stay here. **Merging a PR** → [one envelope](#one-envelope-for-the-angular-client). **On-call / interview** → [FluentValidation vs DataAnnotations](#fluentvalidation-vs-dataannotations) · [when not to](#when-not-to-use-fluentvalidation) · [FluentValidation pipeline](#fluentvalidation-without-the-deprecated-mvc-package) · [if an interviewer asks](#if-an-interviewer-asks).

Nothing erodes trust in an API faster than three different error shapes for the same validation failure. The login form expects `{ message: string }`. The checkout endpoint returns `{ errors: { field: ["..."] } }`. A middleware wraps 500s in yet another envelope. The Angular team builds three parsers, misses edge cases, and users see "Something went wrong" when the server actually sent a useful field error.

I standardize **validation in ASP.NET** APIs early on every .NET + Angular project — healthcare patient intake forms, marketplace seller listings, admin bulk imports. The investment pays off when you add a fourth client or turn on global exception handling without breaking the SPA.

**FluentValidation** is the library I use for those rules. This post walks through the stack: FluentValidation **without** the deprecated `FluentValidation.AspNetCore` MVC package, `ProblemDetails`, a consistent validation envelope, and Angular consumption patterns that stay boring in a good way.

## FluentValidation vs DataAnnotations

Same command, two styles. This is the comparison people searching **FluentValidation** actually want.

DataAnnotations are **sticky notes on the form** — `[Required]`, `[MaxLength(120)]`. Fine when the rule lives on one field and never looks at another field or the database.

FluentValidation is a **building inspector with a clipboard** — cross-field rules, collections, async uniqueness checks. The inspector still does not decide whether this seller is *allowed* to list in a category. That is domain policy after you load state — 409, not 400.

```csharp
public sealed record CreateListingCommand(
    Guid SellerId,
    string Title,
    decimal Price,
    bool IsFreeListing,
    string Sku,
    Guid CategoryId,
    IReadOnlyList<ImageRef> Images);
```

**DataAnnotations** (what you outgrow):

```csharp
public sealed class CreateListingRequest
{
    [Required, MaxLength(120)]
    public string Title { get; set; } = "";

    [Range(0.01, 1_000_000)]
    public decimal Price { get; set; }

    [Required]
    public string Sku { get; set; } = "";
}
```

That covers empty title and a naive price floor. It does **not** cover:

- “Price must be greater than 0 **and** less than the category cap”
- “SKU unique for this seller” (needs the database)
- “Each image URL is https and ≤ 2 MB metadata”
- Conditional: “If `Price` is 0, `IsFreeListing` must be true”

**FluentValidation** (what I ship on command models):

```csharp
public sealed class CreateListingValidator : AbstractValidator<CreateListingCommand>
{
    public CreateListingValidator(ISkuLookup skus)
    {
        RuleFor(x => x.Title)
            .NotEmpty()
            .MaximumLength(120);

        RuleFor(x => x.Price)
            .GreaterThan(0)
            .When(x => !x.IsFreeListing)
            .WithMessage("Paid listings need a price greater than 0.");

        RuleFor(x => x.Sku)
            .NotEmpty()
            .MaximumLength(40)
            .MustAsync(async (cmd, sku, ct) =>
                !await skus.ExistsForSellerAsync(cmd.SellerId, sku, ct))
            .WithMessage("SKU already exists for this seller.");

        RuleForEach(x => x.Images)
            .SetValidator(new ImageRefValidator());
    }
}

public sealed record ImageRef(string Url);

public interface ISkuLookup
{
    Task<bool> ExistsForSellerAsync(Guid sellerId, string sku, CancellationToken ct);
}

public sealed class ImageRefValidator : AbstractValidator<ImageRef>
{
    public ImageRefValidator()
    {
        RuleFor(x => x.Url)
            .NotEmpty()
            .Must(u => u.StartsWith("https://", StringComparison.OrdinalIgnoreCase));
    }
}
```

| Need | DataAnnotations | FluentValidation |
|---|---|---|
| Required / max length / range | Yes — keep if the DTO is trivial | Yes |
| Cross-field rules | Awkward (`IValidatableObject`) | First-class `When` / `Must` |
| Collections (`RuleForEach`) | Painful | Native |
| Async uniqueness (NPI, SKU) | Not the right tool | `MustAsync` |
| Test the rules without HTTP | Attribute soup | `new CreateListingValidator(fake).Validate(cmd)` |
| Same rules from a worker / import | Attributes tied to MVC | Call `IValidator<T>` anywhere |

I do **not** stack both on the same DTO. Two pipelines → two error shapes → Angular writes two parsers. Pick one front door.

## When to use FluentValidation

- Command / request models that Angular posts (create listing, enroll provider, checkout)
- Collection and cross-field rules
- Async checks that are still **input shape** (unique SKU) — not authorization
- You want the same validator from HTTP, a CSV import, and a test

## When not to use FluentValidation

- **Domain policy after load:** “seller is not approved for this category.” That is 409 in the handler, not a field error on `categoryId` unless the UI is correcting input.
- **Trivial DTOs** with one `[Required]` string and no collections — DataAnnotations on the request type is enough *if* that is your only pipeline.
- **Replacing authorization.** `MustAsync` that checks “current user owns this clinic” is a policy, not validation. Use `[Authorize]` / resource handlers.
- **The deprecated `FluentValidation.AspNetCore` auto-validation package.** Call `IValidator<T>` yourself.

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

## FluentValidation without the deprecated MVC package

### FluentValidation.AspNetCore is the wrong package now

Jeremy Skinner deprecated **FluentValidation.AspNetCore** (the package that hooked automatic validation into ASP.NET Core MVC). The library authors want you to call `IValidator<T>` yourself. Automatic integration fought model binding, `ProblemDetails`, and endpoint routing in ways that produced two error shapes for one request.

What I do in 2026:

- Reference **FluentValidation** (and the DI extension package if you want assembly scanning)
- Do **not** `AddFluentValidationAutoValidation()` / `AddFluentValidationClientsideAdapters()` from the deprecated package
- Validate in a behavior or filter and map failures to the same `errors` dictionary as model binding (below)

If an old template still calls `services.AddFluentValidation()`, treat that as tech debt in the same PR as the envelope work. Data annotations can stay on DTOs for simple `[Required]` if you want; I still prefer FluentValidation for anything with collection rules or async checks (unique NPI in a clinic, SKU exists).

Pick one front door, not both silently.

```csharp
builder.Services.AddValidatorsFromAssemblyContaining<CreateListingValidator>();
builder.Services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));
```

```csharp
public sealed class ValidationBehavior<TRequest, TResponse>(
    IEnumerable<IValidator<TRequest>> validators)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        if (!validators.Any())
            return await next();

        var context = new ValidationContext<TRequest>(request);
        var results = await Task.WhenAll(
            validators.Select(v => v.ValidateAsync(context, cancellationToken)));

        var failures = results.SelectMany(r => r.Errors).Where(f => f is not null).ToList();
        if (failures.Count != 0)
            throw new ValidationException(failures);

        return await next();
    }
}
```

Map `ValidationException` to the same `errors` dictionary as model binding (below). For Minimal APIs without MediatR, an endpoint filter does the same work:

```csharp
public sealed class FluentValidationFilter<T> : IEndpointFilter where T : class
{
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context,
        EndpointFilterDelegate next)
    {
        var validator = context.HttpContext.RequestServices.GetService<IValidator<T>>();
        var model = context.Arguments.OfType<T>().FirstOrDefault();
        if (validator is null || model is null)
            return await next(context);

        var result = await validator.ValidateAsync(model, context.HttpContext.RequestAborted);
        if (result.IsValid)
            return await next(context);

        var errors = result.Errors
            .GroupBy(e => e.PropertyName)
            .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).ToArray());

        return Results.ValidationProblem(errors);
    }
}
```

Unit test the inspector without spinning Kestrel:

```csharp
[Fact]
public async Task Rejects_duplicate_sku()
{
    var skus = Substitute.For<ISkuLookup>();
    skus.ExistsForSellerAsync(default, "SKU-1", default).ReturnsForAnyArgs(true);

    var result = await new CreateListingValidator(skus).ValidateAsync(
        new CreateListingCommand(sellerId, "Chair", 12m, false, "SKU-1", categoryId, []));

    Assert.Contains(result.Errors, e => e.PropertyName == "Sku");
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

Swashbuckle vs built-in OpenAPI, Scalar, NSwag, JWT in the explorer, and Angular client pipelines: [Swagger vs OpenAPI in ASP.NET Core](/blog/swagger-openapi-aspnet-core).

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

## If an interviewer asks

ProblemDetails vs custom error JSON; FluentValidation vs DataAnnotations; when not to use FluentValidation; should 500s use the same envelope as 400s.

**Strong answer:** One ProblemDetails family for the SPA — 400 carries `errors` dictionary with field keys matching form paths; 409 for business conflicts with `detail`; 500 generic detail plus `traceId` in logs. FluentValidation for command models with collections, cross-field, or async uniqueness. DataAnnotations only if they are the *only* pipeline. Do not validate authorization or loaded-state policy in `MustAsync`. Call `IValidator<T>` yourself — skip `FluentValidation.AspNetCore` auto-validation.

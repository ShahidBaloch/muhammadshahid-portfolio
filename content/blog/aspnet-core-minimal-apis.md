---
title: "ASP.NET Core Minimal APIs: When to Use Them (and When Not To)"
description: "ASP.NET Core Minimal APIs for production — MapGet/MapPost, DI, validation, OpenAPI, auth, and when controllers still win for Angular-backed products."
date: "2026-08-10"
category: "architecture"
tags: ["Minimal APIs", "ASP.NET Core", ".NET", "Web API", "C#", "Architecture"]
---

**ASP.NET Core Minimal APIs** are not a toy for demos. They are a first-class way to ship HTTP endpoints with less ceremony — and a common source of spaghetti when teams dump business logic into `Program.cs`.

I use Minimal APIs for thin gateways, internal tools, and vertical slices. I keep controllers (or carefully organized endpoint classes) when Angular admin surfaces need many actions, filters, and shared conventions.

## What Minimal APIs give you

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDbContext<AppDbContext>(...);
builder.Services.AddScoped<IOrderService, OrderService>();

var app = builder.Build();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

app.MapGet("/api/orders/{id:guid}", async (
    Guid id,
    IOrderService orders,
    CancellationToken ct) =>
{
    var order = await orders.GetAsync(id, ct);
    return order is null ? Results.NotFound() : Results.Ok(order);
});

app.Run();
```

DI parameters bind automatically. Return `IResult` helpers (`Results.Ok`, `Results.NotFound`, `Results.ValidationProblem`).

## Organize so Program.cs does not become a landfill

```csharp
// Endpoints/OrderEndpoints.cs
public static class OrderEndpoints
{
    public static RouteGroupBuilder MapOrders(this WebApplication app)
    {
        var group = app.MapGroup("/api/orders").RequireAuthorization();

        group.MapGet("/{id:guid}", GetByIdAsync);
        group.MapPost("/", CreateAsync);

        return group;
    }

    private static async Task<IResult> GetByIdAsync(
        Guid id,
        IOrderService orders,
        CancellationToken ct)
    {
        var order = await orders.GetAsync(id, ct);
        return order is null ? Results.NotFound() : Results.Ok(order);
    }
}
```

```csharp
app.MapOrders();
```

Same SRP rule as controllers: endpoints are HTTP adapters. Pricing and persistence stay in services/handlers.

## Validation without MVC attributes everywhere

Options that work well:

1. **FluentValidation** filters / endpoint filters
2. **DataAnnotations** + `MiniValidator` / built-in validation where available
3. Explicit guard clauses for tiny endpoints

```csharp
app.MapPost("/api/orders", async (
    CreateOrderRequest request,
    ICreateOrderHandler handler,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Sku))
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["sku"] = ["SKU is required."]
        });

    var created = await handler.HandleAsync(request, ct);
    return Results.Created($"/api/orders/{created.Id}", created);
});
```

Angular forms need stable problem details — same as MVC. See [API validation envelopes](/blog/aspnet-core-api-validation).

## Auth, OpenAPI, and versioning

```csharp
builder.Services.AddAuthentication().AddJwtBearer(...);
builder.Services.AddAuthorization();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

app.UseAuthentication();
app.UseAuthorization();

var orders = app.MapGroup("/api/v1/orders").RequireAuthorization("ManageOrders");
```

Minimal APIs play fine with JWT policies you already use for Angular SPAs. Document claims the same way you would on controllers.

## Controllers vs Minimal APIs — honest tradeoffs

| Prefer Minimal APIs when… | Prefer Controllers when… |
|---|---|
| Few endpoints, clear vertical slices | Large admin API surface |
| Gateway / BFF / health / webhooks | Heavy filter pipelines and conventions already exist |
| Team likes function-style composition | Existing MVC codebase — rewrite cost > benefit |
| Prototypes that might stay small | Many shared base controller behaviors |

Ecom_NET10-style catalogs with dozens of merchandising actions still felt clearer as controllers. A CarBazaar webhook receiver was cleaner as Minimal API groups.

## Performance note

Minimal APIs are lightweight, but **your EF queries and auth** dominate latency. Switching endpoint style will not fix N+1 SQL. Measure before celebrating.

## Failure story: everything in Program.cs

A team put 40 Map* calls, DTO mapping, and EF queries in one file “because Minimal APIs are simple.” Code review became impossible; Angular contract changes took hours to find. We extracted endpoint classes and handlers — Minimal APIs stayed, the landfill left.

## Delivery checklist

1. Endpoints live in groups/classes — not a 2,000-line `Program.cs`
2. Business logic in services/handlers, not lambdas
3. JWT / policies applied via `RequireAuthorization`
4. Validation returns consistent problem details for Angular
5. OpenAPI covers the routes the SPA consumes
6. Async + `CancellationToken` end to end
7. Decide controller vs Minimal API per bounded context, not as ideology

## Related reading

- [C# Async and Await in ASP.NET Core](/blog/csharp-async-await-aspnet-core)
- [Clean Architecture in ASP.NET Core](/blog/clean-architecture-aspnet-core)
- [ASP.NET Core JWT Auth checklist](/blog/aspnet-core-jwt-auth)

Need help choosing Minimal APIs vs controllers for a new .NET + Angular slice? [Contact me](/contact) with the endpoint list and we can sketch the shape before the folder structure locks in.

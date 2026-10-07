---
title: "Hot Chocolate GraphQL in ASP.NET Core: Queries and Mutations"
description: "Hot Chocolate GraphQL in ASP.NET Core — schema definition, queries, mutations, subscriptions, and auth integration patterns."
date: "2026-10-01"
category: "api-design"
tags: ["ASP.NET Core", "GraphQL", "Hot Chocolate", "Angular", "C#"]
related:
  - api-design-principles
  - ef-core-nplus1-include-vs-assplitquery
  - aspnet-core-rbac-guide
  - swagger-openapi-aspnet-core
  - mediatr-cqrs-aspnet-core
faq:
  - q: "What is Hot Chocolate GraphQL in ASP.NET Core?"
    a: "Hot Chocolate is a .NET GraphQL server. You define a schema (types, queries, mutations), map resolvers to your domain or EF Core, and expose a single endpoint Angular or a BFF can query with typed operations."
  - q: "Should I replace REST with GraphQL in every ASP.NET Core API?"
    a: "No. Use GraphQL when clients need flexible field selection across related graphs and you can invest in schema governance. Keep REST for simple CRUD, file uploads, webhooks, and public partner APIs that expect OpenAPI."
  - q: "Does Hot Chocolate fix EF Core N+1 by itself?"
    a: "No. Naive field resolvers that hit the database per parent row recreate N+1. Use DataLoader (or batched projections) — covered briefly here; treat a dedicated DataLoader post as the deep dive."
---

**Hot Chocolate GraphQL in ASP.NET Core** is a typed schema over your domain: clients ask for exactly the fields they need in one round trip, while your server still owns authorization, validation, and how data is loaded from SQL.

```text
Angular / BFF
    │  POST /graphql  { query, variables }
    ▼
Hot Chocolate endpoint
    │  auth → validation → resolvers / DataLoader
    ▼
EF Core / domain services → SQL
```

Think of GraphQL as a **menu with composition rules**, not a free-for-all SQL proxy. The schema is the contract. Resolvers are the kitchen. DataLoader is the batch cook so you do not fire one query per table row.

**New to this** → stay here for schema, queries, mutations, and Angular notes. **REST design habits** → [API design principles](/blog/api-design-principles). **N+1 in EF** → [Include vs AsSplitQuery](/blog/ef-core-nplus1-include-vs-assplitquery). **Policies** → [RBAC guide](/blog/aspnet-core-rbac-guide).

Search intent for **hot chocolate graphql asp.net core** is a how-to primer: get a working schema with queries and mutations, understand where GraphQL helps Angular SPAs, and avoid the traps that make GraphQL slower than the REST you already ship.

## When GraphQL is worth adopting vs staying REST

I reach for Hot Chocolate when:

- Angular screens stitch **related graphs** (order + lines + customer + shipment status) and REST forces 3–5 round trips or over-fetching fat DTOs.
- Multiple clients (admin SPA, mobile, partner BFF) need **different slices** of the same model without a DTO explosion.
- The team will treat the schema as a product: versioning mindset, naming reviews, and performance budgets.

I stay on REST (and [Swagger/OpenAPI](/blog/swagger-openapi-aspnet-core)) when:

- Resources are mostly flat CRUD with stable URLs partners already integrate.
- File upload, long-running exports, or webhook callbacks dominate (GraphQL can do some of this; REST is clearer).
- The team is not ready to own schema governance — a free-form graph without auth and batching becomes an expensive SQL generator.

Honest tradeoff: GraphQL reduces **over-fetching of fields** and **under-fetching of related data** when done well. It does **not** remove caching complexity, auth complexity, or the need for CQRS-style command boundaries on writes. Mutations should still call application services or MediatR handlers — see [MediatR and CQRS](/blog/mediatr-cqrs-aspnet-core) — not mutate `DbContext` from a 40-line resolver.

## Hot Chocolate project setup in ASP.NET Core

Packages (versions float; pin what your SDK supports):

```bash
dotnet add package HotChocolate.AspNetCore
dotnet add package HotChocolate.Data.EntityFramework
```

Minimal hosting:

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(/* ... */);

builder.Services
    .AddGraphQLServer()
    .AddAuthorization()
    .AddQueryType<Query>()
    .AddMutationType<Mutation>()
    .RegisterDbContext<AppDbContext>(DbContextKind.Pooled)
    .AddProjections()
    .AddFiltering()
    .AddSorting();

var app = builder.Build();

app.MapGraphQL("/graphql"); // Banana Cake Pop in Development by default
app.Run();
```

Notes that matter in production:

1. **Path** — `/graphql` next to `/api` is fine. Host REST and GraphQL together; do not force a rewrite of every controller on day one.
2. **Pooled DbContext** — Hot Chocolate can resolve fields concurrently; pooled or factory registration avoids "second operation on this context" failures ([EF second operation](/blog/ef-core-second-operation-dbcontext)).
3. **Auth middleware order** — JWT authentication still runs in the ASP.NET pipeline before GraphQL executes. Field policies are authorization *inside* the schema; they do not replace `[Authorize]` at the HTTP edge for "must be logged in."

## Queries, mutations, and schema organization

Start with explicit types — not "expose every EF entity."

```csharp
public class OrderType : ObjectType<Order>
{
    protected override void Configure(IObjectTypeDescriptor<Order> descriptor)
    {
        descriptor.BindFieldsExplicitly();
        descriptor.Field(o => o.Id);
        descriptor.Field(o => o.OrderNumber);
        descriptor.Field(o => o.Status);
        descriptor.Field(o => o.CreatedUtc);
        descriptor.Field("lines")
            .ResolveWith<OrderResolvers>(r => r.GetLinesAsync(default!, default!));
    }
}

public class Query
{
    [UsePaging]
    [UseProjection]
    [UseFiltering]
    [UseSorting]
    public IQueryable<Order> GetOrders([Service] AppDbContext db)
        => db.Orders.AsNoTracking();

    public async Task<Order?> GetOrderById(
        Guid id,
        [Service] AppDbContext db,
        CancellationToken ct)
        => await db.Orders.AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == id, ct);
}
```

Mutations should look like commands, not "patch any field":

```csharp
public record PlaceOrderInput(Guid CustomerId, IReadOnlyList<PlaceOrderLineInput> Lines);
public record PlaceOrderLineInput(Guid ProductId, int Quantity);

public class Mutation
{
    public async Task<PlaceOrderPayload> PlaceOrder(
        PlaceOrderInput input,
        [Service] IOrderService orders,
        CancellationToken ct)
    {
        var id = await orders.PlaceAsync(input, ct);
        return new PlaceOrderPayload(id);
    }
}

public record PlaceOrderPayload(Guid OrderId);
```

Schema organization I use on mid-size APIs:

| Folder / type | Responsibility |
|---|---|
| `Query` / `Mutation` roots | Thin entry points |
| `Types/` | ObjectType configuration, field policies |
| `Resolvers/` | Nested field loading |
| `DataLoaders/` | Batched loads (sibling deep dive) |
| Application services | Business rules and transactions |

Do **not** put discount rules inside a GraphQL resolver. The resolver calls the same `IOrderService` your REST `POST /orders` would call. That keeps CQRS/use-case boundaries intact whether the transport is HTTP JSON or GraphQL.

## EF Core + DataLoader N+1 preview

This is the footgun. A nested field like:

```csharp
descriptor.Field("customer")
    .Resolve(async ctx =>
    {
        var order = ctx.Parent<Order>();
        var db = ctx.Service<AppDbContext>();
        return await db.Customers.FindAsync(order.CustomerId);
    });
```

…on a page of 50 orders becomes 50 customer queries. Same class of bug as missing `Include` / bad split queries in REST — see [N+1 Include vs AsSplitQuery](/blog/ef-core-nplus1-include-vs-assplitquery).

Hot Chocolate's answer is **DataLoader**: batch keys in one round, cache per request. Sketch:

```csharp
public class CustomerByIdDataLoader : BatchDataLoader<Guid, Customer>
{
    private readonly IDbContextFactory<AppDbContext> _factory;

    public CustomerByIdDataLoader(
        IDbContextFactory<AppDbContext> factory,
        IBatchScheduler scheduler,
        DataLoaderOptions options)
        : base(scheduler, options) => _factory = factory;

    protected override async Task<IReadOnlyDictionary<Guid, Customer>> LoadBatchAsync(
        IReadOnlyList<Guid> keys,
        CancellationToken ct)
    {
        await using var db = await _factory.CreateDbContextAsync(ct);
        return await db.Customers.AsNoTracking()
            .Where(c => keys.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, ct);
    }
}
```

Wire the field to `ctx.DataLoader<CustomerByIdDataLoader>().LoadAsync(order.CustomerId)`. Treat full DataLoader patterns, GreenDonut options, and projection interplay as a sibling article — here the rule is: **never ship nested DB calls without a batching plan.**

`[UseProjection]` can push field selection into SQL for root queries. It is powerful and easy to misuse with computed fields. Start simple: explicit resolvers + DataLoader for graphs you understand, then add projections where profiling shows value.

## Auth: field policies overview

GraphQL has one URL. That does **not** mean one authorization decision.

```csharp
descriptor.Field(o => o.InternalCost)
    .Authorize("ViewOrderCosts");

descriptor.Field("lines")
    .Authorize("ViewOrders");
```

Combine with ASP.NET Core policies from the [RBAC guide](/blog/aspnet-core-rbac-guide). For object-level checks (can this user see *this* order?), authorize after load — same BOLA discipline as REST. A field policy that only checks "authenticated" is not enough for `/orders/{id}` equivalents.

Also decide:

- **Introspection** — disable or restrict in production.
- **Persisted queries** — strongly recommended for public SPAs to limit arbitrary query cost.
- **Max depth / complexity** — turn on limits before an Angular screen asks for `orders { lines { product { … } } }` ten levels deep.

## Hosting REST and GraphQL together

You do not need a big-bang migration. Pattern I ship:

- Keep `/api/v1/...` for stable partner contracts and file endpoints.
- Add `/graphql` for the Angular admin SPA that benefits from field selection.
- Share authentication, ProblemDetails-style error mapping where possible, and the same application services.

Document both. OpenAPI stays for REST; GraphQL gets SDL + Banana Cake Pop in non-prod. Do not pretend Swagger describes your GraphQL schema.

## Angular client consumption patterns

Angular talks to Hot Chocolate with `HttpClient` + `apollo-angular`, or raw POST:

```typescript
interface GraphQlResponse<T> {
  data?: T;
  errors?: Array<{ message: string; path?: string[]; extensions?: Record<string, unknown> }>;
}

placeOrder(input: PlaceOrderInput) {
  const query = `
    mutation PlaceOrder($input: PlaceOrderInput!) {
      placeOrder(input: $input) { orderId }
    }`;
  return this.http.post<GraphQlResponse<{ placeOrder: { orderId: string } }>>(
    '/graphql',
    { query, variables: { input } }
  );
}
```

Habits that reduce rework with ASP.NET Core backends (see [Angular + .NET integration](/blog/angular-dotnet-integration)):

1. **Typed operations** — generate or hand-maintain operation documents; do not stringify ad-hoc queries in every component.
2. **Error envelope** — GraphQL errors live under `errors[]`; map `extensions.code` to the same UX paths you use for ProblemDetails on REST.
3. **Auth header** — same interceptor as REST JWT; GraphQL is still Bearer (or cookie BFF).
4. **Caching** — Apollo cache ≠ your Redis; decide per operation. Mutations that place orders should invalidate or refetch deliberately.

## Operational checklist

1. Schema review: explicit bindings, no accidental EF entity dump.
2. Auth: HTTP authentication + field policies + object checks on sensitive nodes.
3. N+1: DataLoader or projections verified with SQL logging on a realistic page size.
4. Limits: max depth, complexity, and prefer persisted queries for the SPA.
5. Introspection off (or locked down) in production.
6. Mutual TLS / network rules same as REST API — GraphQL is not "internal only" by magic.
7. Observability: log operation name, duration, and error codes (not full variable dumps with PII).
8. Dual-stack: REST partners unaffected; Angular team has a clear "use GraphQL for these screens" rule.

## Pitfalls

- **Exposing EF entities directly** — leaks navigation properties, soft-delete flags, and future columns into your public contract.
- **Fat mutations that bypass domain services** — duplicates logic already in REST commands.
- **Ignoring authorization because "the query is read-only"** — reads are where BOLA lives.
- **No query cost limits** — one malicious operation can fan out into thousands of SQL calls.
- **Assuming GraphQL caching is free** — CDN caching POST `/graphql` is hard; design accordingly.

## Verification

1. Banana Cake Pop (Development): run `GetOrderById` and a `PlaceOrder` mutation against a seeded database.
2. Enable EF sensitive logging in Dev only: confirm one batched SQL for nested customers, not N+1.
3. Call a cost field without the policy role → GraphQL auth error / null per your nullability settings; confirm HTTP still 200 with `errors` or your chosen error mode — document what Angular expects.
4. Hit `/graphql` without a token on a locked-down server → 401 from ASP.NET auth middleware.
5. Load test a worst-case operation with depth limits enabled; confirm rejection before SQL melt.

## If an interviewer asks

**"How do you add GraphQL to an existing ASP.NET Core API?"**  
Add Hot Chocolate beside REST, share auth and application services, start with a bounded schema for the SPA screens that need graphs, and add DataLoader before nested fields hit production.

**"GraphQL vs REST?"**  
Transport and contract style. REST wins for simple resources and OpenAPI ecosystems. GraphQL wins for flexible client-driven reads when you invest in schema and batching. Many products run both.

## Related

**Related:** [API design principles](/blog/api-design-principles) · [EF Core N+1](/blog/ef-core-nplus1-include-vs-assplitquery) · [RBAC policies](/blog/aspnet-core-rbac-guide) · [Swagger/OpenAPI](/blog/swagger-openapi-aspnet-core) · [MediatR CQRS](/blog/mediatr-cqrs-aspnet-core)

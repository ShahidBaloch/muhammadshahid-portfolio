---
title: "Vertical Slice vs Clean Architecture in ASP.NET Core"
description: "When an ASP.NET Core API should use vertical slice architecture instead of Clean Architecture, and how to keep one DbContext without four projects per feature."
date: "2026-09-18"
updated: "2026-09-18"
category: "architecture"
tags: ["Vertical Slice", "Clean Architecture", "ASP.NET Core", "MediatR"]
related:
  - clean-architecture-aspnet-core
  - modular-monolith-vs-microservices-dotnet
  - mediatr-cqrs-aspnet-core
  - repository-pattern-dotnet
faq:
  - q: "What is the difference between vertical slice and Clean Architecture?"
    a: "Clean Architecture groups code by layer: domain, application, infrastructure, API. Vertical slice groups code by feature. A change to 'create order' stays in one folder instead of crossing four projects."
  - q: "Should I use MediatR for vertical slices?"
    a: "Only if you want a mediator. A slice can be a minimal API endpoint, a validator, and a handler method in one file. MediatR is a bus, not the architecture."
  - q: "Can vertical slice and Clean Architecture live in one solution?"
    a: "Yes, at module scale. A modular monolith can use Clean boundaries between modules and slices inside a module. Doing both for every endpoint is two structures for one request."
---

Clean Architecture is a dependency rule. Vertical slice is a folder rule. Teams lose weeks applying the dependency rule to a five-endpoint API. They also lose weeks dumping every feature into `Controllers`, `Services`, and `Repositories`.

The Clean walkthrough is [Clean Architecture without over-engineering](/blog/clean-architecture-aspnet-core). Module boundaries are [modular monolith vs microservices](/blog/modular-monolith-vs-microservices-dotnet).

## Real-world analogy

Clean Architecture is a hospital organized by department: labs on one floor, wards on another, billing in another building. A single patient's visit crosses all three. Vertical slice is a clinic organized by visit type: the flu room has its own desk, its own chart, and its own exit. You still share the hospital's power and water. You do not build a second power plant per room, and you do not send a flu patient through billing's building to get a tissue.

## Worked example

Adding "cancel order" in a four-project Clean solution touches the domain entity, an application command, an infrastructure repository, and a controller. The change is one rule: set a status and write a row. A slice keeps the request record, the check, and the `SaveChanges` in `Features/Orders/CancelOrder.cs`, registered on a group. The shared `DbContext` stays in one place. Six months later a second app, a worker, needs the same cancel rule. That is the moment to lift the rule into a shared project, not the moment you start, and not a reason to add the four projects on day one.

## What each one optimizes

| | Clean Architecture | Vertical slice |
|---|---|---|
| Code is grouped by | Technical layer | One use case |
| A feature change touches | Several projects | One folder |
| Pays off when | Domain rules are shared by more than one app, or the module is large | One API, one team, features ship independently |
| Cost | Project ceremony, mapping, interfaces nobody swaps | A shared `DbContext` and a `Common` folder that become a junk drawer |

## A slice

```text
Features/
  Orders/
    CreateOrder.cs
    GetOrder.cs
    ListOrders.cs
  Catalog/
    SearchProducts.cs
```

`CreateOrder.cs` holds the request DTO, the validator, and the method that uses `AppDbContext`. The endpoint is registered next to it:

```csharp
public static class CreateOrderEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapPost("/api/v1/orders", Handle);

    private static async Task<IResult> Handle(
        CreateOrderRequest request,
        AppDbContext db,
        CancellationToken ct)
    {
        // validate, save, return the DTO
        return Results.Ok();
    }
}
```

No `IOrderService`. No repository unless a query is reused by several slices and is worth a name. The [repository pattern](/blog/repository-pattern-dotnet) post is the bar: a pass-through repository is noise.

A mediator is optional. If the team already uses one, the slice is the handler plus the request. The license question is separate: [MediatR and alternatives](/blog/mediatr-license-wolverine-alternative). Do not adopt a bus so the folders look like a sample.

## When Clean Architecture is the right one

- More than one host uses the same rules (API and a worker, or two modules).
- You need a hard rule that UI and EF types do not leak into domain code.
- The domain is the product. The endpoints are a shell.

Then the projects earn their keep. If every interface has one implementation and the "domain" is property bags, you built the diagram from the other post without the reason.

## How not to mix them

Do not put a `Domain` project, an `Application` project, and a `Features` folder that also owns the same request. Pick the seam:

- Between modules: Clean or a module boundary. One database owner per module. See the modular monolith post.
- Inside a module: slices.

Shared kernel stays small: identity of the user, a clock, the `DbContext` registration. The moment `Common/Helpers` has order pricing, the slice has failed and Clean Architecture would have failed too.

Ecom-sized API where features outnumber layers: [Ecom_NET10](/work/ecom-net10).

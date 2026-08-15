---
title: "MediatR Commercial License vs Wolverine (and When to Stay)"
description: "A practical ASP.NET Core decision guide after MediatR’s commercial licensing: when I stay on MediatR, when I migrate to Wolverine, and when CQRS does not need a mediator at all."
date: "2026-08-15"
category: "cqrs"
tags: ["MediatR", "Wolverine", "CQRS", "ASP.NET Core", ".NET"]
---

When MediatR’s licensing changed, a lot of teams did not ask “what does our architecture need?” They asked “what is the replace-NuGet story?” That is how you get a three-week migration that ships the same handlers with a new namespace and a new way to fail in production.

I have shipped ASP.NET Core APIs with MediatR, without a mediator, and with Wolverine-style in-process messaging. This article is a **decision and migration** note: stay, switch, or delete the bus. It is not legal advice. License terms change — read Lucky Penny / MediatR and Wolverine’s current licenses for **your** company size and product before you act.

For how I use CQRS-lite when a mediator is already in the solution, see [MediatR and CQRS-lite](/blog/mediatr-cqrs-aspnet-core).

## What actually changed for teams

MediatR moved from “grab it and go” to a model where **many production uses require a commercial license**. That is a business event, not a technical indictment of the library. Jimmy Bogard’s library still does the same in-process request/handler dispatch it always did.

Your options, honestly ranked by how often they are the right answer:

1. **Buy the license** and keep shipping
2. **Remove the mediator** and call application services
3. **Migrate to another in-process bus** (Wolverine is the name people search)

Option 3 is the blog-click option. Option 1 or 2 is what I recommend more often.

## When I stay on MediatR

Stay if **all** of these are true:

- You already have pipeline behaviors you trust (logging, validation, transactions)
- Handlers are the team’s vocabulary
- The license cost is smaller than a migration quarter
- You are not blocked by a feature MediatR does not have

I treat MediatR as **in-process dispatch + behaviors**. If that is all you needed, paying for a mature library is a senior decision. Rewriting forty handlers to avoid an invoice is not automatically virtuous.

Also stay if the project is in the middle of a healthcare go-live. Auth and EDI bugs do not get easier because the mediator changed.

## When I drop the mediator entirely

A surprising number of ASP.NET Core APIs used MediatR as a **fancy function call**:

```csharp
await _mediator.Send(new GetOrderByIdQuery(id), ct);
```

which is equivalent to:

```csharp
await _orders.GetByIdAsync(id, ct);
```

If you have no behaviors (or one behavior that is really a filter), no notifications, and no runtime handler composition, `IMediator` is ceremony. After a license shock, that is the cheapest “migration”:

- Controllers or Minimal API endpoints call application services
- Validation stays in [FluentValidation or endpoint filters](/blog/aspnet-core-api-validation)
- Transactions stay in the service or a decorator you own

You can still name types `GetOrderById` if that helps. CQRS is a **split of writes and reads**, not a NuGet reference.

Search intent “CQRS without MediatR ASP.NET Core” is this paragraph. Do not add Wolverine to avoid naming a service.

## When Wolverine is a real upgrade (not a protest vote)

Wolverine (JasperFx) is an in-process (and optionally messaging) framework with a different ambition: handlers as methods, durable messaging, transactional outbox stories, less `IRequest<T>` interface noise.

I consider it when:

- You **want** messaging, retries, and outbox — not only `Send`
- The team is willing to learn Wolverine’s conventions
- You are starting a bounded context, not rewriting a stable MediatR island during peak season

I do **not** consider it when the only requirement is “MediatR now costs money.” That requirement is solved by money or by deleting the bus.

## Migration sketch (MediatR → Wolverine) without lying about effort

Map the concepts; then budget tests.

| MediatR | Wolverine-ish equivalent |
| --- | --- |
| `IRequest<T>` / `IRequestHandler` | Handler method on a class Wolverine discovers |
| `IPipelineBehavior` | Middleware / wrapping conventions |
| `INotification` | Publish / cascading messages |
| `IMediator.Send` | `IMessageBus.Invoke` (names vary by version — check docs) |

What bites in real ASP.NET Core apps:

- **Lifetime:** MediatR handlers are often transient; Wolverine’s handler scoping must match your `DbContext`
- **Validation:** a MediatR FluentValidation behavior does not magically become Wolverine middleware
- **Notifications:** fire-and-forget in MediatR is already a source of lost emails; durable messaging changes that — on purpose
- **Tests:** you mocked `IMediator`. Now you either invoke handlers directly (better) or mock a different bus

I migrate **one vertical slice** (one command + one query + its tests) and measure. If the slice needs a week of convention fighting, stop and re-read option 1 and 2.

Example of the target shape I like — a handler that is a use case, not a wrapper:

```csharp
public static class ApproveClaim
{
    public sealed record Command(Guid ClaimId, Guid ApproverId);

    public sealed class Handler
    {
        private readonly AppDbContext _db;

        public Handler(AppDbContext db) => _db = db;

        public async Task Handle(Command command, CancellationToken ct)
        {
            var claim = await _db.Claims.SingleAsync(c => c.Id == command.ClaimId, ct);
            claim.Approve(command.ApproverId);
            await _db.SaveChangesAsync(ct);
        }
    }
}
```

Whether MediatR, Wolverine, or `ApproveClaimService` invokes that method is a **hosting** choice. Keep the domain logic in a place you can test without a bus.

## Pipeline behaviors and FluentValidation

If your best MediatR feature was `ValidationBehavior`, you can keep that design on any host:

- MediatR: keep the behavior, pay the license if required
- No mediator: validate in Minimal API filters or an application service base
- Wolverine: use its middleware or validate at the HTTP edge before `Invoke`

Do not migrate solely to “keep behaviors.” Behaviors are twenty lines you can write.

## A decision I write in the README

I make the team pick one sentence:

> We use MediatR because we licensed it and behaviors are load-bearing.

or

> We call application services; CQRS is folder and naming discipline.

or

> We use Wolverine because we need its messaging/outbox, not because Twitter was loud.

If nobody can sign a sentence, you are shopping.

---

If you need a calm MediatR / Wolverine / no-bus decision on an existing ASP.NET Core solution — including a slice-level migration plan — [contact me](/contact). Bring a handler count and whether you use notifications. That changes the answer more than the brand names.

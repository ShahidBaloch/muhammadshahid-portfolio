---
title: "MediatR and CQRS-Lite in ASP.NET Core — Ceremony vs Delivery"
description: "MediatR in C# / ASP.NET Core — when CQRS-lite handlers and pipeline behaviors help a product team ship faster, and when extra folders slow healthcare and SaaS delivery down."
date: "2026-04-28"
updated: "2026-09-12"
category: "cqrs"
tags: ["MediatR", "CQRS", "ASP.NET Core", ".NET", "C#"]
related:
  - mediatr-license-wolverine-alternative
  - clean-architecture-aspnet-core
  - csharp-factory-pattern
faq:
  - q: "When should I use MediatR in ASP.NET Core?"
    a: "When you have real cross-cutting behaviors and many use cases. Skip it when the team spends more time naming folders than shipping checkout."
  - q: "Is MediatR required for CQRS?"
    a: "No. CQRS-lite is commands and queries as separate requests. MediatR is one dispatcher. A handler class plus a service is still CQRS-lite. License vs Wolverine is a separate URL."
  - q: "What is MediatR in C#?"
    a: "A library that sends IRequest<T> to one IRequestHandler<T> through optional IPipelineBehavior middleware — validation, logging, transactions — so controllers stay thin."
  - q: "Is CQRS-lite the same as event sourcing?"
    a: "No. CQRS-lite is commands and queries as separate requests. Event sourcing is a different bet. This page is the first, not the second."
  - q: "Do I need a handler per controller action?"
    a: "Not by law. One handler per use case is the usual shape. License vs Wolverine is a separate URL."
---

**CQRS-lite** splits commands (writes) from queries (reads) as separate request types with one handler each. **MediatR** dispatches those requests through a pipeline where cross-cutting behaviors — validation, logging, transactions — attach once.

```text
Controller → IMediator.Send(GetClaimsReportQuery)
                    │
            Pipeline behaviors
                    │
            GetClaimsReportHandler → DbContext (read)
```

**New to this** → stay here. **Merging a PR** → [what CQRS-lite means](#what-i-mean-by-cqrs-lite). **On-call / interview** → [when to add MediatR](#what-mediatr-buys-a-product-team) · [when to skip](#when-ceremony-starts-costing-delivery) · [if an interviewer asks](#if-an-interviewer-asks).

I have introduced MediatR on greenfield SaaS APIs, inherited it on healthcare platforms with forty handlers per bounded context, and removed it from a eCommerce checkout service where the team spent more time naming folders than fixing bugs. MediatR is not good or bad. **CQRS-lite** — commands and queries as separate request types with thin controllers — is a delivery tool. It helps or hurts depending on team size, product churn, and how much cross-cutting behavior you actually need.

This post is my practical line for when I add MediatR to an ASP.NET Core solution and when I keep controllers talking to application services directly. **CQRS-lite** is the rule that writes and reads are separate request types. **MediatR** is one dispatcher — you can have the rule without the library.

## MediatR in C# / ASP.NET Core

**MediatR in C#** is a dispatcher: `IMediator.Send(request)` finds one `IRequestHandler<TRequest, TResponse>` and runs optional `IPipelineBehavior` middleware first. That is all. It is not required for CQRS, not a substitute for Clean Architecture, and not a reason to wrap `GetById` in three files.

```csharp
await _mediator.Send(new GetClaimsReportQuery(from, to, clinicId), ct);
```

Controllers stay HTTP adapters. The handler owns the use case. Behaviors own validation / logging / transactions once.

## What I mean by CQRS-lite

Full CQRS often implies separate read and write models, event sourcing, and projection rebuild pipelines. That is rare in the client work I do. **CQRS-lite** means:

- **Commands** change state (create order, approve claim, publish listing)
- **Queries** read state (paged order list, patient summary, seller dashboard metrics)
- One handler per use case, invoked through MediatR

```csharp
public sealed record GetClaimsReportQuery(DateOnly From, DateOnly To, Guid ClinicId)
    : IRequest<ClaimsReportDto>;

public sealed class GetClaimsReportHandler : IRequestHandler<GetClaimsReportQuery, ClaimsReportDto>
{
    private readonly AppDbContext _db;

    public GetClaimsReportHandler(AppDbContext db) => _db = db;

    public async Task<ClaimsReportDto> Handle(GetClaimsReportQuery request, CancellationToken ct)
    {
        var rows = await _db.Claims.AsNoTracking()
            .Where(c => c.ClinicId == request.ClinicId
                        && c.ServiceDate >= request.From
                        && c.ServiceDate <= request.To)
            .GroupBy(_ => 1)
            .Select(g => new ClaimsReportDto(
                g.Count(),
                g.Sum(c => c.Amount)))
            .FirstOrDefaultAsync(ct);

        return rows ?? new ClaimsReportDto(0, 0);
    }
}
```

No event store. No mandatory read database. Just a consistent place to put use-case logic so controllers stay thin.

## What MediatR buys a product team

MediatR shines when several forces align.

**Cross-cutting pipeline behaviors.** Validation, logging, transactions, and authorization checks fit cleanly as `IPipelineBehavior` implementations. For FluentValidation wiring and a full `ValidationBehavior`, see the [ASP.NET Core validation guide](/blog/aspnet-core-api-validation#fluentvalidation-without-the-deprecated-mvc-package). Here is a logging behavior that shows the same pattern without duplicating validation code:

```csharp
public sealed class LoggingBehavior<TRequest, TResponse>(
    ILogger<LoggingBehavior<TRequest, TResponse>> logger)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken ct)
    {
        var name = typeof(TRequest).Name;
        logger.LogInformation("Handling {Command}", name);
        var response = await next();
        logger.LogInformation("Handled {Command}", name);
        return response;
    }
}
```

Register once; every command gets structured logs. Controllers do not repeat `if (!ModelState.IsValid)` when validation lives in its own behavior.

**Consistent unit testing.** Handlers are plain classes. Tests call `Handle` with a fake `DbContext` or repository. No `TestServer` required for business rules.

**Feature-oriented folders.** In healthcare APIs, folders like `Claims/ApproveClaim`, `Claims/GetClaimById` map to how product owners talk about work. New engineers find code faster than a flat `Services/ClaimService.cs` with forty methods.

**Multiple entry points.** The same command from an HTTP controller, a background worker, or an integration test:

```csharp
await _mediator.Send(new ApproveClaimCommand(claimId, reviewerId), ct);
```

That matters when Azure Service Bus or Hangfire jobs duplicate logic that used to live only in controllers.

## When ceremony starts costing delivery

MediatR is a **hospital paging operator** — page “approve this claim” when the message needs a checklist (validation, logging, a worker replay). Do not page “get chart for room 12”; walk to the nurse (`GetById` on a service).

MediatR becomes drag when the team treats every CRUD endpoint as a three-file ceremony (command, handler, validator) without shared behavior or complex rules.

Warning signs I watch for:

- **Pass-through handlers** that only call `_repository.GetByIdAsync` and return the result with no validation, mapping, or side effects
- **Query objects with one property** wrapped because "we always use MediatR"
- **Deep folder trees** where finding a handler takes longer than writing the feature
- **Junior developers copying boilerplate** incorrectly — wrong generic constraints, missing validators, duplicate DTOs

**When to use MediatR:** several use cases, shared pipeline (FluentValidation, logging), HTTP **and** a worker calling the same command.

**When not to:** wrap `GetById` in `IRequest` + handler + folder because a sample repo did. Call the service:

```csharp
// Ceremony — skip
public sealed record GetProductByIdQuery(Guid Id) : IRequest<ProductDto?>;
public sealed class GetProductByIdHandler(AppDbContext db)
    : IRequestHandler<GetProductByIdQuery, ProductDto?>
{
    public Task<ProductDto?> Handle(GetProductByIdQuery q, CancellationToken ct)
        => db.Products.AsNoTracking()
            .Where(p => p.Id == q.Id)
            .Select(p => new ProductDto(p.Id, p.Name))
            .FirstOrDefaultAsync(ct);
}

// Enough
[HttpGet("{id:guid}")]
public Task<ProductDto?> Get(Guid id, CancellationToken ct)
    => _products.GetByIdAsync(id, ct);
```

## Decision rubric I use with teams

| Signal | Lean toward MediatR + CQRS-lite | Lean toward services + controllers |
|--------|--------------------------------|-------------------------------------|
| Team size | 3+ backend devs touching same API | 1–2 devs, fast CRUD |
| Use case complexity | Workflows, state machines, multi-step approvals | Simple CRUD, few rules |
| Cross-cutting needs | Validation pipeline, transactions, auditing | Minimal shared behavior |
| Entry points | HTTP + jobs + messaging | HTTP only |
| Product churn | Many new features per sprint | Stable domain |

Healthcare prior authorization flows, SaaS billing with proration rules, marketplace dispute resolution — these justify handlers. A reference data endpoint for dropdown values does not.

## CQRS-lite without two databases

Separate read and write **models** (DTOs vs domain entities) is valuable. Separate read and write **databases** is a major operational commitment. I keep one SQL Server database until metrics prove read load needs isolation.

Queries still benefit from read-optimized shapes:

```csharp
public async Task<IReadOnlyList<ClinicDashboardRow>> Handle(
    GetClinicDashboardQuery request,
    CancellationToken ct)
{
    return await _db.Appointments
        .AsNoTracking()
        .Where(a => a.ClinicId == request.ClinicId && a.Date >= request.From)
        .Select(a => new ClinicDashboardRow(
            a.Id,
            a.PatientName,
            a.Status,
            a.StartTime))
        .ToListAsync(ct);
}
```

The query handler lives in a `Queries` folder; commands that mutate state live in `Commands`. Same DbContext, same transaction boundary unless you have outgrown it.

## Organizing code so product teams can navigate

Structure that has worked on SaaS and healthcare codebases:

```text
Features/
  Claims/
    ApproveClaim/
      ApproveClaimCommand.cs
      ApproveClaimHandler.cs
      ApproveClaimValidator.cs
    GetClaimsReport/
      GetClaimsReportQuery.cs
      GetClaimsReportHandler.cs
  Shared/
    Behaviors/
      LoggingBehavior.cs
      TransactionBehavior.cs
```

Co-locate command, handler, and validator for one use case. Avoid splitting by technical layer at the top level (`Handlers/`, `Commands/` with fifty unrelated types). Product conversations start with "approve claim," not "find the handler interface."

Register MediatR once:

```csharp
builder.Services.AddMediatR(cfg =>
    cfg.RegisterServicesFromAssembly(typeof(ApproveClaimHandler).Assembly));
builder.Services.AddValidatorsFromAssembly(typeof(ApproveClaimValidator).Assembly);
builder.Services.AddTransient(typeof(IPipelineBehavior<,>), typeof(LoggingBehavior<,>));
// ValidationBehavior registration: see validation guide linked above
```

## Transactions and side effects

Commands that touch SQL Server and external systems need explicit habits. A `TransactionBehavior` wrapping commands marked with `ITransactionalRequest` keeps `SaveChanges` and domain events consistent.

Side effects (email, webhooks) belong **after** successful commit — not inside handlers that might retry. I use domain events raised after save or outbox patterns when delivery guarantees matter. MediatR notification handlers (`INotificationHandler`) work for in-process reactions; do not treat them as guaranteed delivery to external systems.

## IdentityServer and authorization in handlers

For APIs behind IdentityServer or Entra ID, I keep `[Authorize]` on controllers and enforce resource-level rules in handlers:

```csharp
if (claim.ClinicId != request.CurrentUserClinicId)
    throw new ForbiddenException();
```

Alternatively, pipeline behaviors that load current user context work for repeated checks. Do not duplicate JWT parsing in every handler — inject an `ICurrentUser` abstraction populated from `HttpContext` in the web layer.

## Migrating away from MediatR is allowed

Teams sometimes adopt MediatR, hit the ceremony wall, and fear removing it. Migration path:

1. Stop adding handlers for trivial CRUD; use services for new simple endpoints.
2. Consolidate pass-through handlers into services over time.
3. Keep MediatR where pipeline behaviors and multi-entry commands justify it.

Architecture serves delivery. If MediatR slows sprints, dial it back without shame.

## What I tell clients in discovery

When scoping an ASP.NET Core API rewrite, I ask:

- How many use cases are workflow-heavy vs CRUD?
- Will background jobs invoke the same logic as HTTP?
- Does the team know MediatR already?

If yes to workflows and jobs, MediatR + CQRS-lite is usually worth it. If the MVP is sixteen REST endpoints in six weeks, I skip MediatR and keep folders feature-based with application services — refactor when complexity arrives.

## Bottom line

MediatR and CQRS-lite help when cross-cutting behaviors, multiple entry points, and complex use cases outweigh boilerplate cost. They hurt when every endpoint gets a handler trio out of habit. Match the pattern to how your product team actually ships — not to how a sample repository is organized.

## If an interviewer asks

CQRS-lite vs event sourcing; when MediatR is worth it in C#; is MediatR required for CQRS.

**Strong answer:** CQRS-lite = separate command/query types and handlers — no event store required. MediatR in C# is a dispatcher with optional pipeline behaviors. It is **not** required for CQRS — a handler class plus a service is still CQRS-lite. MediatR earns its place when behaviors and multiple entry points (HTTP, jobs) share logic. Trivial `Send` wrappers around one service call are ceremony — call the service directly.

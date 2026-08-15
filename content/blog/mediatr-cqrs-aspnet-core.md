---
title: "MediatR and CQRS-Lite in ASP.NET Core — Ceremony vs Delivery"
description: "When MediatR and a CQRS-lite structure help a product team ship faster in ASP.NET Core — and when extra handlers, behaviors, and folders slow healthcare and SaaS delivery down."
date: "2026-04-28"
category: "cqrs"
tags: ["MediatR", "CQRS", "ASP.NET Core", ".NET"]
---

I have introduced MediatR on greenfield SaaS APIs, inherited it on healthcare platforms with forty handlers per bounded context, and removed it from a eCommerce checkout service where the team spent more time naming folders than fixing bugs. MediatR is not good or bad. **CQRS-lite** — commands and queries as separate request types with thin controllers — is a delivery tool. It helps or hurts depending on team size, product churn, and how much cross-cutting behavior you actually need.

This post is my practical line for when I add MediatR to an ASP.NET Core solution and when I keep controllers talking to application services directly.

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
        // projection query, AsNoTracking, etc.
    }
}
```

No event store. No mandatory read database. Just a consistent place to put use-case logic so controllers stay thin.

## What MediatR buys a product team

MediatR shines when several forces align.

**Cross-cutting pipeline behaviors.** Validation, logging, transactions, and authorization checks fit cleanly as `IPipelineBehavior` implementations:

```csharp
public class ValidationBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    private readonly IEnumerable<IValidator<TRequest>> _validators;

    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken ct)
    {
        var failures = _validators
            .Select(v => v.Validate(request))
            .SelectMany(r => r.Errors)
            .Where(f => f != null)
            .ToList();

        if (failures.Count != 0)
            throw new ValidationException(failures);

        return await next();
    }
}
```

One behavior applies to every command with a FluentValidation validator. Controllers do not repeat `if (!ModelState.IsValid)`.

**Consistent unit testing.** Handlers are plain classes. Tests call `Handle` with a fake `DbContext` or repository. No `TestServer` required for business rules.

**Feature-oriented folders.** In healthcare APIs, folders like `Claims/ApproveClaim`, `Claims/GetClaimById` map to how product owners talk about work. New engineers find code faster than a flat `Services/ClaimService.cs` with forty methods.

**Multiple entry points.** The same command from an HTTP controller, a background worker, or an integration test:

```csharp
await _mediator.Send(new ApproveClaimCommand(claimId, reviewerId), ct);
```

That matters when Azure Service Bus or Hangfire jobs duplicate logic that used to live only in controllers.

## When ceremony starts costing delivery

MediatR becomes drag when the team treats every CRUD endpoint as a three-file ceremony (command, handler, validator) without shared behavior or complex rules.

Warning signs I watch for:

- **Pass-through handlers** that only call `_repository.GetByIdAsync` and return the result with no validation, mapping, or side effects
- **Query objects with one property** wrapped because "we always use MediatR"
- **Deep folder trees** where finding a handler takes longer than writing the feature
- **Junior developers copying boilerplate** incorrectly — wrong generic constraints, missing validators, duplicate DTOs

For a simple catalog API with list/get/create/update/delete on five entities, a well-structured `ProductService` and thin controllers often ships faster. You can add MediatR later when cross-cutting behaviors appear — not on day one because a blog post said to.

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
      ValidationBehavior.cs
      TransactionBehavior.cs
```

Co-locate command, handler, and validator for one use case. Avoid splitting by technical layer at the top level (`Handlers/`, `Commands/` with fifty unrelated types). Product conversations start with "approve claim," not "find the handler interface."

Register MediatR once:

```csharp
builder.Services.AddMediatR(cfg =>
    cfg.RegisterServicesFromAssembly(typeof(ApproveClaimHandler).Assembly));
builder.Services.AddValidatorsFromAssembly(typeof(ApproveClaimValidator).Assembly);
builder.Services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));
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

If you are structuring an ASP.NET Core API for a healthcare or SaaS product and want a second opinion on MediatR, folder layout, and pipeline behaviors, [reach out](/contact).

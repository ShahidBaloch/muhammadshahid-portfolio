---
title: "CQRS after MediatR licensing"
---

## Introduction

**CQRS** (Command Query Responsibility Segregation) means **separate models or paths for reads and writes** — not necessarily event sourcing or microservices. On ASP.NET Core teams, “CQRS” often means **MediatR in C#** — one handler per use case. MediatR is not required; it is one dispatcher.

## What CQRS-lite looks like in .NET

```text
HTTP → Controller → IMediator.Send(Command) → Handler → DbContext
                 → IMediator.Send(Query)   → Handler → read model / DTO
```

**Commands** change state. **Queries** return data without side effects. The win is **folder clarity and pipeline behaviors** (validation, logging), not automatic performance.

## Real-world analogy

CQRS is **separate inbox and outbox trays** at a clinic desk:

- **Commands** — “schedule appointment” forms that change the ledger.
- **Queries** — “today’s board” screens that must not accidentally reschedule while rendering.

Same database often serves both — **CQRS does not require two databases**.

## MediatR, Wolverine, or no bus?

| Choice | When |
|---|---|
| **No mediator** | Small API; controllers call services directly |
| **MediatR** | Many use cases; want pipelines; team accepts license |
| **Wolverine** | Greenfield or migration; messaging + handlers in one stack |
| **Delete IMediator** | Handlers are one-liners; bus adds navigation cost |

## Cross-questions

1. **Does CQRS require two databases?** — No; separation is logical. One SQL Server database can serve both command and query handlers.
2. **MediatR vs service class?** — MediatR when pipelines (validation, logging, transactions) compose across many use cases; else a plain service is fine.
3. **Notifications vs commands?** — Notifications fan out to many handlers; do not chain hidden side effects without idempotency keys.
4. **Is CQRS the same as event sourcing?** — No. Event sourcing stores events as the source of truth. CQRS-lite here is folder and handler shape only.
5. **When is a mediator ceremony?** — When handlers are one-liners and the team spends more time navigating `IRequest` folders than reading business logic.

## When I skip CQRS on a new API

- Greenfield with fewer than ~15 use cases and one bounded context.
- Team is new to .NET and has not felt pain from fat controllers yet — introduce handlers when a second developer cannot find the checkout flow.
- Read-heavy reporting API where queries are raw SQL or Dapper and commands are rare — do not force symmetry.

## Pipeline behaviors that justify MediatR

| Behavior | Example |
|---|---|
| Validation | FluentValidation runs before handler |
| Logging | Structured log per command name |
| Transaction | Unit of work wraps `SaveChanges` once |
| Authorization | Policy check on `PlaceOrderCommand` |

If you only need one of these, a filter or middleware might be enough.

## Deep-dive articles

| Topic | Article |
|---|---|
| When mediator is ceremony | [MediatR CQRS ASP.NET Core](/blog/mediatr-cqrs-aspnet-core) |
| License / Wolverine | [MediatR license Wolverine](/blog/mediatr-license-wolverine-alternative) |

---
title: "CQRS after MediatR licensing"
---

## Introduction

**CQRS** (Command Query Responsibility Segregation) means **separate models or paths for reads and writes** — not necessarily event sourcing or microservices. On ASP.NET Core teams, “CQRS” often means **MediatR handlers** — one class per use case instead of fat controllers.

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

1. **Does CQRS require two databases?** — No; separation is logical.
2. **MediatR vs service class?** — MediatR when behaviors (validation, transactions) compose; else service is fine.
3. **Notifications vs commands?** — Notifications fan out; do not use as hidden command chain without idempotency.

## Deep-dive articles

| Topic | Article |
|---|---|
| When mediator is ceremony | [MediatR CQRS ASP.NET Core](/blog/mediatr-cqrs-aspnet-core) |
| License / Wolverine | [MediatR license Wolverine](/blog/mediatr-license-wolverine-alternative) |

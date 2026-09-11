---
title: "Modular Monolith vs Microservices in .NET"
description: ".NET microservices vs modular monolith for ASP.NET Core — when to split C# services, module boundaries, data ownership, Angular contract stability, and migration path."
date: "2026-08-02"
updated: "2026-09-12"
category: "architecture"
tags: ["Architecture", "Microservices", "Modular Monolith", ".NET", "ASP.NET Core", "C#"]
related:
  - clean-architecture-aspnet-core
  - docker-dotnet-angular-local
  - aspnet-core-jwt-auth
faq:
  - q: "When should I choose a modular monolith over microservices in .NET?"
    a: "Until a module has an independent deploy or scale reason. Splitting before that is an ops tax Angular users never asked for."
  - q: "When do I need .NET microservices?"
    a: "When two parts of the C# system scale or release on different axes — search vs checkout, identity vs catalog — and you already have module boundaries and ops. Not because a blog said microservices."
  - q: "Does a module need its own database?"
    a: "Not at first. Separate schemas or tables can wait. Separate SQL servers when the team and the data already fail independently."
  - q: "Will Angular care which shape I pick?"
    a: "Only if the HTTP contract churns. Stable DTOs matter more than how many .csproj files sit behind the gateway."
---

## Definition

A **modular monolith** is one deployable ASP.NET Core application with enforced internal module boundaries — separate folders, projects, or DbContexts — so you can extract a service later without archaeology. **Microservices** are multiple independently deployable services, each owning its data and release cadence, connected over the network.

The choice is not moral. It is which pain your organization can afford **this year**.

## Modular monolith vs microservices

A modular monolith is one deployable with labeled rooms you can later split. Microservices are separate deployables on the same street:

```text
Modular monolith                 Microservices
────────────────                 ─────────────
One front door (deploy)          Many front doors (deploys)
Rooms share foundation (DB)      Each building has its own foundation
Renovate one room → still one    Renovate one building → independent
  electric bill                    electric bill + street maintenance

Split the house BEFORE you have
labeled rooms → distributed mud
```

If two "services" share one database and join across tables freely, you have a distributed monolith — the worst of both worlds.

## .NET microservices vs C# microservices

**Microservices in .NET** are a **process split**, not a language feature. C# does not make the network cheaper. Each service is still an independently deployable host with its own data and failure modes.

Default: one ASP.NET Core host with labeled modules. Extract a service when scale, release cadence, or failure isolation is already real — see [signals you might need services](#signals-you-might-need-services).

**When to split a C# process:** two parts scale on different axes (search vs checkout), two teams ship weekly without coordinating, or a module’s crash must not take down login.

**When not to:** one team, one database, “frontend API” vs “backend API” with cross-table joins over HTTP. That is a distributed monolith.

A module boundary you can enforce **before** Kubernetes:

```csharp
// Modules/Billing/Contracts/IInvoiceReader.cs  — Providers may reference this
public interface IInvoiceReader
{
    Task<InvoiceDto?> GetAsync(Guid invoiceId, CancellationToken ct);
}

// Modules/Billing/Infrastructure — Providers must NOT reference this
public sealed class InvoiceReader(BillingDbContext db) : IInvoiceReader { /* … */ }
```

ArchUnitNET / NetArchTest in CI: `Modules.Providers` cannot import `Modules.Billing.Infrastructure`. If that test fails, splitting into microservices will only move the same coupling onto the network.

## Routing

**Modular monolith vs microservices decision** → stay here.

**Layer boundaries inside one host** → [Clean Architecture](/blog/clean-architecture-aspnet-core).

**Local dev with multiple services** → [Docker + .NET + Angular local](/blog/docker-dotnet-angular-local).

**JWT at gateway vs per-service** → [ASP.NET Core JWT auth](/blog/aspnet-core-jwt-auth).

**Angular contract habits** → [Angular + .NET integration](/blog/angular-dotnet-integration).

**Architecture topic map** → [architecture hub](/learning/architecture).

## Details

**Modular monolith vs microservices** is a high-intent architecture search — and a frequent source of expensive rewrites. Teams hear "microservices" and split a .NET codebase before they have clear module boundaries, independent deploy needs, or operational maturity.

### Start with the force that matters

Microservices optimize for **independent deployment and scaling of different change rates**. They cost you:

- Distributed debugging
- Network failure modes
- Duplicate auth/config concerns
- More CI/CD and observability work

A **modular monolith** keeps one deployable while enforcing internal boundaries so you can extract a service later without archaeology.

If your team is small and the product is one Angular SPA + one API, a modular monolith is usually the correct default.

### Modular monolith vs microservices: comparison I use with clients

| Dimension | Modular monolith | Microservices |
|---|---|---|
| Deploy unit | One (or few) | Many independent |
| Transactional integrity | ACID in-process | Sagas, outbox, eventual consistency |
| Debugging | Stack trace in one repo | Distributed traces required |
| Team fit | One team or tight collaboration | Multiple teams, independent release trains |
| Angular impact | Single API base URL | Gateway/BFF, possibly multiple origins |
| Operational cost | Lower baseline | Higher — always |
| Extract later? | Yes, if modules are clean | Already extracted |
| Failure isolation | Process-level | Service-level (if done right) |

### Signals you might need services

Consider splitting when several are true:

1. Two parts of the system scale on different axes (e.g., search vs checkout)
2. Different teams need independent release trains weekly
3. A module's failure should not take down the whole site
4. You already have strong module boundaries and tests in a monolith

CarBazaar-style thinking (auction, identity, search, gateway) only pays off when those domains truly change and scale separately.

### Signals you should stay modular monolith

1. One product team, one backlog
2. Shared transactional data that would become brittle sagas overnight
3. You cannot yet observe, trace, and page a distributed system
4. "Microservices" is being used to avoid cleaning module coupling
5. You have fewer than ~15 engineers and no dedicated platform/SRE support
6. The proposed split is "frontend API" vs "backend API" with the same database

### A real failure story: the premature split

A startup I consulted for had one Angular admin app and one ASP.NET Core API serving ~2,000 daily active users. A new CTO mandated microservices to "prepare for scale." Within six weeks they had: Identity API, Orders API, Notifications API, and a flaky API gateway — all hitting **one PostgreSQL instance** with cross-schema joins replaced by synchronous HTTP calls.

Deploy frequency dropped from daily to twice a week. A checkout bug required checking four repos and correlating logs manually. The Angular team now handled three base URLs, token refresh edge cases, and CORS configuration across environments.

We walked it back over three months: merged Orders and Notifications into the monolith, kept Identity separate (it genuinely had different change rate and a clear data boundary), added a thin gateway for auth only. The lesson: **they bought distribution without buying independent data or teams**.

### How I draw modules inside a .NET monolith

Practical layout:

- `Modules/Providers` — commands, queries, domain types
- `Modules/Billing`
- `Modules/Identity` (or a focused auth area)
- `Api` — HTTP composition
- `Infrastructure` — EF, email, blob, bus

Rules:

- Modules communicate through interfaces or explicit integration events — not by reaching into another module's DbContext tables
- Shared kernel stays tiny (IDs, clock, result types)
- Angular feature areas roughly mirror module language so contracts stay coherent

### Enforcing boundaries without microservices

Technical tactics that work in a monolith:

- **Project references:** `Billing` does not reference `Providers.Infrastructure` — only `Providers.Contracts`
- **ArchUnitNET or NetArchTest:** fail CI if `Modules.Billing` imports `Modules.Providers.Domain` directly
- **Integration events:** `ProviderCreated` published in-process today, message bus tomorrow — same handler shape
- **Separate DbContext per module** where feasible, even in one database — schemas as ownership lines

If you cannot enforce these inside one repo, splitting into microservices will not fix coupling — it will **distribute** it over HTTP.

### Data ownership is the real boundary

If two "services" share one database and join across tables freely, you have a distributed monolith.

Prefer:

- Clear ownership of tables per module
- Integration via APIs/events for cross-module reads that matter
- Read models when the UI needs a composed view

When I review architecture diagrams, I ignore box count and ask: **who owns each table, and how do cross-module reads happen?**

### What Angular should assume

Whether you have one API or several:

- Stable resource contracts and error envelopes
- Versioning strategy for breaking changes
- Auth that does not require the SPA to know every internal service

| Topic | Modular monolith | Microservices + gateway |
|---|---|---|
| Base URL | One `environment.apiUrl` | One gateway URL; hide service topology |
| Auth | Single JWT validation point | Same — gateway validates, forwards claims |
| Errors | Consistent problem+json envelope | Must normalize across services at gateway |
| Breaking changes | API versioning on one surface | Version per service or gateway aggregation |
| Local dev | `dotnet run` + `ng serve` | Docker compose or dev gateway |

I push teams to keep **one public API surface** for Angular even when five services exist behind a gateway.

### When I recommend against microservices (even if leadership asks)

- No metrics showing a scale hotspot isolated to one domain
- Team wants microservices to "speed up development" but has no module boundaries yet
- Shared transactional workflows that cannot tolerate saga complexity
- No budget for observability (structured logs, traces, dashboards, on-call)
- Split driven by resume-driven architecture, not a concrete pain point

### Migration path that does not burn the team

1. Modularize the monolith first
2. Extract the module with the strongest independent scale/change signal
3. Put a gateway or BFF in front if multiple front doors appear
4. Keep transactional integrity honest (outbox/inbox when you go async)
5. Extract **data** ownership before or with service extraction — not years after

### Cost conversation nobody wants to have

Microservices add recurring cost: more pipelines, secrets, environments per service, distributed tracing, network egress, on-call complexity. A modular monolith on one App Service or container cluster is often **30–50% cheaper** to operate at small scale.

### Decision checklist

1. Team size and release independence needs
2. Scale hotspots with metrics, not vibes
3. Data ownership map (table → module → future service)
4. Ops readiness (logs, traces, deploys, rollbacks)
5. Angular contract impact — can we keep one public API URL?
6. Transaction boundaries — which flows require ACID end-to-end?
7. Cost of operating N deployables vs one modular deployable
8. Extraction candidate ranked by change rate + data isolation, not by "easiest code"

## If an interviewer asks

**"When would you choose a modular monolith over microservices in .NET?"**

**Strong answer:** Default to modular monolith until a module has independent deploy, scale, or team ownership needs. Microservices buy isolation at the price of distributed debugging, network failures, saga complexity, and ops overhead. If two services share one database with cross-table joins, you have a distributed monolith — worse than either choice alone. Modularize first: project references, integration events, separate DbContexts. Extract the module with the strongest data boundary and change rate. Angular should see one gateway URL regardless of how many services exist behind it.

**Weak answer:** "Microservices scale better so split early."

## Related reading

- [Clean Architecture without over-engineering](/blog/clean-architecture-aspnet-core)
- [MediatR and CQRS-lite](/blog/mediatr-cqrs-aspnet-core)
- [Angular + .NET integration habits](/blog/angular-dotnet-integration)
- [Architecture hub](/learning/architecture)

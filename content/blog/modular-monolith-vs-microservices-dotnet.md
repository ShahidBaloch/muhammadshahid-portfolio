---
title: "Modular Monolith vs Microservices in .NET: Choose Boundaries, Not Hype"
description: "Modular monolith vs microservices for ASP.NET Core teams — when to split services, how to draw module boundaries, and how Angular frontends stay stable either way."
date: "2026-08-02"
category: "architecture"
tags: ["Architecture", "Microservices", "Modular Monolith", ".NET", "ASP.NET Core"]
---

**Modular monolith vs microservices** is a high-intent architecture search — and a frequent source of expensive rewrites. Teams hear "microservices" and split a .NET codebase before they have clear module boundaries, independent deploy needs, or operational maturity.

I design and ship both shapes: modular ASP.NET Core systems and service-oriented setups (including marketplace-style splits with identity, search, and gateway concerns). This post is how I decide.

## Start with the force that matters

Microservices optimize for **independent deployment and scaling of different change rates**. They cost you:

- Distributed debugging
- Network failure modes
- Duplicate auth/config concerns
- More CI/CD and observability work

A **modular monolith** keeps one deployable while enforcing internal boundaries (modules, projects, or clearly owned folders) so you can extract a service later without archaeology.

If your team is small and the product is one Angular SPA + one API, a modular monolith is usually the correct default.

## Modular monolith vs microservices: comparison I use with clients

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

Neither row "wins" universally. The question is which pain your organization can afford **this year**.

## Signals you might need services

Consider splitting when several are true:

1. Two parts of the system scale on different axes (e.g., search vs checkout)
2. Different teams need independent release trains weekly
3. A module's failure should not take down the whole site
4. You already have strong module boundaries and tests in a monolith

CarBazaar-style thinking (auction, identity, search, gateway) only pays off when those domains truly change and scale separately. Copying the diagram without the organizational need creates distributed mud.

## Signals you should stay modular monolith

1. One product team, one backlog  
2. Shared transactional data that would become brittle sagas overnight  
3. You cannot yet observe, trace, and page a distributed system  
4. "Microservices" is being used to avoid cleaning module coupling  
5. You have fewer than ~15 engineers and no dedicated platform/SRE support
6. The proposed split is "frontend API" vs "backend API" with the same database — that is not a boundary, that is latency

## A real failure story: the premature split

A startup I consulted for had one Angular admin app and one ASP.NET Core API serving ~2,000 daily active users. A new CTO mandated microservices to "prepare for scale." Within six weeks they had: Identity API, Orders API, Notifications API, and a flaky API gateway — all hitting **one PostgreSQL instance** with cross-schema joins replaced by synchronous HTTP calls.

Deploy frequency dropped from daily to twice a week because coordination overhead exploded. A checkout bug required checking four repos and correlating logs manually. The Angular team now handled three base URLs, token refresh edge cases, and CORS configuration across environments.

We walked it back over three months: merged Orders and Notifications into the monolith, kept Identity separate (it genuinely had different change rate and a clear data boundary), added a thin gateway for auth only. Deploy cadence recovered. The lesson the CTO quoted afterward: **they bought distribution without buying independent data or teams**.

I tell this story not to dunk on microservices — I run them when warranted — but to show that the default mistake is splitting before modular discipline exists inside one deployable.

## How I draw modules inside a .NET monolith

Practical layout:

- `Modules/Providers` — commands, queries, domain types  
- `Modules/Billing`  
- `Modules/Identity` (or a focused auth area)  
- `Api` — HTTP composition  
- `Infrastructure` — EF, email, blob, bus  

Rules:

- Modules communicate through interfaces or explicit integration events — not by reaching into another module's DbContext tables  
- Shared kernel stays tiny (IDs, clock, result types)  
- Angular feature areas roughly mirror module language (providers, billing) so contracts stay coherent  

This pairs well with [Clean Architecture](/blog/clean-architecture-aspnet-core) without requiring six projects per feature on day one.

## Enforcing boundaries without microservices

Technical tactics that work in a monolith:

- **Project references:** `Billing` does not reference `Providers.Infrastructure` — only `Providers.Contracts`
- **ArchUnitNET or NetArchTest:** fail CI if `Modules.Billing` imports `Modules.Providers.Domain` directly
- **Integration events:** `ProviderCreated` published in-process today, message bus tomorrow — same handler shape
- **Separate DbContext per module** where feasible, even in one database — schemas as ownership lines

If you cannot enforce these inside one repo, splitting into microservices will not fix coupling — it will **distribute** it over HTTP.

## Data ownership is the real boundary

If two "services" share one database and join across tables freely, you have a distributed monolith — the worst of both worlds.

Prefer:

- Clear ownership of tables per module  
- Integration via APIs/events for cross-module reads that matter  
- Read models when the UI needs a composed view  

When I review architecture diagrams, I ignore box count and ask: **who owns each table, and how do cross-module reads happen?** If the answer is "SQL join across services," the diagram is fiction.

## What Angular should assume

Whether you have one API or several:

- Stable resource contracts and error envelopes  
- Versioning strategy for breaking changes  
- Auth that does not require the SPA to know every internal service  

From the browser, a modular monolith and a well-gated API gateway should feel similar. Complexity belongs on the server side until product scale demands otherwise.

### Angular contract notes in practice

| Topic | Modular monolith | Microservices + gateway |
|---|---|---|
| Base URL | One `environment.apiUrl` | One gateway URL; hide service topology |
| Auth | Single JWT validation point | Same — gateway validates, forwards claims |
| Errors | Consistent problem+json envelope | Must normalize across services at gateway |
| Breaking changes | API versioning on one surface | Version per service or gateway aggregation |
| Local dev | `dotnet run` + `ng serve` | Docker compose or dev gateway — more moving parts |

I push teams to keep **one public API surface** for Angular even when five services exist behind a gateway. The SPA should not orchestrate calls to Identity, Orders, and Search independently unless there is a compelling offline/PWA reason.

When a module is extracted later, Angular should notice **zero URL changes** if the gateway routes `/api/orders/*` the same way the monolith did.

## When I recommend against microservices (even if leadership asks)

- No metrics showing a scale hotspot isolated to one domain
- Team wants microservices to "speed up development" but has no module boundaries yet
- Shared transactional workflows (checkout + inventory + payment) that cannot tolerate saga complexity
- No budget for observability (structured logs, traces, dashboards, on-call)
- Split driven by resume-driven architecture, not a concrete pain point

I am happy to say "not yet" in executive meetings when the data supports it. A modular monolith with a six-month boundary cleanup plan is a deliverable; a half-split distributed monolith is a liability.

## Migration path that does not burn the team

1. Modularize the monolith first  
2. Extract the module with the strongest independent scale/change signal  
3. Put a gateway or BFF in front if multiple front doors appear  
4. Keep transactional integrity honest (outbox/inbox when you go async)  
5. Extract **data** ownership before or with service extraction — not years after

Do not extract "the easy module" just to say you have microservices. Notifications with no clear data boundary and heavy coupling to Orders is a common trap — it becomes a chatty middle service every other module calls synchronously.

## Cost conversation nobody wants to have

Microservices add recurring cost:

- More pipelines, secrets, environments per service
- Distributed tracing and log aggregation (non-optional at scale)
- Network egress and gateway infrastructure
- On-call rotation complexity

A modular monolith on one App Service or container cluster is often **30–50% cheaper** to operate at small scale — not because monoliths are magic, but because distribution has a baseline tax. I bring numbers from similar client deployments when stakeholders treat microservices as free scalability.

## Decision checklist I use with clients

1. Team size and release independence needs  
2. Scale hotspots with metrics, not vibes  
3. Data ownership map (table → module → future service)  
4. Ops readiness (logs, traces, deploys, rollbacks)  
5. Angular contract impact — can we keep one public API URL?  
6. Transaction boundaries — which flows require ACID end-to-end?  
7. Cost of operating N deployables vs one modular deployable  
8. Extraction candidate ranked by change rate + data isolation, not by "easiest code"

## Bottom line

Architecture is choosing which pain you can afford. **Microservices** buy isolation at the price of distribution. A **modular monolith** buys simplicity at the price of shared deployment. Most .NET + Angular products should master modules before services.

Related: [Clean Architecture without over-engineering](/blog/clean-architecture-aspnet-core), [MediatR and CQRS-lite](/blog/mediatr-cqrs-aspnet-core).

If you want a boundary review on your system, [contact me](/contact).

---
title: "Software Architecture Articles for .NET"
description: "ASP.NET Core software architecture guides: Clean Architecture, modular monolith vs microservices, middleware order, CQRS, vertical slice, and production patterns for .NET teams."
---

## Introduction

This page is the **article map** for .NET + Angular architecture decisions. Each linked article covers one specific design decision in depth — this index tells you which one to open.

| You want… | Open |
|---|---|
| **Clean Architecture** | [Clean Architecture](/blog/clean-architecture-aspnet-core) |
| **Modular monolith vs microservices** | [Modular monolith](/blog/modular-monolith-vs-microservices-dotnet) |
| **Vertical slice vs Clean Architecture** | [Vertical slice](/blog/vertical-slice-vs-clean-architecture) |
| **Middleware order** | [Middleware order](/blog/aspnet-core-middleware-order) |
| **appsettings / config** | [appsettings.json](/blog/aspnet-core-appsettings-localappsettings) |
| **Minimal APIs** | [Minimal APIs](/blog/aspnet-core-minimal-apis) |
| **CQRS with MediatR** | [CQRS and MediatR](/blog/mediatr-cqrs-aspnet-core) |
| **Forwarded headers / reverse proxy** | [Forwarded headers](/blog/aspnet-core-forwarded-headers) |

```text
Angular SPA  →  ASP.NET Core API  →  EF Core  →  SQL Server
                    ↓
              config, middleware, auth, validation, caching
```

## Mental model (two minutes)

Architecture in .NET is a set of decisions about **boundaries**: which code knows about which other code, how the database is accessed, how requests travel through middleware, and where the domain logic lives.

**The three questions I ask first:**

1. **How many teams and how fast does the schema change?** A single team shipping a healthcare app at pace benefits from a modular monolith over microservices. Distributed systems add latency, deployment complexity, and distributed transactions before the team is ready. See [modular monolith vs microservices](/blog/modular-monolith-vs-microservices-dotnet).

2. **How complex is the domain logic?** Clean Architecture and vertical slice both work — they differ in where the slicing happens. Clean Architecture organises by layer (domain → application → infrastructure). Vertical slice organises by feature — the whole request stack in one folder. On a team building one feature at a time, vertical slice reduces the "where does this go?" friction. See [vertical slice vs Clean Architecture](/blog/vertical-slice-vs-clean-architecture).

3. **Where does request processing begin?** Middleware runs in order. Security headers, forwarded headers, CORS, authentication, and authorisation must each run before the things that depend on them. Getting this wrong produces subtle bugs — cookies missing Secure flags, 401s that should be 403s, redirect loops behind a load balancer. See [middleware order](/blog/aspnet-core-middleware-order).

## Common architectural mistakes in production

**Calling `Database.Migrate()` on startup with multiple instances.** Both pods race to apply the same migration. Run an idempotent SQL script in the deployment pipeline before any instance starts. See [EF Core migrations in production](/blog/ef-core-migrations-production).

**Returning `IEnumerable<T>` from a repository backed by `IQueryable`.** The caller's `OrderBy` and `Take` run in memory after loading every row. Declare return types that match what the underlying source actually is. See [IEnumerable vs IQueryable](/blog/ienumerable-vs-iqueryable-ef-core).

**Trusting `X-Forwarded-For` without configuring `UseForwardedHeaders`.** Behind Azure App Service, the scheme and client IP come from headers the app must be told to trust. Omitting this configuration causes HTTPS redirect loops and logs full of the proxy IP. See [forwarded headers](/blog/aspnet-core-forwarded-headers).

**Embedding identity concerns in every handler.** Cross-cutting concerns — audit timestamps, soft-delete filters, current user — belong in EF Core interceptors and global query filters, not scattered across controllers. See [audit log interceptors](/blog/ef-core-interceptors-audit-log) and [global query filters](/blog/ef-core-global-query-filters-soft-delete).

## What to read next

Start with the [Clean Architecture](/blog/clean-architecture-aspnet-core) post if you are organising a new project. Start with [Modular monolith vs microservices](/blog/modular-monolith-vs-microservices-dotnet) if you are deciding on service boundaries. If you are debugging a specific middleware or proxy problem, go directly to that article from the table above.

For security patterns that sit in the architecture layer — OWASP API Top 10, BOLA/IDOR, security headers, CSP — see the [security hub](/learning/security).

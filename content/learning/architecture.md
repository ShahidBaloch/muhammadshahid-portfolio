---
title: "Software Architecture"
---

## Introduction

**Software architecture** for .NET + Angular products is the set of decisions that still make sense after the first **production incident**: configuration loading, HTTP pipeline order, JSON contracts, module boundaries, and where auth tokens live. This hub explains those layers before you open a symptom-specific article.

## Layers in a typical stack

```text
Angular SPA  →  ASP.NET Core API  →  EF Core  →  SQL Server
                    ↓
              config, middleware, auth, validation, caching
```

Architecture articles here focus on the **API boundary and hosting shape** — not EF SQL tuning (see [EF Core hub](/learning/ef-core)) or JWT details ([authentication hub](/learning/authentication)).

## Real-world analogy

Architecture is the **building code**, not the furniture:

- **Middleware order** — which inspection happens before the elevator (CORS before auth vs after).
- **Clean Architecture** — fire doors between floors so a kitchen fire (domain rule) does not burn the lobby (controllers).
- **Modular monolith** — one building with labeled wings vs separate buildings (microservices) and their own plumbing bills.

## Configuration (`appsettings`)

**Search intent:** “where does config load,” “localappsettings.json,” “Azure Key Vault.”

Rules:

- `appsettings.json` + environment-specific files + environment variables + Key Vault.
- **Never** commit secrets; **never** rely on `localappsettings.json` in production without documenting load order.

## Middleware pipeline (order matters)

Wrong order produces impossible bugs:

- **CORS after auth** — browser sees 401 without CORS headers → “CORS error” masking auth failure.
- **Exception handler** — too late if response already started → [headers read-only](/blog/aspnet-core-headers-readonly-response-started).

## JSON and API contracts

Angular expects stable JSON shapes. **Reference cycles** in EF entities cause 500s that look like “detail page broken” — fix serialization contract, not the grid query ([JSON object cycle](/blog/aspnet-core-json-object-cycle)).

## Clean Architecture vs modular monolith vs services

| Shape | Choose when |
|---|---|
| **Clean Architecture** | Domain rules complex; tests must not need Kestrel |
| **Modular monolith** | One deployable; teams need boundaries without ops tax |
| **Microservices** | Independent scale/deploy proven necessary — not default |
| **Minimal APIs** | Small surface; team prefers functions over controller classes |

## Cross-questions

1. **Minimal APIs vs controllers?** — Team consistency and filter behaviors matter more than fashion.
2. **When is Clean Architecture too much?** — When domain is CRUD and boundaries are not changing.
3. **Data Protection keys on scale-out?** — Shared key ring or cookies/antiforgery break per instance.

## Deep-dive articles

| Topic | Article |
|---|---|
| Config files | [appsettings localappsettings](/blog/aspnet-core-appsettings-localappsettings) |
| Clean Architecture | [Clean Architecture ASP.NET Core](/blog/clean-architecture-aspnet-core) |
| JSON cycles | [JSON object cycle](/blog/aspnet-core-json-object-cycle) |
| Middleware order | [Middleware order](/blog/aspnet-core-middleware-order) |
| Response started | [Headers read-only](/blog/aspnet-core-headers-readonly-response-started) |
| Scale-out keys | [Data Protection XML encryptor](/blog/aspnet-core-data-protection-xml-encryptor) |
| Monolith vs services | [Modular monolith vs microservices](/blog/modular-monolith-vs-microservices-dotnet) |
| Minimal APIs | [Minimal APIs](/blog/aspnet-core-minimal-apis) |

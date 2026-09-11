---
title: "API Design for REST and ASP.NET Core"
---

## Introduction

You are probably here for one of three things: a plain definition of **what an API is**, a practical **API design** checklist for ASP.NET Core, or **OpenAPI / Swagger** tooling for an Angular client. Start with [what is an API](/blog/what-is-an-api), then [API design principles](/blog/api-design-principles). For Swashbuckle, Scalar, NSwag, and client codegen, see [Swagger vs OpenAPI in ASP.NET Core](/blog/swagger-openapi-aspnet-core).

## What makes API design different from "just endpoints"

**API design** is the contract your Angular SPA, mobile app, and partners depend on. It covers URLs, verbs, status codes, error envelopes, versioning, pagination, and auth — not just getting `MapGet` to return JSON.

```text
Bad API design          Good API design
────────────────        ────────────────
3 error shapes          One ProblemDetails envelope
/getAllOrders           GET /api/orders?page=1
200 + success:false     404 / 409 with correct codes
Unbounded lists         Pagination + streaming exports
```

## Core API design principles (summary)

| Principle | ASP.NET Core habit |
|---|---|
| Resources as nouns | `OrdersController`, not `GetOrdersController` |
| Correct status codes | `CreatedAtAction` on POST |
| One validation envelope | [API validation](/blog/aspnet-core-api-validation) |
| Auth at boundary | [JWT](/blog/aspnet-core-jwt-auth) or [BFF](/blog/bff-pattern-aspnet-core-angular-yarp) |
| Version before break | `/api/v2/...` or header strategy |
| Async I/O | [async/await](/blog/csharp-async-await-aspnet-core) on SQL and HTTP |

Full checklist: [API design principles](/blog/api-design-principles).

## Swagger, OpenAPI, and client contracts

OpenAPI confusion usually falls into three buckets: vocabulary (**Swagger vs OpenAPI**), package choice (Swashbuckle vs built-in `Microsoft.AspNetCore.OpenApi` vs Scalar vs NSwag), or keeping Angular TypeScript aligned with C# DTOs. The full guide — hybrid setup, migration, JWT in the explorer, FluentValidation in the spec, CI artifacts, and production security — is [Swagger vs OpenAPI in ASP.NET Core](/blog/swagger-openapi-aspnet-core).

Quick vocabulary: **OpenAPI** is the `openapi.json` contract; **Swagger UI** and **Scalar** are browsers for humans; **Swashbuckle.AspNetCore** is the legacy all-in-one NuGet package; **.NET 9+** defaults to `Microsoft.AspNetCore.OpenApi` for generation.

## Deep-dive articles

| You are trying to… | Read |
|---|---|
| Learn **what is an API** | [What is an API](/blog/what-is-an-api) |
| Apply **API design principles** | [API design principles](/blog/api-design-principles) |
| Standardize validation errors | [API validation](/blog/aspnet-core-api-validation) |
| Handle unhandled exceptions | [Global exception handling](/blog/aspnet-core-global-exception-handling) |
| Build Minimal APIs | [Minimal APIs](/blog/aspnet-core-minimal-apis) |
| **Swagger / OpenAPI / Swashbuckle / Scalar / NSwag** | [Swagger vs OpenAPI in ASP.NET Core](/blog/swagger-openapi-aspnet-core) |
| Connect Angular to .NET | [Angular + .NET integration](/blog/angular-dotnet-integration) |

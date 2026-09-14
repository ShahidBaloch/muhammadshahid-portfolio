---
title: "API Design Articles for REST and ASP.NET Core"
---

## Introduction

This page is the **article map** for REST API design on ASP.NET Core. Plain definitions, the principles checklist, and OpenAPI tooling each own their own URL.

| You want… | Open |
|---|---|
| **What is an API** | [What is an API](/blog/what-is-an-api) |
| **API design principles checklist** | [API design principles](/blog/api-design-principles) |
| **Swagger vs OpenAPI / Swashbuckle** | [Swagger vs OpenAPI](/blog/swagger-openapi-aspnet-core) |
| **Validation envelope for Angular** | [FluentValidation](/blog/aspnet-core-api-validation) |

## What makes API design different from "just endpoints"

**API design** is the contract your Angular SPA, mobile app, and partners depend on. Summary habits below — full checklist on the [principles article](/blog/api-design-principles).

```text
Bad API design          Good API design
────────────────        ────────────────
3 error shapes          One ProblemDetails envelope
/getAllOrders           GET /api/orders?page=1
200 + success:false     404 / 409 with correct codes
Unbounded lists         Pagination + streaming exports
```

## Core API design principles (summary)

| Principle | ASP.NET Core habit | Deep dive |
|---|---|---|
| Resources as nouns | `OrdersController`, not `GetOrdersController` | [Principles](/blog/api-design-principles) |
| One validation envelope | ProblemDetails field errors | [API validation](/blog/aspnet-core-api-validation) |
| Auth at boundary | JWT or BFF | [JWT](/blog/aspnet-core-jwt-auth) / [BFF](/blog/bff-pattern-aspnet-core-angular-yarp) |
| Async I/O | Await SQL and HTTP | [async/await](/blog/csharp-async-await-aspnet-core) |

## Swagger, OpenAPI, and client contracts

Vocabulary and package choice live on [Swagger vs OpenAPI in ASP.NET Core](/blog/swagger-openapi-aspnet-core) — not this index. Quick split: **OpenAPI** is the `openapi.json` contract; **Swagger UI** / **Scalar** are browsers; **Swashbuckle** is the legacy all-in-one package.

---
title: "What Is an API? (Definition With REST and ASP.NET Core Examples)"
description: "What is an API — definition, how REST APIs work, request/response flow, and a minimal ASP.NET Core example. Plain English before framework details."
date: "2026-09-08"
updated: "2026-09-08"
category: "api-design"
tags: ["API Design", "ASP.NET Core", "REST", ".NET", "Web API"]
related:
  - api-design-principles
  - aspnet-core-minimal-apis
  - angular-dotnet-integration
  - aspnet-core-api-validation
faq:
  - q: "What is an API?"
    a: "An API (Application Programming Interface) is a defined way for one program to request data or actions from another without knowing internal implementation details. A REST API over HTTP is the most common shape for web and mobile clients — URLs, verbs, JSON bodies, and status codes."
  - q: "What is an API in simple terms?"
    a: "A contract between systems. Your Angular app calls GET /api/orders/123. The server runs business logic and returns JSON. The client does not connect to SQL directly — it uses the API as the boundary."
  - q: "What is the difference between an API and a web page?"
    a: "A web page returns HTML for humans in a browser. An API returns structured data (usually JSON) for programs. Both use HTTP, but APIs are consumed by SPAs, mobile apps, and other services."
  - q: "Is ASP.NET Core an API?"
    a: "ASP.NET Core is a framework for building APIs (and web apps). You define endpoints — Minimal APIs or controllers — that listen on HTTP and return JSON, XML, or files."
---

If you search **what is an API**, you usually want a plain definition before REST verbs, OpenAPI, or framework tutorials. Here it is:

An **API (Application Programming Interface)** is a **contract** that lets one piece of software use another's capabilities through a stable interface — without copying its code or reaching into its database.

On the web, that contract is usually **HTTP + JSON**: a client sends a request; a server returns a response. Your Angular SPA, mobile app, or partner integration talks to an **ASP.NET Core API** this way.

Design guidance: [API design principles](/blog/api-design-principles). Implementation: [Minimal APIs](/blog/aspnet-core-minimal-apis), [Angular + .NET integration](/blog/angular-dotnet-integration).

## What is an API? (definition)

**Definition:** An API is a set of rules and endpoints that expose **what** a system can do and **how** to ask for it — inputs, outputs, errors, and authentication — while hiding internal implementation.

```text
Client (Angular, mobile, script)
        │
        │  HTTP request  GET /api/products?category=shoes
        ▼
   API boundary  ←── contract lives here
        │
        │  business logic, auth, validation
        ▼
   Database / external services
```

The client knows:

- **URL** — `/api/products`
- **Method** — `GET`, `POST`, `PUT`, `DELETE`
- **Headers** — `Authorization: Bearer …`
- **Body** — JSON for writes

The client does **not** need to know table names, EF Core mappings, or Azure layout.

## Real-world analogy

A restaurant menu is an API for the kitchen:

| Menu (API) | Kitchen (implementation) |
|---|---|
| "Burger, no onions" | Recipe, prep station, inventory |
| Price listed | Cost accounting hidden |
| "Sold out" response | Stock system |

You order through the menu — you do not walk into the walk-in freezer.

## REST API — the common web shape

**REST** (Representational State Transfer) is a style for HTTP APIs:

| HTTP verb | Typical use | Example |
|---|---|---|
| `GET` | Read | `GET /api/orders/42` |
| `POST` | Create | `POST /api/orders` + JSON body |
| `PUT` / `PATCH` | Update | `PATCH /api/orders/42/status` |
| `DELETE` | Remove | `DELETE /api/orders/42` |

Responses use **status codes**:

- `200 OK` — success with body
- `201 Created` — resource created
- `400 Bad Request` — validation failed
- `401 Unauthorized` — not logged in
- `403 Forbidden` — logged in but not allowed
- `404 Not Found` — resource missing
- `500 Internal Server Error` — unhandled server fault

JSON is the default payload for .NET + Angular stacks.

## Minimal ASP.NET Core API example

```csharp
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

app.MapGet("/api/products/{id:int}", async (int id, AppDbContext db, CancellationToken ct) =>
{
    var product = await db.Products
        .AsNoTracking()
        .FirstOrDefaultAsync(p => p.Id == id, ct);
    return product is null ? Results.NotFound() : Results.Ok(product);
});

app.Run();
```

What this shows:

1. **Route** — `/api/products/{id}`
2. **Handler** — async database read
3. **Response** — `200` with JSON or `404`

That is an API endpoint — a single operation on the contract.

## API vs library vs database

| | **API (HTTP)** | **Library (NuGet)** | **Direct DB** |
|---|---|---|---|
| **Consumer** | Any network client | Same process / app | Same network as SQL |
| **Contract** | URLs, JSON, status codes | Public classes, methods | Connection string, SQL |
| **Typical use** | SPA, mobile, partners | Shared .NET logic | Internal services only |
| **Security boundary** | Strong — auth at edge | Process boundary | Weak if exposed to clients |

Never expose SQL connection strings to a browser. The API is the security and versioning boundary.

## What makes a good API (preview)

Full checklist: [API design principles](/blog/api-design-principles). Short list:

1. **Stable URLs** — version or namespace before breaking changes
2. **Consistent errors** — one ProblemDetails shape ([validation guide](/blog/aspnet-core-api-validation))
3. **Auth at the boundary** — JWT, cookies, or API keys ([JWT auth](/blog/aspnet-core-jwt-auth))
4. **Pagination** — `?page=2&pageSize=50` for lists
5. **Idempotency** — safe retries on payments and writes

## If an interviewer asks

**"What is an API?"**  
A contract for programmatic access — on the web, usually HTTP resources returning JSON, hiding implementation.

**"REST vs RPC?"**  
REST models resources with standard verbs. RPC names actions (`POST /calculateTax`). REST scales better for public CRUD; RPC fits internal high-performance calls.

**"Where does validation live?"**  
At the API boundary — model binding, FluentValidation, domain rules — before persistence.

More scenarios: [ASP.NET Core interview questions](/blog/aspnet-core-interview-questions-scenarios). Hub: [API design](/learning/api-design).

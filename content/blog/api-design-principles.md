---
title: "API Design Principles for REST and ASP.NET Core"
description: "API design principles for production REST APIs — resource naming, versioning, errors, pagination, auth, and idempotency with ASP.NET Core examples."
date: "2026-09-08"
updated: "2026-09-12"
category: "api-design"
tags: ["API Design", "ASP.NET Core", "REST", ".NET", "Web API", "Architecture"]
related:
  - what-is-an-api
  - aspnet-core-api-validation
  - aspnet-core-global-exception-handling
  - aspnet-core-jwt-auth
  - aspnet-core-rate-limiting
faq:
  - q: "What are API design principles?"
    a: "Rules that keep HTTP APIs predictable for clients: nouns for resources, correct verbs, consistent error envelopes, versioning before breaking changes, pagination for lists, auth at the boundary, and idempotent writes where money or inventory is involved."
  - q: "How do I start building a .NET API?"
    a: "Pick controllers or Minimal APIs, define resource URLs, one ProblemDetails envelope, JWT at the boundary, and pagination on lists. This checklist is the contract; the Minimal APIs post is the hosting shape."
  - q: "What is good API design?"
    a: "Clients can integrate without reading your source code. URLs are stable, errors map to one shape, status codes mean what RFCs say, and breaking changes are versioned or communicated — not surprise 500s on a field rename."
  - q: "What are REST API design best practices?"
    a: "Use plural resource names (/orders not /getOrders), HTTP verbs for actions, 201 + Location on create, ProblemDetails for errors, cursor or offset pagination, and OpenAPI for discovery."
  - q: "How does API design apply to ASP.NET Core?"
    a: "Controllers or Minimal APIs implement the contract. Middleware handles auth, CORS, rate limiting, and exception envelopes. Validation and ProblemDetails live at the boundary before EF Core."
---

**API design** is how you shape HTTP endpoints so Angular clients, mobile apps, and partners integrate once and keep working after deploys. **API design principles** are the rules that stop every endpoint from inventing its own error shape, URL style, and auth story.

This page is a practical checklist from healthcare, SaaS, and eCommerce APIs on ASP.NET Core — not an academic REST essay.

Start with definitions: [what is an API](/blog/what-is-an-api). Error envelopes: [API validation](/blog/aspnet-core-api-validation). Auth: [JWT](/blog/aspnet-core-jwt-auth).

## Building a .NET API

**Building a .NET API** is this contract plus a hosting shape. Controllers or [Minimal APIs](/blog/aspnet-core-minimal-apis) are adapters. The principles below are what Angular, mobile, and partners actually depend on — resource URLs, one error envelope, pagination, auth at the boundary.

Stable URLs are **room numbers on a floor plan** — `/api/orders/{id}` stays put; you version before renaming Radiology to Imaging-v2. Status codes are the signs on the doors: 404 means missing, 409 means conflict, not `{ success: false }` with HTTP 200.

```csharp
[ApiController]
[Route("api/orders")]
[Authorize]
public sealed class OrdersController(IOrderService orders) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<Paged<OrderListItemDto>>> List(
        [FromQuery] int page,
        [FromQuery] int pageSize,
        CancellationToken ct)
    {
        pageSize = Math.Clamp(pageSize <= 0 ? 50 : pageSize, 1, 100);
        var result = await orders.ListAsync(page, pageSize, ct);
        return Ok(result);
    }

    [HttpPost]
    public async Task<ActionResult<OrderDto>> Create(
        CreateOrderRequest body,
        CancellationToken ct)
    {
        var created = await orders.CreateAsync(body, ct);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<OrderDto>> Get(Guid id, CancellationToken ct)
    {
        var order = await orders.GetAsync(id, ct);
        return order is null ? NotFound() : Ok(order);
    }
}
```

That controller is the shape I expect before the checklist below: DTOs in and out, `CreatedAtAction` on POST, `NotFound` on missing ids, pagination capped at 100, `[Authorize]` at the class. A Todo `MapGet` demo is not this — see [Minimal APIs](/blog/aspnet-core-minimal-apis) for hosting only.

## API design principles at a glance

| Principle | Do | Avoid |
|---|---|---|
| **Resources, not actions** | `GET /api/orders` | `GET /api/getOrders` |
| **Correct HTTP verbs** | `POST` to create, `PATCH` partial update | `POST /api/deleteOrder` |
| **Status codes mean something** | `404` missing, `409` conflict | `200` with `{ success: false }` |
| **One error envelope** | ProblemDetails + field map | String on login, object on checkout |
| **Version before break** | `/api/v2/orders` or header | Silent field rename |
| **Paginate lists** | `?page=2&pageSize=50` | `GET` returning 50k rows |
| **Auth at boundary** | JWT / cookie / API key middleware | Trust `userId` query param |
| **Idempotent writes** | `Idempotency-Key` on payments | Double charge on retry |

## 1. Resource-oriented URLs

Model **nouns** (resources), not RPC action names:

```text
Good                          Bad
GET    /api/orders            GET  /api/getAllOrders
GET    /api/orders/{id}       GET  /api/order?id=5
POST   /api/orders            POST /api/createOrder
PATCH  /api/orders/{id}       POST /api/updateOrderStatus
```

Nest related resources shallowly:

```text
GET /api/orders/{orderId}/lines
GET /api/clinics/{clinicId}/providers
```

Deep nesting (`/a/{id}/b/{id}/c/{id}/d`) becomes brittle. Prefer query filters: `GET /api/lines?orderId=42`.

## 2. HTTP verbs and status codes

| Operation | Verb | Success code |
|---|---|---|
| List / read | `GET` | `200` |
| Create | `POST` | `201` + `Location` header |
| Full replace | `PUT` | `200` or `204` |
| Partial update | `PATCH` | `200` |
| Delete | `DELETE` | `204` or `200` |

ASP.NET Core example:

```csharp
[HttpPost]
public async Task<ActionResult<OrderDto>> Create(CreateOrderRequest request, CancellationToken ct)
{
    var order = await _orders.CreateAsync(request, ct);
    return CreatedAtAction(nameof(Get), new { id = order.Id }, order);
}

[HttpGet("{id:guid}")]
public async Task<ActionResult<OrderDto>> Get(Guid id, CancellationToken ct)
{
    var order = await _orders.GetByIdAsync(id, ct);
    return order is null ? NotFound() : Ok(order);
}
```

## 3. Consistent error design

One envelope for validation, conflicts, and auth failures:

```json
{
  "type": "https://api.example.com/errors/validation",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "errors": {
    "email": ["Email is required."]
  }
}
```

Implementation: [ASP.NET Core API validation](/blog/aspnet-core-api-validation), [global exception handling](/blog/aspnet-core-global-exception-handling).

**Principle:** Angular builds **one** interceptor parser. Three error shapes = three bugs in production.

## 4. Versioning and compatibility

Breaking changes — rename field, change type, remove endpoint — need a **version strategy**:

1. **URL path** — `/api/v1/orders`, `/api/v2/orders` (clearest for public APIs)
2. **Header** — `Api-Version: 2.0`
3. **Query** — `?api-version=2.0` (works but easy to forget)

Non-breaking: add optional fields, add endpoints. Deprecate with `Sunset` header and docs before removal.

## 5. Pagination and filtering

Never return unbounded lists from `GET`:

```csharp
[HttpGet]
public async Task<ActionResult<PagedResult<OrderDto>>> List(
    [FromQuery] int page = 1,
    [FromQuery] int pageSize = 50,
    CancellationToken ct = default)
{
    pageSize = Math.Clamp(pageSize, 1, 100);
    var result = await _orders.ListAsync(page, pageSize, ct);
    return Ok(result);
}
```

Response includes `totalCount`, `page`, `pageSize`, and `items`. For large datasets, prefer **cursor** pagination (`?after=cursor`) over deep offset pages.

## 6. Authentication and authorization

**Design principle:** every mutating endpoint assumes **authenticated identity** unless explicitly public.

- **JWT bearer** — SPAs with refresh rotation ([guide](/blog/aspnet-core-jwt-refresh-token-rotation))
- **httpOnly cookies + BFF** — when refresh tokens must not sit in `localStorage` ([BFF pattern](/blog/bff-pattern-aspnet-core-angular-yarp))
- **API keys** — partner integrations with scoped keys and [rate limiting](/blog/aspnet-core-rate-limiting)

Return `401` when not authenticated, `403` when authenticated but forbidden — [401 vs 403](/blog/aspnet-core-401-vs-403).

## 7. Idempotency and safe retries

Payment and inventory endpoints must survive **duplicate POSTs** from mobile retries:

```http
POST /api/payments
Idempotency-Key: 7f3c9a2e-...
```

Server stores key → result mapping. Same key returns the original `201` without double charge.

## 8. Documentation and discovery

**OpenAPI (Swagger)** is not optional for teams with more than one client. Generate from attributes or Minimal API metadata. Keep examples realistic — not `string` for every field.

## 9. Performance as design

API design includes **what clients are allowed to request**:

- Project to DTOs — do not return EF entity graphs ([JSON cycles](/blog/aspnet-core-json-object-cycle))
- Stream large exports — `IAsyncEnumerable`, not `ToListAsync` on 200k rows
- Async I/O end to end — [async/await](/blog/csharp-async-await-aspnet-core)
- Rate limit abuse — [rate limiting middleware](/blog/aspnet-core-rate-limiting)

## API design checklist (merge review)

```text
□ URLs are nouns, verbs match HTTP methods
□ 201 + Location on create; 404/409 used correctly
□ ProblemDetails envelope for all client errors
□ Lists paginated; exports streamed
□ Auth on every write; tenant in cache keys
□ Version strategy documented before v2
□ OpenAPI published; breaking changes in changelog
```

## If an interviewer asks

**"Name three API design principles."**  
Resource URLs, consistent errors, correct status codes — plus versioning and pagination under load.

**"How do you design APIs for Angular?"**  
Stable JSON contracts, CORS with credentials if using cookies, field-level validation errors, and refresh-token flow that does not fight the interceptor.

**"REST vs GraphQL?"**  
REST fits most CRUD + cacheable resources on .NET. GraphQL when clients need flexible field selection and you will invest in query cost limits.

More: [ASP.NET Core interview scenarios](/blog/aspnet-core-interview-questions-scenarios). Hub: [API design](/learning/api-design).

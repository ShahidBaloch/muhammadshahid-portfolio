---
title: "API Design Interview Questions for .NET Developers"
description: "API design interview prep for .NET developers. REST design, idempotency, pagination, versioning, and rate limiting — with 30-second and strong answers."
date: "2026-10-07"
category: "interview-prep"
tags: ["API Design", "REST", ".NET", "Interview Questions", "ASP.NET Core"]
---

## Question 1: "How Would You Design a Paginated API?"

### 30-Second Answer
Offset pagination is simple but has problems at scale (slow for deep pages, unstable when data changes). Cursor-based pagination is better — use an opaque cursor (typically the last item's ID or timestamp) that the client sends with the next request. It is stable and O(1) regardless of page depth.

### Strong Answer

**Offset pagination (simple, problematic at scale)**:
```
GET /api/orders?skip=0&take=20   ← Page 1
GET /api/orders?skip=20&take=20  ← Page 2
```

Problems:
- Slow for deep pages: `SKIP 10000 TAKE 20` in SQL requires scanning 10,000 rows
- Unstable: if a row is inserted between page 1 and page 2 requests, page 2 skips an item or duplicates one

**Cursor-based pagination (preferred)**:
```
GET /api/orders                            ← First page
GET /api/orders?cursor=eyJpZCI6MTAwfQ==   ← Next page (cursor from previous response)
```

```csharp
// Response shape
public class PagedResponse<T>
{
    public IReadOnlyList<T> Items { get; init; }
    public string? NextCursor { get; init; }  // null when no more pages
    public bool HasMore => NextCursor != null;
}

// Implementation
public async Task<PagedResponse<OrderDto>> GetOrdersAsync(
    string? cursor, 
    int pageSize = 20)
{
    Guid? afterId = cursor != null 
        ? DecodeCursor(cursor) 
        : null;
    
    var query = _db.Orders
        .OrderBy(o => o.Id)
        .Where(o => afterId == null || o.Id > afterId.Value)
        .Take(pageSize + 1)  // Fetch one extra to detect if more exist
        .Select(o => new OrderDto { Id = o.Id, Status = o.Status });
    
    var items = await query.ToListAsync();
    
    var hasMore = items.Count > pageSize;
    if (hasMore) items.RemoveAt(pageSize);
    
    return new PagedResponse<OrderDto>
    {
        Items = items,
        NextCursor = hasMore 
            ? EncodeCursor(items.Last().Id) 
            : null
    };
}

private static string EncodeCursor(Guid id) =>
    Convert.ToBase64String(Encoding.UTF8.GetBytes(id.ToString()));
```

**When to use offset**: Small, rarely-changing datasets where simplicity matters. Admin UIs where "go to page 42" is a feature.
**When to use cursor**: Large, frequently-changing datasets. Mobile apps with infinite scroll. Any API that will be called by third-party clients.

### Red Flags
- "Just use SKIP/TAKE" — not explaining the scale and stability problems
- No mention of the extra-item trick for detecting whether more results exist

---

## Question 2: "How Do You Version an API?"

### 30-Second Answer
Three strategies: URL versioning (`/api/v1/orders`), header versioning (`Accept: application/vnd.api.v1+json`), and query string versioning (`?api-version=1.0`). URL versioning is most discoverable. Microsoft recommends URL or query string versioning for REST APIs. The key principle: never break existing clients.

### Strong Answer

**URL versioning** (most common, most discoverable):
```
GET /api/v1/orders/123
GET /api/v2/orders/123  ← New version with breaking change
```

In ASP.NET Core with Asp.Versioning:
```csharp
builder.Services.AddApiVersioning(options =>
{
    options.DefaultApiVersion = new ApiVersion(1, 0);
    options.AssumeDefaultVersionWhenUnspecified = true;
    options.ReportApiVersions = true; // Returns api-supported-versions header
}).AddApiExplorer(options =>
{
    options.GroupNameFormat = "'v'VVV";
    options.SubstituteApiVersionInUrl = true;
});

[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/orders")]
public class OrdersV1Controller : ControllerBase { ... }

[ApiController]
[ApiVersion("2.0")]
[Route("api/v{version:apiVersion}/orders")]
public class OrdersV2Controller : ControllerBase { ... }
```

**What constitutes a breaking change** (requires a new version):
- Removing a field from a response
- Changing a field's type (string → int)
- Changing required fields in a request
- Changing semantics of a field
- Removing an endpoint

**Non-breaking changes** (safe to add without a new version):
- Adding optional fields to responses (clients ignore unknown fields)
- Adding optional query parameters
- Adding new endpoints

**Deprecation strategy**: Support the old version for a defined period after v2 launches. Return `Deprecation` and `Sunset` response headers:
```
Deprecation: Sat, 01 Jan 2027 00:00:00 GMT
Sunset: Sat, 01 Jul 2027 00:00:00 GMT
```

### Red Flags
- "Breaking changes are fine, clients should update" — this breaks production integrations without notice
- Not having a deprecation timeline strategy

---

## Question 3: "How Do You Design a Rate Limiter for an API?"

### 30-Second Answer
Rate limiting restricts requests per client per time window. Algorithms: fixed window, sliding window, token bucket (allows bursting), leaky bucket (smooth rate). Store counters in Redis for distributed state. Return 429 with Retry-After header. .NET 7+ has built-in rate limiting middleware.

### Strong Answer
**Choosing the algorithm**:
- **Fixed window**: Simplest. Count requests in current 1-minute window. Allows up to 2x the limit at window boundaries.
- **Sliding window**: Counts requests in the last N seconds regardless of window boundaries. More accurate, slightly more expensive.
- **Token bucket**: Tokens replenish over time. Allows brief bursts up to bucket capacity. Best for APIs that should allow reasonable burst traffic.
- **Leaky bucket**: Requests enter a queue; processed at a fixed rate. Best for smooth output to downstream services.

**ASP.NET Core .NET 7+ built-in**:
```csharp
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    
    options.AddTokenBucketLimiter("authenticated", opt =>
    {
        opt.TokenLimit = 100;
        opt.ReplenishmentPeriod = TimeSpan.FromMinutes(1);
        opt.TokensPerPeriod = 100;
        opt.AutoReplenishment = true;
        opt.QueueLimit = 0;  // Reject immediately, no queue
    });
});

// Apply to controllers
[EnableRateLimiting("authenticated")]
[ApiController]
public class OrdersController : ControllerBase { ... }
```

**Per-user rate limiting**:
```csharp
options.AddSlidingWindowLimiter("per-user", opt =>
{
    opt.PermitLimit = 100;
    opt.Window = TimeSpan.FromMinutes(1);
    opt.SegmentsPerWindow = 6;
});

// Custom policy with user ID as partition key
options.AddPolicy("per-user-policy", context =>
    RateLimitPartition.GetSlidingWindowLimiter(
        partitionKey: context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "anonymous",
        factory: _ => new SlidingWindowRateLimiterOptions
        {
            PermitLimit = 100,
            Window = TimeSpan.FromMinutes(1),
            SegmentsPerWindow = 6
        }));
```

**Response when rate limited**:
```
HTTP/1.1 429 Too Many Requests
Retry-After: 45
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1700000060
```

### Red Flags
- Rate limiting only at the application level without mentioning API gateway-level rate limiting
- Not mentioning per-user vs per-IP partitioning
- Not mentioning distributed state for multi-instance deployments

---

## Question 4: "When Should You Use REST vs gRPC?"

### 30-Second Answer
REST for public-facing APIs consumed by browsers and third parties — HTTP, JSON, discoverability, wide tooling support. gRPC for internal service-to-service communication where performance and strongly typed contracts matter — binary Protocol Buffers, streaming, lower overhead, but requires HTTP/2 and no browser support without a proxy.

### Strong Answer
**REST strengths**:
- Browser and JavaScript client support (fetch, axios)
- Human-readable (JSON)
- Discoverable (OpenAPI/Swagger documentation)
- Wide third-party tooling and client library support
- Simple to consume with `HttpClient`

**gRPC strengths**:
- ~7x faster serialisation than JSON (Protocol Buffers binary format)
- Strongly typed contracts — the `.proto` file is the contract, shared between producer and consumer
- Streaming: server streaming, client streaming, bidirectional
- Code generation for client SDKs from `.proto` files
- HTTP/2 multiplexing — multiple requests over one connection

**In .NET**:
```csharp
// gRPC service definition (.proto)
service OrderService {
  rpc GetOrder (GetOrderRequest) returns (OrderResponse);
  rpc StreamOrders (StreamOrdersRequest) returns (stream OrderResponse);
}

// Server implementation
public class OrderGrpcService : OrderService.OrderServiceBase
{
    public override async Task<OrderResponse> GetOrder(
        GetOrderRequest request, 
        ServerCallContext context)
    {
        var order = await _orders.GetByIdAsync(Guid.Parse(request.OrderId));
        return new OrderResponse { OrderId = order.Id.ToString(), Status = order.Status };
    }
}
```

**Decision**: Public API? REST. Internal microservice call where you control both client and server? gRPC (performance + strong contracts). Need real-time streaming? gRPC streaming or SignalR/WebSockets.

---

## Question 5: "How Do You Design a Backwards-Compatible API?"

### 30-Second Answer
Follow Postel's Law: be conservative in what you send, liberal in what you accept. Add optional fields only, never remove or rename existing fields. Use the `additionalProperties` approach in responses — clients must ignore unknown fields. Validate requests permissively, document strictly.

### Strong Answer
**Serialisation defaults**: Configure `System.Text.Json` to ignore unknown properties (the default in .NET). This means adding new fields to responses never breaks old clients.

```csharp
builder.Services.AddControllers().AddJsonOptions(opts =>
{
    opts.JsonSerializerOptions.DefaultIgnoreCondition = 
        JsonIgnoreCondition.WhenWritingNull;  // Don't send null fields
    // UnknownNumberHandling and other lenient settings
});
```

**Contract testing**: Use consumer-driven contract tests (Pact) to verify that the API you are publishing still satisfies existing consumer expectations before each deployment.

**Expand-contract pattern for breaking changes**:
1. Expand: Add the new field alongside the old one (both exist)
2. Migrate: Update all consumers to use the new field
3. Contract: Remove the old field

This avoids a version bump for most changes.

---

## Quick-Fire Answers

**"What HTTP status code do you return for validation errors?"**
422 Unprocessable Entity — the request was well-formed (parseable) but contained semantic validation errors. Use the RFC 7807 Problem Details format with a `errors` object. Do not return 400 for validation errors — 400 means the request was malformed (unparseable).

**"How do you handle authentication vs authorisation in an API?"**
Authentication: verify who you are (JWT validation, API key check) — typically in middleware or policy. Authorisation: verify what you can do (RBAC, claims-based, resource-based) — in `IAuthorizationHandler` or `[Authorize(Policy = "...")]` attributes. They are separate concerns; authentication runs before authorisation.

**"What is HATEOAS and do you need to implement it?"**
HATEOAS (Hypermedia as the Engine of Application State) means API responses include links to related actions (`"_links": { "cancel": "/orders/123/cancel" }`). In theory, clients should need no prior knowledge of the API structure. In practice, almost no production APIs implement full HATEOAS — clients are always built with prior knowledge of the API. Knowing what it is matters; implementing it in detail rarely does.

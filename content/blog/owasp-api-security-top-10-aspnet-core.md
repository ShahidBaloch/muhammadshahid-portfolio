---
title: "OWASP API Security Top 10 Mapped to ASP.NET Core"
description: "A practical OWASP API Security Top 10 checklist mapped to ASP.NET Core controls — BOLA, auth, mass assignment, rate limits, CORS, and Angular trust boundaries. Not a JWT or RBAC rewrite."
date: "2026-10-01"
category: "security"
tags: ["ASP.NET Core", "OWASP", "API Security", "Angular", "C#"]
related:
  - aspnet-core-jwt-auth
  - aspnet-core-rbac-guide
  - aspnet-core-rate-limiting
  - aspnet-core-security-headers
faq:
  - q: "What is the OWASP API Security Top 10 for ASP.NET Core?"
    a: "It is a ranked list of the most common API failure modes. In ASP.NET Core you map each item to concrete controls: resource authorization, JWT/refresh habits, DTO projection, rate limiting, policies, inventory, and outbound HttpClient hardening — not a separate OWASP framework package."
  - q: "Is Angular auth guard enough for BOLA and function-level authorization?"
    a: "No. Guards and *ngIf hide UI. The API must still authorize every object id and every privileged action. Treat the SPA as an untrusted client."
  - q: "How is this different from JWT auth or RBAC guides?"
    a: "Those posts go deep on tokens and policies. This page is the Top-10 map: one actionable ASP.NET Core control per OWASP item, with links into the silos."
---

**OWASP API Security Top 10 mapped to ASP.NET Core** means taking each ranked failure mode and wiring a real mitigation in your API pipeline — authorization handlers, DTOs, rate limits, headers, versioning — so an Angular SPA cannot accidentally become your security boundary.

```text
Angular SPA (untrusted)
        │
        ▼
ASP.NET Core API edge
  authN → authZ (object + function) → validation → rate limits
        │
        ▼
Domain + EF Core (tenant/ownership filters)
```

**New to this** → stay here for the checklist. **Deep JWT/RBAC** → [JWT checklist](/blog/aspnet-core-jwt-auth) · [RBAC policies](/blog/aspnet-core-rbac-guide). **Go-live** → [practitioner checklist](#practitioner-checklist-and-go-live-order).

Search intent for **owasp api security top 10 asp.net core** is a checklist, not a threat-modeling textbook. Teams shipping healthcare and SaaS APIs need: “which control closes API1…API10 in *our* stack.” This post is that map.

## What the OWASP API Security Top 10 means for Angular-backed ASP.NET Core APIs

The Top 10 is about **API abuse patterns**, not classic XSS-only web app thinking. Your Angular client will call `/api/encounters/{id}`, `/api/admin/users`, and `/api/reports/export`. Attackers will:

- Swap path ids (BOLA/IDOR)
- Skip the UI and hit privileged routes
- Send extra JSON properties (mass assignment)
- Hammer expensive endpoints
- Probe Swagger and old versions left online

ASP.NET Core gives you the primitives. OWASP tells you which gaps to close first. Do not invent a second security product — use policies, ProblemDetails, rate limiting, and honest DTOs.

**What this page is not:** a full JWT deep dive, a full RBAC tutorial, or a Semrush traffic essay. Those silos already exist; this is the index with one control per item.

## API1 Broken Object Level Authorization (BOLA)

**Failure:** `GET /api/patients/4821` returns data for any authenticated user who guesses the id.

**ASP.NET Core control:** authorize the *resource*, not just “is logged in.”

```csharp
[Authorize]
[HttpGet("{id:guid}")]
public async Task<IActionResult> GetEncounter(
    Guid id,
    IEncounterStore store,
    IAuthorizationService authz,
    CancellationToken ct)
{
    var encounter = await store.FindAsync(id, ct);
    if (encounter is null) return NotFound();

    var result = await authz.AuthorizeAsync(
        User, encounter, "EncounterRead");

    if (!result.Succeeded) return Forbid();

    return Ok(EncounterDto.From(encounter));
}
```

Pair with EF filters that already scope by tenant or clinic — but **never** treat `HasQueryFilter` alone as object-level auth (filters can be ignored; see [global query filters](/blog/ef-core-global-query-filters-soft-delete)). For a dedicated BOLA walkthrough, plan a sibling post; here the rule is: load → authorize resource → project DTO.

**Angular implication:** hiding the “other clinic” row in a grid does nothing. The API must reject the id.

## API2 Broken Authentication

**Failure:** long-lived access tokens in localStorage, no refresh rotation, weak issuer/audience checks, refresh reuse ignored.

**ASP.NET Core control:** short-lived access tokens, rotating refresh with reuse detection, strict `TokenValidationParameters`.

Summary only — full checklist lives in [ASP.NET Core JWT auth](/blog/aspnet-core-jwt-auth) and [refresh token rotation](/blog/aspnet-core-jwt-refresh-token-rotation):

- Validate `iss`, `aud`, lifetime, signing key
- Prefer authorization policies over ad-hoc claim checks
- Rotate refresh tokens; revoke family on reuse
- Angular: single-flight refresh; do not logout on every 403 ([401 vs 403](/blog/aspnet-core-401-vs-403))

**Angular implication:** interceptors attach tokens; they do not define auth strength. Stolen token lifetime is your blast radius.

## API3 Broken Object Property Level Authorization

**Failure:** client posts `{ "role": "Admin", "isVip": true }` and the API binds straight onto the entity (mass assignment) or returns entities with salary, SSN, or internal flags (excessive data exposure).

**ASP.NET Core control:** separate write DTOs, `[Bind]` never on entities, and projection on read.

```csharp
public sealed record UpdatePatientRequest(
    string DisplayName,
    string PreferredPhone);
// deliberately no Role, TenantId, IsDeleted

[HttpPut("{id:guid}")]
public async Task<IActionResult> Update(
    Guid id, UpdatePatientRequest request, ...)
{
    // map only allowed fields onto the loaded entity
}
```

On read, never `return Ok(entity)`. Use DTOs so Angular never sees `ConcurrencyToken` internals you meant to keep server-side — and so you do not trip [JSON object cycles](/blog/aspnet-core-json-object-cycle).

Validate shapes with [FluentValidation / ProblemDetails](/blog/aspnet-core-api-validation). Validation does not replace property-level auth; it stops garbage input.

## API4 Unrestricted Resource Consumption

**Failure:** unbounded page size, huge JSON bodies, export endpoints without quotas, expensive reports callable in a loop.

**ASP.NET Core control:** rate limiting + payload limits + pagination caps.

```csharp
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("expensive", o =>
    {
        o.Window = TimeSpan.FromMinutes(1);
        o.PermitLimit = 30;
        o.QueueLimit = 0;
    });
});

// In Program.cs
app.UseRateLimiter();

[EnableRateLimiting("expensive")]
[HttpGet("reports/claims-summary")]
public Task<IActionResult> ClaimsSummary(...) { ... }
```

Also set `RequestSizeLimit` / `MultipartBodyLengthLimit` on upload endpoints, and reject `pageSize > 100` in validators. Details: [rate limiting](/blog/aspnet-core-rate-limiting).

**Angular implication:** client-side debounce is UX. Server quotas are security and cost control.

## API5 Broken Function Level Authorization

**Failure:** `/api/admin/reindex` is callable by any authenticated user because the controller only has `[Authorize]` while the Angular admin menu is hidden.

**ASP.NET Core control:** named policies for privileged operations ([RBAC guide](/blog/aspnet-core-rbac-guide)).

```csharp
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOps", p =>
        p.RequireRole("Admin", "PlatformOps"));
});

[Authorize(Policy = "AdminOps")]
[HttpPost("admin/reindex")]
public IActionResult Reindex() => Accepted();
```

UI hiding is a product decision. Function-level auth is `[Authorize(Policy=...)]` (or equivalent Minimal API `.RequireAuthorization`).

## API6 Unrestricted Access to Sensitive Business Flows

**Failure:** booking, password reset, coupon apply, or claims submission can be automated without friction — inventory exhaustion, spam, or fraud.

**ASP.NET Core control:** treat flows as products with quotas, idempotency, and step-up checks.

```csharp
// Example: appointment booking
[EnableRateLimiting("booking")]
[HttpPost]
public async Task<IActionResult> Book(
    BookAppointmentRequest request,
    [FromHeader(Name = "Idempotency-Key")] string? key,
    ...)
{
    // enforce clinic capacity server-side
    // use idempotency to stop double-book on retry
}
```

Use [idempotency keys](/blog/idempotency-key-aspnet-core) for POSTs that create money or scarce slots. Add CAPTCHA or step-up auth only where product risk warrants it — do not sprinkle CAPTCHA on every CRUD.

**Angular implication:** `exhaustMap` on submit reduces double-clicks; it does not stop a scripted client.

## API7 SSRF

**Failure:** API accepts a URL from the client (`avatarUrl`, `webhookUrl`, `fhirBase`) and the server fetches it — hitting cloud metadata (`169.254.169.254`) or internal admin hosts.

**ASP.NET Core control:** allow-lists + `IHttpClientFactory` typed clients that never take raw user URLs without validation.

```csharp
public sealed class AvatarFetchService
{
    private static readonly HashSet<string> AllowedHosts =
        new(StringComparer.OrdinalIgnoreCase) { "cdn.example.com", "images.example.com" };

    public async Task<byte[]> FetchAsync(Uri uri, CancellationToken ct)
    {
        if (!AllowedHosts.Contains(uri.Host) || uri.Scheme != Uri.UriSchemeHttps)
            throw new ValidationException("Avatar host not allowed.");

        // use named HttpClient; block redirects to other hosts
        return await _http.GetByteArrayAsync(uri, ct);
    }
}
```

Prefer storing blob keys you issued, not fetching arbitrary URLs. Deeper HttpClient habits: [IHttpClientFactory](/blog/ihttpclientfactory-aspnet-core).

## API8 Security Misconfiguration

**Failure:** Swagger open on production, permissive CORS `*`, missing security headers, detailed exception messages in production, admin endpoints without auth because “internal.”

**ASP.NET Core control:** environment-gated OpenAPI, explicit CORS, headers middleware, ProblemDetails without stack traces.

```csharp
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AngularSpa"); // explicit origins — see CORS post
// security headers middleware — see security-headers post
app.UseExceptionHandler(); // safe ProblemDetails in production
```

Links: [security headers](/blog/aspnet-core-security-headers), [CORS Angular + ASP.NET Core](/blog/cors-angular-aspnet-core), [global exception handling](/blog/aspnet-core-global-exception-handling), [middleware order](/blog/aspnet-core-middleware-order).

**Angular implication:** `localhost:4200` in CORS for prod is a misconfiguration, not a feature.

## API9 Improper Inventory Management

**Failure:** `/api/v1` and `/api/v2` both live forever; undocumented debug routes; old mobile clients keep calling sunset endpoints that skip new auth rules.

**ASP.NET Core control:** explicit versioning, OpenAPI as inventory, deprecate with headers and dates.

```csharp
builder.Services.AddApiVersioning(o =>
{
    o.DefaultApiVersion = new ApiVersion(2, 0);
    o.AssumeDefaultVersionWhenUnspecified = false;
    o.ReportApiVersions = true;
}).AddApiExplorer(o =>
{
    o.GroupNameFormat = "'v'VVV";
    o.SubstituteApiVersionInUrl = true;
});
```

Keep a living list of public routes (OpenAPI + gateway). Sunset with communication, not surprise 404s. See [API versioning](/blog/aspnet-core-api-versioning) and [Swagger/OpenAPI](/blog/swagger-openapi-aspnet-core).

## API10 Unsafe Consumption of APIs

**Failure:** your API trusts a third-party FHIR, payment, or eligibility response blindly — oversized payloads, unexpected JSON, or redirects.

**ASP.NET Core control:** validate outbound responses like inbound requests; use Polly for timeouts/retries carefully; never retry non-idempotent POSTs blindly.

```csharp
builder.Services.AddHttpClient<IEligibilityClient, EligibilityClient>(c =>
{
    c.BaseAddress = new Uri(builder.Configuration["Eligibility:BaseUrl"]!);
    c.Timeout = TimeSpan.FromSeconds(10);
})
.AddStandardResilienceHandler(); // or explicit Polly; tune per dependency
```

Parse into DTOs; reject unknown critical fields; log correlation ids across hops ([correlation id](/blog/aspnet-core-correlation-id)).

## Practitioner checklist and go-live order

Ship security in this order for an Angular + ASP.NET Core API:

1. **AuthN basics** — JWT validation parameters correct; HTTPS only  
2. **Function policies** — admin/ops routes behind named policies  
3. **Object authorization** — every `{id}` route loads then authorizes  
4. **DTO boundaries** — no entity bind; no entity return  
5. **Validation + ProblemDetails** — one error envelope for Angular  
6. **Rate limits + body limits** — especially exports and auth endpoints  
7. **CORS + headers + Swagger gating** — production hardened  
8. **Version inventory** — know what is public  
9. **Outbound allow-lists** — SSRF and third-party trust  
10. **Sensitive flows** — idempotency + quotas on money/slots  

Run a tabletop: pick one Angular screen (e.g., edit encounter) and abuse it with curl as another user. If the UI cannot do it but curl can, you failed API1 or API5.

## What this post does not cover (and where to go next)

| Topic | Where |
|---|---|
| Full JWT / refresh design | [JWT checklist](/blog/aspnet-core-jwt-auth) |
| Policy and role design | [RBAC guide](/blog/aspnet-core-rbac-guide) |
| Rate limiter algorithms | [Rate limiting](/blog/aspnet-core-rate-limiting) |
| Header set details | [Security headers](/blog/aspnet-core-security-headers) |
| CORS credential pitfalls | [CORS](/blog/cors-angular-aspnet-core) |
| Threat modeling walkthrough | Plan: STRIDE sibling |
| BOLA deep dive | Plan: object-level auth sibling |

## Common mistakes I still see

1. **“We use JWT, so we’re OWASP-compliant”** — JWT is API2 partial; BOLA still wins breaches  
2. **Trusting Angular route guards** — attackers do not use your router  
3. **Returning EF entities “just for admin”** — property-level leaks  
4. **Swagger left on in production “for support”** — inventory + attack surface  
5. **CORS `AllowAnyOrigin` with cookies** — broken or dangerous; fix properly  
6. **Rate limiting only on login** — exports and search burn CPU and money too  

## Verification

- Call every `{id}` GET/PUT as User A with User B’s id → expect 403/404, never 200 with data  
- POST extra properties on a write DTO → ignored or 400, never applied  
- Hit admin route without role → 403  
- Burst expensive GET → 429 with a body Angular can parse  
- Production response headers include your baseline set; Swagger returns 404 outside Development  
- Outbound URL parameter with internal IP → rejected before HttpClient call  

## If an interviewer asks

How do you map OWASP API Top 10 to ASP.NET Core?

**Strong answer:** Treat it as a control checklist. API1 resource handlers and ownership checks; API2 solid JWT/refresh; API3 DTOs not entities; API4 rate limits and pagination caps; API5 policies not UI hiding; API6 quotas and idempotency on sensitive flows; API7 URL allow-lists; API8 headers/CORS/Swagger gating; API9 versioned inventory; API10 validate outbound dependencies. Angular never replaces server authZ.

**Related:** [JWT auth checklist](/blog/aspnet-core-jwt-auth) · [RBAC policies](/blog/aspnet-core-rbac-guide) · [Rate limiting](/blog/aspnet-core-rate-limiting) · [Security headers](/blog/aspnet-core-security-headers) · [CORS](/blog/cors-angular-aspnet-core) · [API validation](/blog/aspnet-core-api-validation)

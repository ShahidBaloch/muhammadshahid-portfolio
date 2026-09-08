---
title: "ASP.NET Core Middleware Order for Auth and CORS"
description: "ASP.NET Core middleware order for production — forwarded headers, exception handler, CORS before auth, rate limiting, and Swagger placement behind Azure and Angular SPAs."
date: "2026-09-06"
updated: "2026-09-08"
category: "architecture"
tags: ["ASP.NET Core", "Middleware", "CORS", "JWT", "API Security"]
related:
  - cors-angular-aspnet-core
  - aspnet-core-global-exception-handling
  - aspnet-core-rate-limiting
faq:
  - q: "What is the correct ASP.NET Core middleware order?"
    a: "Forwarded headers, exception handler, HTTPS, CORS, authentication, authorization, then rate limiting and endpoints. Swagger is last among the public pipeline pieces."
  - q: "Should UseCors run before UseAuthentication?"
    a: "Yes. If auth runs first, a 401 often has no ACAO header and Chrome labels it CORS. The allowlist itself is the CORS article, not this page."
  - q: "Is middleware order the same as a CORS policy?"
    a: "No. Order is Program.cs sequence. Policy is which origins and headers. Fix the sequence here; fix origins on the CORS URL."
---

## Definition

**ASP.NET Core middleware order** is the sequence of `app.Use*` calls in `Program.cs`. Each middleware wraps the next. Order determines which middleware sees the request first and which can still modify headers on the way out. This is **not** the CORS allowlist — it is the pipeline sequence that lets CORS headers reach the browser on 401s, 429s, and exception responses.

## Analogy

Middleware is an airport security line — order matters:

```text
Request enters  →  [Forwarded Headers]  →  [Exception Handler]
                 →  [HTTPS]  →  [CORS]  →  [Auth]  →  [Authorization]
                 →  [Rate Limiter]  →  [Your Controller]

If CORS is AFTER auth:
  Auth rejects at gate → no boarding pass stamp (ACAO header)
  Browser says "CORS error" → you blame the wrong gate
```

Put CORS before anything that can fail the request, so the browser can read the real status.

## Routing

**Middleware order question** → stay here.

**CORS origins, credentials, preflight** → [CORS between Angular and ASP.NET Core](/blog/cors-angular-aspnet-core).

**ProblemDetails envelope shape** → [global exception handling](/blog/aspnet-core-global-exception-handling).

**Rate limiter algorithms and 429 headers** → [ASP.NET Core rate limiting](/blog/aspnet-core-rate-limiting).

**JWT validation parameters** → [JWT auth checklist](/blog/aspnet-core-jwt-auth).

**HasStarted / streaming after write** → [Headers are read-only](/blog/aspnet-core-headers-readonly-response-started).

**Architecture topic map** → [architecture hub](/learning/architecture).

## Details

I have unwound this on healthcare admin APIs and marketplace gateways. The policy was right. `UseAuthentication` sat above `UseCors`, or forwarded headers never ran on App Service.

### The order I ship

```csharp
var app = builder.Build();

app.UseForwardedHeaders();          // 1. scheme/host behind Azure / nginx
app.UseExceptionHandler();          // 2. errors still need CORS on the way out
if (!app.Environment.IsDevelopment())
    app.UseHsts();
app.UseHttpsRedirection();
app.UseRouting();
app.UseCors("Spa");                 // 3. before anything that can 401/429
app.UseRateLimiter();
app.UseAuthentication();            // 4. before authorization — always
app.UseAuthorization();
app.MapControllers();
```

Swagger maps only in Development, after the same CORS/auth rules you care about for the SPA. Health checks I map with `.AllowAnonymous()` so a probe does not depend on JWT.

The rule: **anything that can fail a request must still be able to talk to the browser, and `User` must exist before policies run.**

### Forwarded headers before HTTPS and auth

On Azure App Service, Kestrel often sees `http` internally. If `UseForwardedHeaders` is missing or too late:

- `UseHttpsRedirection` fights the load balancer
- Cookie `Secure` / OIDC `redirect_uri` scheme is wrong
- IdentityServer thinks the request is `http://localhost`

That is not a CORS bug. It is order plus `ForwardedHeadersOptions` (known proxies, `X-Forwarded-For` / `Proto`).

### Auth before authorization — a different bug than CORS

`UseAuthorization` above `UseAuthentication` means `HttpContext.User` is still empty. Every `[Authorize]` looks anonymous. Swagger might still work if it never hit that build.

CORS-before-auth is the sibling: a real 401 with **no** `Access-Control-Allow-Origin`. Chrome says CORS. Curl shows 401. Fix: `UseCors` before auth **and** a CORS-aware exception handler.

### Rate limiting after CORS

A limiter registered before CORS returns a naked 429. Same class of "browser cannot read the status." Register limiter after CORS, or add ACAO on the 429 path.

### Exception handler is first, not a substitute for ProblemDetails

`UseExceptionHandler` short-circuits. If it runs first (good) but writes JSON without CORS headers, Angular sees a network error. How to shape ProblemDetails is [global exception handling](/blog/aspnet-core-global-exception-handling). Here: the handler must run **after forwarded headers** and still emit ACAO for the SPA origin.

### What this page is not

- Not `WithOrigins` vs `AllowCredentials` — CORS article
- Not JWT validation parameters — [JWT checklist](/blog/aspnet-core-jwt-auth)
- Not IdentityServer client URIs — [redirect URI loops](/blog/identityserver-redirect-uri-login-loop)
- Not **Headers are read-only, response has started** — [HasStarted / streaming](/blog/aspnet-core-headers-readonly-response-started)

### Checklist

- [ ] `UseForwardedHeaders` before HTTPS redirection and auth
- [ ] Exception handler is early and CORS-aware
- [ ] `UseCors` before authentication, authorization, and rate limiting
- [ ] `UseAuthentication` immediately before `UseAuthorization`
- [ ] Controllers / Minimal APIs mapped last
- [ ] Preflight and failed GET both carry ACAO (verify with curl, not only Chrome)

## If an interviewer asks

**"What is the correct ASP.NET Core middleware order for an Angular SPA with JWT?"**

**Strong answer:** Forwarded headers first (behind Azure/nginx), then exception handler, HTTPS, routing, CORS before auth (so 401s carry ACAO headers), authentication before authorization, rate limiter after CORS, endpoints last. If Chrome shows a CORS error on a 401, check order before blaming the allowlist. If every user is anonymous after a refactor, authorization is probably registered before authentication.

**Weak answer:** "CORS goes somewhere in Program.cs."

## Related reading

- [CORS between Angular and ASP.NET Core](/blog/cors-angular-aspnet-core)
- [ASP.NET Core global exception handling](/blog/aspnet-core-global-exception-handling)
- [ASP.NET Core rate limiting](/blog/aspnet-core-rate-limiting)
- [Architecture hub](/learning/architecture)

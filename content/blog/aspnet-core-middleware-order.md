---
title: "ASP.NET Core Middleware Order: The Pipeline That Breaks Auth and CORS"
description: "Full ASP.NET Core middleware order I ship — forwarded headers, exception handler, CORS, auth before authorization, rate limits, and Swagger — not a CORS policy tutorial."
date: "2026-09-06"
category: "architecture"
tags: ["ASP.NET Core", "Middleware", "CORS", "JWT", "API Security"]
---

**ASP.NET Core middleware order** is the list in `Program.cs`, not the CORS allowlist. Searchers land here after Swagger works and Chrome lies. Origins, credentials, and preflight belong in [CORS between Angular and ASP.NET Core](/blog/cors-angular-aspnet-core). This URL is **only the sequence**.

I have unwound this on healthcare admin APIs and marketplace gateways. The policy was right. `UseAuthentication` sat above `UseCors`, or forwarded headers never ran on App Service.

## The order I ship

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

## Forwarded headers before HTTPS and auth

On Azure App Service, Kestrel often sees `http` internally. If `UseForwardedHeaders` is missing or too late:

- `UseHttpsRedirection` fights the load balancer
- Cookie `Secure` / OIDC `redirect_uri` scheme is wrong
- IdentityServer thinks the request is `http://localhost`

That is not a CORS bug. It is order plus `ForwardedHeadersOptions` (known proxies, `X-Forwarded-For` / `Proto`). I set this before exception handling when the error page itself needs the public scheme.

## Auth before authorization — a different bug than CORS

[ASP.NET Core interview scenarios](/blog/aspnet-core-interview-questions-scenarios) include the refactor that swapped these two. I repeat it here because it is **pipeline**, not trivia:

`UseAuthorization` above `UseAuthentication` means `HttpContext.User` is still empty. Every `[Authorize]` looks anonymous. Swagger might still work if it never hit that build.

CORS-before-auth is the sibling: a real 401 with **no** `Access-Control-Allow-Origin`. Chrome says CORS. Curl shows 401. Fix: `UseCors` before auth **and** a CORS-aware exception handler. Policy details stay on the CORS article.

## Rate limiting after CORS

A limiter registered before CORS returns a naked 429. Same class of “browser cannot read the status.” Register limiter after CORS, or add ACAO on the 429 path. Algorithm choice is [rate limiting](/blog/aspnet-core-rate-limiting).

## Exception handler is first, not a substitute for ProblemDetails

`UseExceptionHandler` short-circuits. If it runs first (good) but writes JSON without CORS headers, Angular sees a network error. How to shape ProblemDetails is [global exception handling](/blog/aspnet-core-global-exception-handling). Here: the handler must run **after forwarded headers** and still emit ACAO for the SPA origin.

## What this page is not

- Not `WithOrigins` vs `AllowCredentials` — CORS article
- Not JWT validation parameters — [JWT checklist](/blog/aspnet-core-jwt-auth)
- Not IdentityServer client URIs — [redirect URI loops](/blog/identityserver-redirect-uri-login-loop)

## Checklist

- [ ] `UseForwardedHeaders` before HTTPS redirection and auth
- [ ] Exception handler is early and CORS-aware
- [ ] `UseCors` before authentication, authorization, and rate limiting
- [ ] `UseAuthentication` immediately before `UseAuthorization`
- [ ] Controllers / Minimal APIs mapped last
- [ ] Preflight and failed GET both carry ACAO (verify with curl, not only Chrome)

If OPTIONS is 204 with headers and GET is 401 without headers, auth is before CORS. If every user is anonymous after a refactor, authorization is before authentication. Bring the `Program.cs` list — [contact me](/contact) if you want that pipeline reviewed.

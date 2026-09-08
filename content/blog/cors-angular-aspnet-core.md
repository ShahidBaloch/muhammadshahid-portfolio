---
title: "Fix CORS Between Angular and ASP.NET Core"
description: "Fix CORS between Angular and ASP.NET Core — exact origins, AllowCredentials, OPTIONS preflight, middleware order, Azure App Service, and cookie-based JWT refresh."
date: "2026-01-18"
category: "authentication"
tags: ["Angular", "ASP.NET Core", "CORS", "Azure"]
faq:
  - q: "How do I fix CORS between Angular and ASP.NET Core?"
    a: "Allow the exact SPA origin, place UseCors before auth, and match headers the preflight asks for. Swagger and Postman never prove the browser path."
  - q: "Why does CORS fail with credentials and a wildcard origin?"
    a: "The browser forbids Access-Control-Allow-Origin: * when credentials are true. Name the Angular origin. This is the usual cookie-refresh failure."
  - q: "Is a failed Angular call always CORS?"
    a: "No. Chrome reports CORS when the preflight or the response has no ACAO header — including 401s from JWT middleware that ran before UseCors."
---

**CORS (Cross-Origin Resource Sharing)** is a browser-enforced contract: the API must echo the SPA's exact `Origin` in response headers before JavaScript may read the response — Swagger and Postman never prove this path.

```text
Angular (origin A) ──► API (origin B)
         │
    Browser sends Origin: A
         │
    API must respond with Access-Control-Allow-Origin: A
         │
    Missing or wrong ──► red CORS error (even if API logic succeeded)
```

Think of CORS as a **bouncer reading guest lists at two different doors**: your API may be open to curl from anywhere, but the browser only lets scripts from listed origins read answers. Auth with cookies or `Authorization` adds preflight — an `OPTIONS` handshake before the real request.

**New to this** → stay here. **Middleware order issues** → [ASP.NET Core middleware order](/blog/aspnet-core-middleware-order). **Cookie refresh + credentials** → [httpOnly refresh cookie](/blog/refresh-token-httponly-cookie-angular-aspnet-core). **Interview prep** → [If an interviewer asks](#if-an-interviewer-asks).

## The failure is almost always environmental, not logical

CORS is enforced by the browser, not by your controller. Two URLs that look "the same" to a human are different origins if scheme, host, or port differ.

These are four different origins:

- `http://localhost:4200`
- `https://localhost:4200`
- `https://localhost:5001`
- `https://api.carbazaar.example`

Your Angular `environment.ts` must match what the server allowlist expects — character for character. I have lost time to `https://app.client.com` vs `https://app.client.com/` and to staging URLs that still pointed at production API hosts after a DNS cutover.

First thing I verify: open DevTools, click the failed request, read the `Origin` header, and compare it to `WithOrigins(...)` in `Program.cs`. No guessing.

## Wrong origins after auth lands

Teams often get public GET endpoints working, then authentication breaks CORS overnight.

The pattern is predictable:

1. MVP ships with a loose policy or dev proxy
2. Login arrives — JWT in `Authorization` or cookies with `withCredentials: true`
3. Someone adds `AllowCredentials()` but forgets to remove wildcard thinking
4. Browser rejects the response because credentialed requests cannot use `Access-Control-Allow-Origin: *`

On a healthcare registration portal I supported, the Angular app sent cookies after IdentityServer sign-in. The API policy still reflected `*` from early scaffolding. Login appeared to succeed; every protected call failed with a CORS error that looked like a broken API.

Fix: explicit origins and a consistent credential strategy.

```csharp
builder.Services.AddCors(options =>
{
    options.AddPolicy("SpaClients", policy =>
    {
        policy.WithOrigins(
                builder.Configuration["Cors:SpaOrigin"]!)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});
```

Store origins in configuration so staging and production differ without code changes. On Azure App Service, I map these to application settings rather than hard-coding client domains in source.

Cookie refresh tokens and `withCredentials` are the [httpOnly cookie article](/blog/refresh-token-httponly-cookie-angular-aspnet-core). Do not enable `AllowCredentials()` if Angular only sends `Authorization` and never cookies.

### AllowAnyOrigin + AllowCredentials throws

ASP.NET Core refuses this combination (`InvalidOperationException`). A credentialed response cannot use `Access-Control-Allow-Origin: *`. The fix is `WithOrigins(...)`, not catching the exception. Staging still needs explicit localhost entries.

### Chrome says CORS; the status is 401

If curl against the API origin returns 401 and the SPA console says CORS, the error response likely **omitted** CORS headers (middleware order, or an exception before CORS). Put `UseCors` where 401/403 still get `Access-Control-Allow-Origin` for that origin. Until that happens, the [401 refresh interceptor](/blog/angular-interceptor-401-refresh-queue) never sees a clean 401.

## Preflight is where infrastructure hides the problem

Simple GET requests may skip preflight. JSON POST, PUT, PATCH, and DELETE usually trigger an `OPTIONS` request first. Angular also sends preflight when you attach custom headers — correlation IDs, tenant keys, feature flags.

Symptoms:

- `OPTIONS` returns 404 or 405
- `OPTIONS` succeeds but has no CORS headers
- `OPTIONS` hits authentication and returns 401

On one marketplace project, nginx forwarded GET and POST to Kestrel but answered `OPTIONS` itself with an empty 204. Angular reported CORS failure; the ASP.NET Core controller was never involved.

My preflight checklist:

1. Run `curl -X OPTIONS` against the API URL with `Origin` and `Access-Control-Request-Method` headers
2. Confirm the response includes `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, and allowed headers
3. Confirm `OPTIONS` reaches the app — not just the edge proxy
4. Confirm no `[Authorize]` requirement blocks anonymous preflight

Middleware order matters. CORS must run early enough to decorate error responses too. If your exception middleware returns JSON before CORS runs, DevTools still screams CORS even when the real fault is a 500.

```csharp
app.UseRouting();
app.UseCors("SpaClients");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
```

## Reverse proxies and Azure App Service double configuration

Production setups rarely expose Kestrel directly. Angular calls `https://api.client.com`, which might be Azure Front Door, Application Gateway, nginx, or IIS.

Each layer can add or strip headers. The painful case on Azure: CORS configured in the App Service portal **and** in ASP.NET Core. Two systems writing `Access-Control-Allow-Origin` can produce values the browser rejects.

What I do on Azure deliveries:

- Pick one owner for CORS — usually the application — and disable conflicting platform rules
- Verify `OPTIONS` through the full path, not just direct Kestrel on a deployment slot
- After slot swaps, re-test from the SPA origin; staging and production hostnames differ

For CarBazaar-style deployments where the Angular app and API sit on different subdomains, I document the allowed origins in the runbook alongside TLS and cookie domain settings. CORS, cookies, and IdentityServer redirect URIs fail together when DNS changes.

## Angular-side mistakes I still see

CORS is a server response requirement, but the client triggers it.

**Calling the wrong base URL.** `environment.prod.ts` still pointing at `localhost` is embarrassing and common.

**Mixing proxy and direct calls.** During local dev I often use `proxy.conf.json` so the browser sees one origin while the CLI forwards to Kestrel. That removes CORS locally. If one service bypasses the proxy and calls `https://localhost:5001` directly, only that feature breaks — which makes debugging harder.

**Forgetting `withCredentials`.** Cookie-based sessions need it on every API call, not just login.

```typescript
this.http.get(`${environment.apiUrl}/catalog/products`, {
  withCredentials: true
});
```

**Bearer tokens without preflight awareness.** JWT in `Authorization` usually does not need `withCredentials`, but non-simple headers still preflight. Ensure the policy allows the headers you send.

## A practical debugging sequence

When I join a client project mid-incident, I follow the same path:

1. Reproduce in an incognito window — extensions and stale service workers lie
2. Identify whether the failed call is preflight (`OPTIONS`) or the actual request
3. Compare `Origin` to server allowlist exactly
4. Test the same URL with and without auth headers
5. Hit the endpoint through Swagger only to separate API logic from browser policy
6. Trace the request through reverse proxy / App Service / CDN
7. Read response headers on **error** responses, not just 200s

That sequence has saved me from "fixing" Angular when nginx was the problem, and from rewriting auth when the allowlist still listed last month's staging URL.

## Security notes clients ask about

Allowing a SPA origin is not opening the API to the whole internet. It tells the browser that scripts loaded from that origin may read responses. Attackers can still call your API directly with curl — which is why authentication and authorization stay mandatory.

I do not reflect arbitrary `Origin` headers. If a product later needs multiple tenant frontends, I use an explicit list or a tightly validated configuration source — never trust whatever arrived in the header.

For healthcare and marketplace clients, I also align CORS with Content Security Policy and cookie attributes. Fixing CORS alone does not help if `SameSite=None` cookies never persist.

## What I deliver besides a working policy

Freelance value is not a pasted `AddCors` block. It is:

- Environment-specific origin lists checked into configuration templates
- A one-page note explaining local proxy vs deployed CORS
- Verification steps in the deployment checklist
- Confirmation that auth, CORS, and IdentityServer redirect URIs agree after go-live

That documentation prevents the same ticket three sprints later when a new developer adds a header and revives preflight surprises.

## Closing

Most Angular and ASP.NET Core CORS issues come from mismatched origins after credentials are enabled, preflight blocked upstream, or duplicate configuration at Azure and the app. Fix middleware order, use explicit allowlists, test `OPTIONS` through production infrastructure, and treat the browser error as a header problem — not proof that your business logic failed.

## If an interviewer asks

**"Why can't you use AllowAnyOrigin with AllowCredentials?"**

**Strong answer:** Browser spec forbids `Access-Control-Allow-Origin: *` when credentials are included. ASP.NET Core throws `InvalidOperationException` if you try. You must list exact origins with `WithOrigins(...)`.

**"Swagger works but Angular shows CORS — why?"**

**Strong answer:** CORS is browser-only. Postman and Swagger do not enforce origin checks. The SPA's `Origin` header must match the API allowlist. Also check middleware order — 401 responses without CORS headers look like CORS failures in Chrome.

**"Where does UseCors go in the pipeline?"**

**Strong answer:** After `UseRouting`, before `UseAuthentication`. CORS must decorate error responses (401, 403, 500) too — if auth runs first and short-circuits without CORS headers, DevTools reports CORS even when the real issue is auth.

---
title: "Fixing CORS Between Angular and ASP.NET Core (What I Actually Check on Client Projects)"
description: "Wrong origins, credentials, preflight, reverse proxies, and Azure App Service — the CORS failures I diagnose most often when Angular SPAs call ASP.NET Core APIs."
date: "2026-01-18"
category: "architecture"
tags: ["Angular", "ASP.NET Core", "CORS", "Azure"]
---

CORS is the kind of problem that makes a senior engineer look junior for twenty minutes. The API returns 200 in Swagger. Postman is fine. The Angular app in Chrome shows a red console error about `Access-Control-Allow-Origin`, and someone on the call asks whether the backend is down.

It is not down. The browser is doing its job.

I have wired Angular front ends to ASP.NET Core APIs across healthcare provider registration portals, marketplace admin panels like CarBazaar, and catalog backends on projects such as Ecom_NET10. CORS is never the feature the client pays for, but it blocks every feature until the browser trusts the handshake. This is the checklist I run when a client says the SPA "cannot reach the API."

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

If you are shipping an Angular SPA against an ASP.NET Core API and CORS is eating your sprint, [get in touch](/contact) — I can usually trace it to the right layer in the first session.

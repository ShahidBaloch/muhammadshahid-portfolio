---
title: "Angular SSR Hosted by ASP.NET Core: Production Layout That Works"
description: "Host Angular SSR or prerender with an ASP.NET Core API — process layout, cookies and TransferState, MapFallbackToFile vs API routes, App Service/container deploy sketch, and when SSR is not worth it for SaaS shells."
date: "2026-10-01"
category: "angular"
tags: ["Angular", "SSR", "ASP.NET Core", "Hosting", "SEO"]
related:
  - docker-dotnet-angular-local
  - azure-app-service-aspnet-core
  - bff-pattern-aspnet-core-angular-yarp
faq:
  - q: "How do I host Angular SSR with ASP.NET Core?"
    a: "Keep the API on ASP.NET Core. Serve prerendered or SSR HTML either from a Node Angular SSR process behind the same reverse proxy, or from prerendered static files ASP.NET Core serves with MapFallbackToFile — never let API route order lose to the SPA fallback."
  - q: "Is Angular SSR required for every ASP.NET Core + Angular product?"
    a: "No. Authenticated SaaS shells rarely need SSR for SEO. Use SSR/prerender for marketing, public directories, and LCP-critical public pages. Keep the logged-in app CSR unless you have a measured reason."
  - q: "How is this different from Docker Compose local Angular + API?"
    a: "The Compose guide is local wiring. This post is production hosting topology for SSR/prerender, auth/cookie boundaries, and deploy layout."
---

**Angular SSR hosted by ASP.NET Core** is a production topology: public HTML rendered ahead of time or on a Node SSR process, APIs still owned by ASP.NET Core, and a reverse proxy that sends `/api` one place and document requests another — without breaking cookies or hydration.

```text
Browser
  │
  ▼
Reverse proxy / App Service / YARP
  ├─ /api/*     → ASP.NET Core API
  ├─ /auth/*    → API or BFF
  └─ /*         → Angular SSR (Node) or static prerender + MapFallbackToFile
```

**New to this** → stay here. **Local Compose** → [Docker .NET + Angular](/blog/docker-dotnet-angular-local). **BFF cookies** → [BFF + YARP](/blog/bff-pattern-aspnet-core-angular-yarp).

Search intent for **angular ssr asp.net core** is how-to on hosting layout, not “what is Universal” theory.

## SSR vs prerender vs CSR: choose per product surface

| Mode | What runs at request time | Good for |
|---|---|---|
| **CSR** | Browser downloads shell + JS, then data | Authenticated SaaS apps |
| **Prerender** | Build-time HTML for known routes | Marketing, docs, public landing |
| **SSR** | Node renders HTML per request | Public pages needing fresh data + SEO |

I split surfaces in healthcare/SaaS portfolios:

- `www.example.com` marketing → prerender or SSR  
- `app.example.com` clinician shell → CSR (often with BFF)  
- Public provider directory → SSR/prerender  

Do not force SSR onto every authenticated charting screen. You pay complexity (TransferState, cookie forwarding, hydration) for little SEO gain behind login.

## Where ASP.NET Core serves HTML vs API

Two workable layouts:

### A) ASP.NET Core serves static prerender + API (simplest)

Angular build outputs browser files (and prerendered routes) into `wwwroot` or a known folder. ASP.NET Core:

```csharp
app.MapControllers(); // or MapGroup("/api")
app.MapHub<NotifyHub>("/hubs/notify");

app.UseDefaultFiles();
app.UseStaticFiles();

// AFTER API routes
app.MapFallbackToFile("index.html");
```

**Route precedence:** map APIs *before* fallback. Otherwise `GET /api/patients` returns `index.html` and Angular looks “broken” while Network shows 200 HTML.

### B) Node Angular SSR + ASP.NET Core API behind one proxy (true SSR)

- Process 1: Kestrel API  
- Process 2: `node server.mjs` (Angular SSR)  
- Proxy: `/api` → Kestrel, everything else → Node  

YARP or nginx/Caddy/App Service multi-container all work. ASP.NET Core does **not** have to execute Angular SSR itself.

```csharp
// YARP sketch in a BFF/gateway project
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));
// routes: api-cluster → api:8080, ssr-cluster → ssr:4000
```

## Node SSR process vs prerender-only pipelines

**Prerender-only** (often enough):

```bash
ng build --configuration production
# outputs prerendered HTML for routes listed in angular.json
```

CI copies `dist/.../browser` into the API’s static file root or a CDN + API origin.

**SSR Node process:**

- Needs CPU/memory sizing separate from Kestrel  
- Must forward cookies/auth headers carefully for personalized HTML  
- Health checks should probe Node as well as the API ([health checks](/blog/aspnet-core-health-checks))  

If your “SSR” need is SEO for ten marketing routes, prerender wins. If pages need per-request data that changes every minute and must appear in first HTML, SSR earns its keep.

## Cookies, auth, and TransferState boundaries

Rules that keep SaaS/healthcare teams out of trouble:

1. **Do not put access tokens in TransferState.** Anything in SSR HTML is world-readable in view-source.  
2. **Prefer anonymous or public DTOs in SSR.** Personalized PHI belongs after hydration via authenticated API calls.  
3. **HttpOnly cookie BFF** sessions can be forwarded to the API from Node only if you treat Node as a trusted peer on a private network — still do not echo secrets into HTML.  
4. **CORS** matters less when same-origin via proxy; it returns if you host API on another origin ([CORS](/blog/cors-angular-aspnet-core)).  

TransferState example for *public* catalog data only:

```typescript
// server: fetch public directory, set to TransferState
// browser: read TransferState first to avoid duplicate GET
const KEY = makeStateKey<ProviderDirectoryDto>('provider-directory');

if (isPlatformServer(platformId)) {
  const data = await firstValueFrom(this.api.getPublicDirectory());
  transferState.set(KEY, data);
  return data;
}
return transferState.get(KEY, null) ?? await firstValueFrom(this.api.getPublicDirectory());
```

## Deploy sketch: App Service / containers / reverse proxy

### App Service (API + static)

1. Build Angular → artifact `browser/`  
2. Copy into ASP.NET Core `wwwroot` in CI  
3. Publish API  
4. Deploy one App Service ([App Service guide](/blog/azure-app-service-aspnet-core))  

Good for prerender/CSR hybrid. Not ideal for heavy Node SSR unless you use a second site or container.

### Containers

```text
service api   → aspnet image :8080
service ssr   → node image   :4000
service proxy → nginx/yarp   :443
```

Same VNet; only proxy is public. Align with [local Docker habits](/blog/docker-dotnet-angular-local) but bake production TLS and health endpoints.

### CDN + API

Static/prerender on CDN/blob; API on App Service. Deep links for SPA still need fallback rules on the static host (`index.html` for unknown paths) *except* `/api/*` which never hits the CDN app shell.

## Deep links, MapFallbackToFile, and API route precedence

Broken deep links (`/providers/123` refresh → 404) mean the static host lacks fallback. Broken APIs mean fallback stole `/api`.

Checklist:

1. Register all API endpoints first  
2. Then static files  
3. Then `MapFallbackToFile("index.html")` **excluding** `/api`, `/health`, `/hubs`  
4. If using PathBase / virtual directories, test refresh on nested routes  

```csharp
app.MapGroup("/api").MapPatientEndpoints();
app.MapHealthChecks("/health/live");
app.MapFallbackToFile("{*path:regex(^(?!api|health|hubs).*$)}", "index.html");
// or use a clearer two-app proxy layout and avoid regex heroics
```

Standalone Angular routing still owns client paths ([standalone components](/blog/angular-standalone-components)).

## Hydration mismatch footguns (preview)

Hydration fails when server HTML and browser first render disagree:

- `Date.now()`, random ids, locale-dependent formatting in templates  
- Auth-gated `@if (user())` rendering differently on server (often null) vs browser  
- CSS that depends on `window` measurements  

Mitigations: keep SSR markup public/stable; defer personalized blocks to `afterNextRender`; fix clocks/locales. Deep hydration debugging is a sibling topic — here: **do not SSR personalized PHI chrome**.

## When SSR is not worth it for authenticated SaaS shells

Skip full SSR when:

- Nearly all routes require login  
- SEO is irrelevant for PHI screens  
- Team does not want to operate Node + .NET  
- LCP issues are actually giant JS bundles / unbounded tables — fix CSR performance first  

Use prerender for marketing only, CSR for `app.`, and put effort into API performance, OnPush, and bundle budgets.

## Production checklist

1. Decide per surface: CSR vs prerender vs SSR  
2. Document topology (who serves HTML, who serves `/api`)  
3. API routes registered before SPA fallback  
4. No secrets/tokens in TransferState or prerender HTML  
5. Health checks cover every process you deploy  
6. Deep link refresh tested on production-like host  
7. Auth cookies work same-site with proxy  
8. Hydration: public pages clean; app shell may stay CSR  

## Common mistakes I still see

1. **`MapFallbackToFile` before Minimal APIs** — HTML for JSON routes  
2. **SSR fetching with user access tokens baked into HTML**  
3. **One App Service trying to run Node SSR without a process plan**  
4. **Treating Compose local as production topology**  
5. **Forcing SSR on the entire clinician app for “Google ranking”**  

## Verification

- `curl -I https://host/api/health` → API content-type, not `text/html`  
- `curl https://host/providers/some-slug` → HTML includes meaningful public content (prerender/SSR)  
- Browser refresh on client route → 200 app shell, then hydrate  
- View-source on SSR page → no bearer tokens or PHI payloads  
- Proxy logs show `/api` and `/` hitting different upstreams  

## If an interviewer asks

How would you host Angular SSR with ASP.NET Core?

**Strong answer:** Split HTML and API at the proxy. Prefer prerender for static marketing; Node SSR only when HTML must be request-fresh. ASP.NET Core owns `/api` and auth. Never put tokens in TransferState. Authenticated SaaS shells often stay CSR.

**Related:** [Docker local Angular + .NET](/blog/docker-dotnet-angular-local) · [App Service](/blog/azure-app-service-aspnet-core) · [BFF YARP](/blog/bff-pattern-aspnet-core-angular-yarp) · [CORS](/blog/cors-angular-aspnet-core) · [Standalone Angular](/blog/angular-standalone-components)


## Concrete folder layout for prerender-into-wwwroot

```text
Clinic.Api/
  wwwroot/          # CI copies Angular browser output here
  Program.cs
Clinic.Web/         # Angular workspace
  projects/web/
```

CI sketch:

```yaml
- run: npm ci
  working-directory: Clinic.Web
- run: npm run build -- --configuration production
  working-directory: Clinic.Web
- run: |
    rm -rf ../Clinic.Api/wwwroot/*
    cp -R dist/web/browser/* ../Clinic.Api/wwwroot/
- run: dotnet publish Clinic.Api -c Release -o publish
```

Verify `wwwroot/index.html` exists before publish. Missing copy is the #1 “blank App Service” failure.

## Same-origin BFF vs separate API origin with SSR

**Same-origin (preferred with SSR):** proxy serves HTML and `/api` together. Browser cookies are first-party. SSR Node calls `http://api:8080` over the private network, not the public JWT in HTML.

**Separate API origin:** Angular SSR must use absolute API URLs carefully; browser calls need CORS; cookie auth gets painful. Prefer BFF ([YARP BFF](/blog/bff-pattern-aspnet-core-angular-yarp)).

## Caching headers for prerendered marketing pages

Prerendered HTML can be CDN-cached. API responses for personalized data must not inherit those headers.

```csharp
// API endpoints
context.Response.Headers.CacheControl = "no-store";
```

Static assets from Angular (`*.js` hashed names) get long cache; `index.html` gets short cache or revalidation so new deploys roll out.

## SSR and CSP nonces (pointer)

If you ship a strict Content Security Policy, SSR must inject the same nonce into rendered script tags that ASP.NET Core emits for CSR index middleware. Coordinate with the CSP post — mismatched nonces break hydration/boot.

## Staging verification script

```bash
# API not captured by SPA fallback
curl -s -o /dev/null -w "%{content_type}\n" https://staging/api/health
# expect application/json

# marketing route has product name in first HTML
curl -s https://staging/pricing | grep -i "pricing"

# no authorization headers leaked
curl -s https://staging/pricing | grep -i "bearer" && echo FAIL || echo OK
```

## Team operating model

Document owners:

- **API team** — Kestrel, auth, ProblemDetails  
- **Web team** — Angular routes, prerender list, hydration  
- **Platform** — proxy, TLS, health probes for Node + API  

Without owners, SSR becomes an orphan process that nobody patches.


## Choosing routes for prerender lists

In `angular.json` (or application config), list only public routes:

```json
"prerender": {
  "routes": ["/", "/pricing", "/providers", "/providers/featured"]
}
```

Do not prerender `/charts/:id` or `/patients/:id`. Those need auth and personalization. Dynamic provider pages can use SSR or a generate-params script that pulls a public sitemap from the API at build time — with a hard cap so CI does not scrape unbounded PHI-adjacent data.

## Local production-parity run

1. `ng build --configuration production`  
2. Copy to `wwwroot`  
3. `dotnet run` with Production environment  
4. Disable Angular proxy; hit Kestrel origin only  

This catches fallback order bugs that `ng serve` never shows. Pair with [Docker local](/blog/docker-dotnet-angular-local) when you need Node SSR + API together.


## Environment-specific API base URLs for SSR vs browser

On the server, Angular should call an **internal** URL (`http://api:8080`); in the browser, relative `/api` same-origin. Use providers:

```typescript
export const API_BASE = new InjectionToken<string>('API_BASE');

// server.ts providers: { provide: API_BASE, useValue: process.env['API_INTERNAL'] }
// browser: { provide: API_BASE, useValue: '' } // relative
```

Mixing them causes SSR to call localhost incorrectly in containers or double-fetch with CORS failures.

## Error pages and status codes for prerendered routes

Marketing 404s should return real HTTP 404 with a prerendered not-found body when possible. SPA-only fallback that returns 200 for unknown URLs hurts SEO. Configure the host carefully: unknown *API* paths → API 404 JSON; unknown *page* paths → HTML 404 or app shell based on product choice.

## Observability for two processes

If Node SSR and Kestrel both run, health and logs must cover both. A green API with a dead SSR process means homepage 502 while `/api/health` still passes — split probes at the proxy.


## Auth cookie SameSite with split hosts

If marketing is `www` (SSR) and app is `app` (CSR) on different subdomains, cookies need deliberate `Domain` and `SameSite` settings. Prefer a BFF on the app host for session cookies rather than sharing auth cookies with the public SSR site. Public SSR should not need the clinician session cookie at all.

## Incremental adoption plan

1. Ship CSR app + API (already working)  
2. Prerender marketing routes into wwwroot  
3. Measure SEO/LCP  
4. Add Node SSR only for routes that still need request-time HTML  
5. Stop — do not SSR the authenticated shell without a measured goal  

## Content negotiation footgun

Do not serve `index.html` for `Accept: application/json` on `/api/*`. Keep API and HTML pipelines separate at the proxy. This is the same class of bug as fallback stealing API routes.

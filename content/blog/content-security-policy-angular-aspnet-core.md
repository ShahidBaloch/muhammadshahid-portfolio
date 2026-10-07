---
title: "Content Security Policy for Angular Hosted by ASP.NET Core"
description: "Configure Content Security Policy for Angular and ASP.NET Core — nonce-based middleware, inline script handling, and violation reporting."
date: "2026-10-01"
category: "security"
tags: ["CSP", "Content Security Policy", "Angular", "ASP.NET Core", "Security"]
related:
  - aspnet-core-security-headers
  - bff-pattern-aspnet-core-angular-yarp
  - azure-app-service-aspnet-core
faq:
  - q: "How do I set Content Security Policy for Angular with ASP.NET Core?"
    a: "Serve index.html through ASP.NET Core (or your BFF), inject a per-request nonce into the CSP header and into script tags, avoid unsafe-inline for scripts in production, and roll out with Content-Security-Policy-Report-Only first."
  - q: "Why does Angular break with a strict CSP?"
    a: "Older or misconfigured builds rely on inline scripts/styles. Strict CSP blocks them. Use nonces/hashes, avoid runtime dynamic script injection, and fix third-party widgets that require unsafe-eval."
  - q: "Is CSP covered by the basic security headers guide?"
    a: "That post surveys headers. This page is the Angular-hosting deep dive for CSP nonces, SPA boot, and Report-Only operations."
---

**Content Security Policy for Angular hosted by ASP.NET Core** is a nonce-based (or hash-based) CSP that still boots your SPA — not `unsafe-inline` forever and not a one-line header copied from a blog that breaks Material and charts.

```text
Browser requests /
        │
        ▼
ASP.NET Core / BFF
  generate nonce
  CSP header with nonce-...
  index.html script tags include same nonce
        │
        ▼
Angular boots without unsafe-inline scripts
```

**New to this** → stay here. **Header baseline** → [security headers](/blog/aspnet-core-security-headers). **Same-origin BFF** → [YARP BFF](/blog/bff-pattern-aspnet-core-angular-yarp).

Search intent for **content security policy angular asp.net core** is how-to production CSP for the SPA host.

## Why basic security-headers posts are not enough for SPAs

`X-Content-Type-Options` and `frame-ancestors` are necessary and comparatively easy. CSP is where Angular teams regress to:

```http
Content-Security-Policy: script-src 'self' 'unsafe-inline' 'unsafe-eval'
```

That undoes the XSS containment CSP is for. Hosting Angular from ASP.NET Core gives you a perfect place to inject **per-request nonces** into HTML — something a pure CDN static bucket cannot do without edge workers.

## CSP directives that matter for Angular

Minimum production-minded set:

| Directive | Typical Angular + API host value |
|---|---|
| `default-src` | `'self'` |
| `script-src` | `'self' 'nonce-...'` (plus trusted CDNs if any) |
| `style-src` | `'self' 'nonce-...'` or hashes; some CSS-in-JS needs extra care |
| `img-src` | `'self' data: https:` (tighten to your CDN) |
| `font-src` | `'self'` + font CDN if used |
| `connect-src` | `'self'` + API origin + SignalR/WebSocket scheme |
| `frame-ancestors` | `'none'` or specific parents |
| `base-uri` | `'self'` |
| `object-src` | `'none'` |
| `form-action` | `'self'` |

`connect-src` must include every API and WebSocket endpoint the browser calls. Forgetting `wss:` breaks SignalR and looks like a random network error.

## Nonce middleware in ASP.NET Core for index.html

```csharp
public sealed class CspNonceMiddleware
{
    private readonly RequestDelegate _next;

    public CspNonceMiddleware(RequestDelegate next) => _next = next;

    public async Task Invoke(HttpContext context)
    {
        var nonceBytes = RandomNumberGenerator.GetBytes(16);
        var nonce = Convert.ToBase64String(nonceBytes);
        context.Items["CspNonce"] = nonce;

        context.Response.OnStarting(() =>
        {
            // Only set CSP on document responses you control; APIs return JSON without HTML nonces
            if (context.Response.ContentType?.StartsWith("text/html") == true
                || context.Request.Path == "/" )
            {
                var csp =
                    $"default-src 'self'; " +
                    $"script-src 'self' 'nonce-{nonce}'; " +
                    $"style-src 'self' 'nonce-{nonce}'; " +
                    $"img-src 'self' data: https:; " +
                    $"font-src 'self' data:; " +
                    $"connect-src 'self' https://api.example.com wss://api.example.com; " +
                    $"object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

                context.Response.Headers.ContentSecurityPolicy = csp;
            }
            return Task.CompletedTask;
        });

        await _next(context);
    }
}
```

Serving `index.html` with nonce replacement:

```csharp
app.MapGet("/", async (HttpContext ctx) =>
{
    var nonce = (string)ctx.Items["CspNonce"]!;
    var html = await File.ReadAllTextAsync("wwwroot/index.html");
    html = html.Replace("{{CSP_NONCE}}", nonce, StringComparison.Ordinal);
    ctx.Response.ContentType = "text/html; charset=utf-8";
    await ctx.Response.WriteAsync(html);
});
```

`index.html` template:

```html
<script src="main-XXXX.js" nonce="{{CSP_NONCE}}"></script>
```

Angular production builders emit external `.js` files — good. Your remaining problem is usually **inline** scripts (environment injection, third-party snippets) and **inline styles**.

For static hashed bundles on `'self'`, nonces on `<script src>` are optional in modern CSP (external scripts on allowed origins load), but nonces remain critical for any inline bootstrapping.

### Alternative: hash-based CSP

If HTML is fully static on a CDN, compute `sha256-...` hashes for known inline scripts at build time. Nonces fit ASP.NET Core-hosted index better; hashes fit immutable static hosting.

## Styles, Material/charts, and common breaks

Angular Material, some chart libraries, and CSS-in-JS may:

- Inject `<style>` tags without nonces  
- Use inline `style=""` attributes  
- Evaluate expressions (`unsafe-eval`) — especially older chart code  

Mitigations:

1. Prefer build pipelines that emit external CSS  
2. Use `'nonce-...'` on style tags if you control SSR/index  
3. As a temporary measure, `style-src 'self' 'unsafe-inline'` while you eliminate inline scripts first — scripts are the higher-value XSS vector  
4. Replace libraries that require `unsafe-eval` for admin screens that handle PHI  

Google Tag Manager and random marketing pixels are frequent CSP breakers on public sites — isolate marketing to the prerendered marketing host when possible ([SSR hosting](/blog/angular-ssr-hosted-aspnet-core) layout).

## Trusted Types bridge overview

Trusted Types (`require-trusted-types-for 'script'`) harden DOM XSS sinks. Angular’s path here evolves by version — treat Trusted Types as a **second phase** after nonce CSP is stable. Enable Report-Only Trusted Types, fix sinks, then enforce.

Do not enable Trusted Types enforcement the same day you first turn on CSP.

## Report-Only rollout strategy

1. Ship `Content-Security-Policy-Report-Only` with the desired policy  
2. Collect reports to an endpoint you own (or a vendor)  
3. Fix violations for 1–2 sprints  
4. Switch to enforcing `Content-Security-Policy`  
5. Keep reporting  

```csharp
context.Response.Headers["Content-Security-Policy-Report-Only"] = csp + "; report-uri /csp-report";
```

Prefer `report-to`/`Reporting-Endpoints` on modern stacks when you control the reporting infrastructure.

Do not ignore reports from old cached `index.html` during deploy — short-cache the HTML document ([App Service hosting](/blog/azure-app-service-aspnet-core)).

## Debugging blocked scripts without disabling CSP

Chrome DevTools → Console shows CSP violation details (blocked URI, directive).

Workflow:

1. Reproduce with enforcing policy on a staging slot  
2. Note directive (`script-src`, `connect-src`)  
3. Fix origin allow-list or remove inline  
4. Never “temporarily” add `unsafe-inline` on production PHI apps to silence errors  

`curl -I` checks header presence; it does not validate Angular boot — use a real browser.

## SSR/hydration interactions

If Node SSR emits HTML, it must use the **same** nonce the CSP header declares. Coordinate proxy and SSR process. Mismatched nonces → blank app after SSR.

## Checklist for go-live

1. Report-Only in staging for a full week of QA  
2. `connect-src` includes API + `wss:`  
3. No `unsafe-eval` unless exception documented  
4. Inline script inventory eliminated or nonced  
5. Marketing third-parties scoped or removed from app host  
6. CSP on HTML responses only (do not break raw API JSON clients)  
7. Document break-glass owners  
8. Pair with the rest of [security headers](/blog/aspnet-core-security-headers)  

## Common mistakes I still see

1. **CSP only on `/` but not on deep-link fallback `index.html`**  
2. **`unsafe-inline` left after “we’ll fix later”**  
3. **Forgetting WebSocket hosts in `connect-src`**  
4. **Enforcing Trusted Types on day one**  
5. **CDN index.html immutable forever** while CSP nonces change  

## Verification

- View-source shows matching nonce on boot scripts and CSP header  
- Console clean on login + main dashboard under enforcing policy  
- SignalR connects  
- Deliberate inline `<script>alert(1)</script>` in a test page blocked  
- Report-Only endpoint receives intentional violation from a test route  

## If an interviewer asks

How do you CSP an Angular app on ASP.NET Core?

**Strong answer:** Per-request nonce from the host, inject into CSP and HTML, avoid unsafe-inline for scripts, widen style carefully, Report-Only first, include connect-src for API and websockets. Security-headers baseline is not enough alone for SPAs.

**Related:** [Security headers](/blog/aspnet-core-security-headers) · [BFF YARP](/blog/bff-pattern-aspnet-core-angular-yarp) · [App Service](/blog/azure-app-service-aspnet-core) · [Standalone Angular](/blog/angular-standalone-components)


## Deep-link fallback must keep CSP

When using `MapFallbackToFile`, every SPA route still returns `index.html`. Ensure middleware runs so CSP + nonce apply to fallback responses, not only `/`.

```csharp
app.UseMiddleware<CspNonceMiddleware>();
// ...
app.MapFallback("/{**path}", async ctx => { /* read index, replace nonce, write */ });
```

Static file middleware for `*.js` should not strip needed headers; JS files typically do not need the HTML CSP nonce header to match, but document responses do.

## Separating API CORS from CSP

CORS is not CSP. CORS governs who may call your API from a browser origin. CSP governs what your pages may load/execute. Fix both; do not confuse them when debugging Angular ([CORS guide](/blog/cors-angular-aspnet-core)).

## Environment bootstrap without inline scripts

Instead of:

```html
<script>window.__env = { apiUrl: '...' }</script>
```

Prefer:

- Same-origin relative URLs  
- `assets/config.json` fetched at startup (allowed by `connect-src 'self'`)  
- Build-time file replacements per environment  

Inline env scripts force nonces or hashes on every deploy.

## Third-party scripts policy

Allow-list exact hosts (`https://js.stripe.com`) rather than `https:`. Review quarterly. Marketing tags belong on the marketing site, not the authenticated clinician shell.

## CSP and file uploads / blob URLs

If the UI previews images via `blob:` URLs, include `blob:` in `img-src` (and sometimes `media-src`). Tighten when the feature ships without previews.

## Rollout timeline example

| Day | Action |
|---|---|
| 1 | Report-Only policy deployed |
| 3 | Fix top violations (charts, fonts) |
| 10 | Re-test Material screens |
| 14 | Enforce on staging |
| 21 | Enforce on production with reporting still on |

## Extra verification

- Lighthouse does not require CSP, but DevTools Security panel should show CSP present  
- Automated browser test asserts `document` CSP via meta or headers  
- Attempted XSS payload in a rich text field does not execute script  


## Example final CSP string (illustrative)

```text
default-src 'self';
script-src 'self' 'nonce-RAND';
style-src 'self' 'nonce-RAND';
img-src 'self' data: https://cdn.example.com;
font-src 'self';
connect-src 'self' https://api.example.com wss://api.example.com;
frame-ancestors 'none';
base-uri 'self';
object-src 'none';
form-action 'self'
```

Replace CDNs with your real hosts. Remove `https://cdn.example.com` if unused.

## Angular builder notes

With application builder / esbuild pipelines, prefer configurations that avoid inline runtime. If a plugin injects inline scripts, fix the plugin or hash that exact inline in CI as a build step.

## Incident response

If a production CSP block stops login:

1. Do not disable CSP globally as first reaction  
2. Use Report-Only on the slot or widen a single directive with a ticket  
3. Fix root cause (new third-party, missing connect-src)  
4. Re-enforce  

Document this break-glass in the runbook next to App Service deploy notes.


## Meta tag vs header

Prefer HTTP headers for CSP from ASP.NET Core. `<meta http-equiv="Content-Security-Policy">` cannot fully replace framing protections and is easier to miss on some responses. If both exist, keep them consistent.

## Service worker considerations

If you use Angular service workers, review cache strategies so an old `index.html` without the right nonce strategy does not linger. Prefer network-first for the document.


## Nonce lifetime and CDN caching of HTML

Never cache `index.html` for long at the CDN if it embeds a nonce that must match a per-request CSP header. Either:

- Bypass CDN for the document and cache only hashed JS/CSS, or  
- Use hash-based CSP for fully static HTML without per-request nonces  

ASP.NET Core-hosted documents with nonces should send `Cache-Control: no-store` (or very short revalidation) for HTML.

## Pairing with BFF

When YARP/BFF serves the SPA ([BFF pattern](/blog/bff-pattern-aspnet-core-angular-yarp)), put CSP middleware on the BFF host that returns HTML — not only on the API project that no longer serves `wwwroot`.

---
title: "Security Headers in ASP.NET Core: HSTS, CSP, Clickjacking"
description: "Configure production HTTP security headers in ASP.NET Core: X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security (HSTS), Content-Security-Policy (CSP), and Permissions-Policy."
date: "2026-09-18"
updated: "2026-10-03"
category: "security"
tags: ["ASP.NET Core", "Security", "HTTPS", "HSTS", "CSP", "Architecture"]
related:
  - aspnet-core-forwarded-headers
  - aspnet-core-middleware-order
  - content-security-policy-angular-aspnet-core
  - azure-app-service-aspnet-core
faq:
  - q: "Which security headers must every ASP.NET Core application send?"
    a: "Every ASP.NET Core API and web app should send: (1) X-Content-Type-Options: nosniff, (2) X-Frame-Options: DENY (or frame-ancestors 'none'), (3) Referrer-Policy: strict-origin-when-cross-origin, (4) Strict-Transport-Security (HSTS) with max-age, (5) Permissions-Policy, and (6) a robust Content-Security-Policy (CSP)."
  - q: "Why is enabling HSTS on localhost or initial deployment dangerous?"
    a: "HSTS instructs browsers to cache an irreversible policy requiring HTTPS for the domain for up to a year. If applied on localhost or before SSL certificates and proxy routing are fully verified in production, developers and users will be locked out of the application with no bypass option."
  - q: "What is the difference between X-Frame-Options and CSP frame-ancestors?"
    a: "X-Frame-Options (DENY/SAMEORIGIN) is a legacy header supported by older browsers. CSP frame-ancestors is the modern W3C standard that allows specifying multiple trusted domains that may iframe your application. Modern apps should send both for backward compatibility."
  - q: "Does UseHttpsRedirection() eliminate the need for HSTS?"
    a: "No. UseHttpsRedirection() issues an HTTP 307/308 redirect when a user initially visits via HTTP, leaving that first request vulnerable to man-in-the-middle SSL stripping attacks. HSTS forces the browser to initiate the connection over HTTPS directly without ever sending an initial HTTP request."
---

**HTTP security headers in ASP.NET Core** instruct web browsers on how to handle content rendering, cross-origin data leakage, MIME sniffing, and framing. Without explicit security headers, modern browsers default to permissive behaviors that expose users to clickjacking, cross-site scripting (XSS), and protocol downgrade attacks.

```text
Browser Requests Page ──► ASP.NET Core Pipeline
                               │
                               ▼
Security Headers Middleware:
  ├── Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  ├── X-Content-Type-Options: nosniff
  ├── X-Frame-Options: DENY
  ├── Referrer-Policy: strict-origin-when-cross-origin
  ├── Permissions-Policy: camera=(), microphone=(), geolocation=()
  └── Content-Security-Policy: default-src 'self'; script-src 'self'; ...
                               │
                               ▼
Browser Enforces Sandbox Rules (Rejects Clickjacking iframes & MIME execution)
```

**New to this** → start with [The essential security headers table](#the-essential-security-headers). **CSP deep dive** → [CSP for Angular & ASP.NET Core](/blog/content-security-policy-angular-aspnet-core). **Reverse proxy setup** → [Forwarded headers guide](/blog/aspnet-core-forwarded-headers). **Interview prep** → [If an interviewer asks](#if-an-interviewer-asks).

## Real-world analogy

Security headers act like **handling instructions stamped on a diplomatic parcel**:
- `X-Content-Type-Options: nosniff`: "Do not guess what is inside this parcel based on its smell; treat text strictly as text."
- `X-Frame-Options: DENY`: "Do not display this letter inside another vendor's display cabinet (clickjacking)."
- `Referrer-Policy`: "When forwarding this package, do not leak our internal office room numbers (query strings) on the shipping label."
- `Strict-Transport-Security (HSTS)`: "Only deliver packages via armored courier (HTTPS). Reject any standard bicycle courier (HTTP) for the next 365 days."

## The essential security headers

| Header Name | Recommended Value | Threat Prevented |
|---|---|---|
| **`Strict-Transport-Security`** | `max-age=31536000; includeSubDomains; preload` | Man-in-the-Middle (MitM) SSL stripping and protocol downgrade attacks. |
| **`X-Content-Type-Options`** | `nosniff` | MIME-type sniffing where a browser executes uploaded `.txt` or `.jpg` as JavaScript. |
| **`X-Frame-Options`** | `DENY` or `SAMEORIGIN` | Clickjacking attacks where malicious sites render your UI inside transparent iframes. |
| **`Referrer-Policy`** | `strict-origin-when-cross-origin` | Sensitive URL paths, tokens, or IDs leaking to external third-party origins. |
| **`Permissions-Policy`** | `camera=(), microphone=(), geolocation=()` | Unauthorized browser feature access by embedded third-party scripts. |
| **`Content-Security-Policy`** | `default-src 'self'; img-src 'self' data:;` | Cross-Site Scripting (XSS), data injection, and malicious script execution. |

## Production Security Headers Middleware

You can implement security headers directly via a custom middleware or by using the industry-standard `NetEscapades.AspNetCore.SecurityHeaders` package.

### 1. Custom Security Headers Middleware

```csharp
// Infrastructure/Security/SecurityHeadersMiddleware.cs
using Microsoft.AspNetCore.Http;

public sealed class SecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IHostEnvironment _env;

    public SecurityHeadersMiddleware(RequestDelegate next, IHostEnvironment env)
    {
        _next = next;
        _env = env;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(() =>
        {
            var headers = context.Response.Headers;

            // 1. Prevent MIME-sniffing
            headers["X-Content-Type-Options"] = "nosniff";

            // 2. Prevent Clickjacking (framing)
            headers["X-Frame-Options"] = "DENY";

            // 3. Control referrer leakage
            headers["Referrer-Policy"] = "strict-origin-when-cross-origin";

            // 4. Disable unneeded browser hardware features
            headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()";

            // 5. Cross-Origin Embedder and Opener Policies
            headers["X-XSS-Protection"] = "0"; // Disabled in favor of CSP
            headers["Cross-Origin-Opener-Policy"] = "same-origin";

            // 6. Content Security Policy (Basic API baseline)
            if (!headers.ContainsKey("Content-Security-Policy"))
            {
                headers["Content-Security-Policy"] = 
                    "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self';";
            }

            // 7. Strict-Transport-Security (Only in production over HTTPS)
            if (_env.IsProduction() && context.Request.IsHttps)
            {
                headers["Strict-Transport-Security"] = 
                    "max-age=31536000; includeSubDomains; preload";
            }

            return Task.CompletedTask;
        });

        await _next(context);
    }
}
```

### 2. Program.cs Registration and HSTS Configuration

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

// Configure built-in ASP.NET Core HSTS options
builder.Services.AddHsts(options =>
{
    options.Preload = true;
    options.IncludeSubDomains = true;
    options.MaxAge = TimeSpan.FromDays(365);
});

var app = builder.Build();

// 1. Forwarded headers must run before security headers if behind Nginx/ALB/Cloudflare
app.UseForwardedHeaders();

// 2. Apply security headers early in the pipeline
app.UseMiddleware<SecurityHeadersMiddleware>();

if (app.Environment.IsProduction())
{
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
```

## Content Security Policy (CSP) for Angular and ASP.NET Core

When serving an Angular single-page application hosted with ASP.NET Core, configure your CSP to support modern Angular features without using insecure `'unsafe-inline'` or `'unsafe-eval'`:

```csharp
// Content-Security-Policy for Angular SPA
headers["Content-Security-Policy"] = string.Join("; ",
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // 'unsafe-inline' acceptable for critical CSS
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https://blob.storage.azure.com",
    "connect-src 'self' https://api.muhammadshahid.dev wss://api.muhammadshahid.dev", // WebSockets / APIs
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'"
);
```

## Common mistakes and pitfalls

- **Enabling HSTS on localhost during development**: If `UseHsts()` executes in development, your browser will refuse to connect to `http://localhost:5000`, breaking local development and debugging until you manually purge browser HSTS domains.
- **Copying strict CSP policies without testing**: Applying a strict CSP copied from a blog post without auditing all script bundles, Google Analytics tags, or CDN fonts will result in blank white screens in production.
- **Setting headers after response streaming has started**: Mutating `context.Response.Headers` inside a controller action or streaming endpoint throws `InvalidOperationException`. Always attach security headers via middleware using `context.Response.OnStarting()`.
- **Forgetting `UseForwardedHeaders()` behind reverse proxies**: If running behind AWS ALB, Cloudflare, or Azure App Service, Kestrel will see requests coming in over HTTP (`X-Forwarded-Proto`). Without `UseForwardedHeaders()`, `context.Request.IsHttps` returns `false`, skipping HSTS headers.

## If an interviewer asks

**30-second answer:** HTTP security headers configure browser sandbox defenses. In ASP.NET Core, we enforce `X-Content-Type-Options: nosniff` (prevents MIME execution), `X-Frame-Options: DENY` (prevents clickjacking), `Referrer-Policy: strict-origin-when-cross-origin` (prevents URL token leakage), and `Strict-Transport-Security` (forces HTTPS).

**Strong answer:** Security headers represent defense-in-depth at the HTTP protocol layer. We register a dedicated security headers middleware at the top of the ASP.NET Core pipeline (right after `UseForwardedHeaders`). In production, we configure HSTS with a 1-year `max-age` and `includeSubDomains`, while keeping HSTS disabled in development to avoid breaking localhost ports. For single-page apps, we complement this with a tuned `Content-Security-Policy` and `Permissions-Policy` to lock down script execution, iframe framing (`frame-ancestors 'none'`), and device hardware access.

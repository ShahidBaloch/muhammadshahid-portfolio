---
title: "BFF Pattern with ASP.NET Core, Angular, and YARP"
description: "Backend-for-Frontend BFF pattern with ASP.NET Core, Angular, and YARP — cookie sessions, server-side tokens, CSRF defense, and when to skip SPA-held JWTs."
date: "2026-08-15"
category: "authentication"
tags: ["ASP.NET Core", "Angular", "YARP", "Security", "JWT"]
faq:
  - q: "What is the BFF pattern for Angular and ASP.NET Core?"
    a: "A Backend-for-Frontend keeps tokens on the server. Angular sends same-origin cookies to the BFF; YARP or the BFF attaches bearer tokens to APIs."
  - q: "Should every Angular SPA use a BFF?"
    a: "No. Use it when the SPA is internet-facing and XSS is in the threat model. An internal ten-user tool on a VPN can keep SPA JWTs if refresh is done honestly."
  - q: "Does a BFF replace JWT refresh in the SPA?"
    a: "Yes for the browser. The SPA should not store or rotate refresh tokens. Session and CSRF live on the BFF. Duende vs custom YARP is a separate buy-vs-build page."
---

**A Backend-for-Frontend (BFF)** is a same-origin ASP.NET Core gateway that holds tokens server-side, sets an httpOnly session cookie for Angular, and attaches bearer tokens to downstream APIs via YARP or proxy middleware.

```text
Angular ──cookie──► BFF (session + tokens in memory/store)
                         │
                    YARP proxy + Bearer
                         │
                         ▼
                   Resource APIs (JWT validation)
```

Think of the BFF as a **trusted concierge**: the guest (browser) never holds the vault key (refresh/access tokens). The concierge opens doors to backend services on your behalf. XSS can still misbehave in the UI — but stealing tokens from JavaScript is off the table.

**New to this** → stay here. **Duende vs custom YARP** → [Duende BFF vs YARP](/blog/duende-bff-vs-yarp-custom-bff). **SPA JWT interceptors** → [JWT interceptors](/blog/angular-jwt-interceptors). **Interview prep** → [If an interviewer asks](#if-an-interviewer-asks).

## What "BFF" means in this stack

Three processes (they can share a host in small systems):

1. **Angular** — UI only. No refresh token in JavaScript. API calls go to the **same origin** as the BFF (`/api/...`) or a same-site sibling.
2. **BFF** — ASP.NET Core app that owns the browser session (cookie). It talks to the identity server or token endpoint. It stores server-side session + tokens. It **proxies** UI calls to business APIs.
3. **Resource APIs** — ASP.NET Core services that still validate JWTs (or opaque introspection). They never see the browser cookie.

YARP (Yet Another Reverse Proxy) is a solid way to implement (2)→(3) without writing a custom `HttpClient` facade for every route. You can also use YARP only for API paths and keep MVC endpoints for login/logout.

## Why teams search this in 2026

Browser platforms keep tightening third-party cookies. SPAs that used silent iframe renewals against an IdP are already fragile. A first-party BFF cookie (`SameSite=Lax` or `Strict`, `Secure`, `HttpOnly`) is a model browsers still understand.

The other driver is honesty: if your Angular app can read the refresh token, so can a successful XSS payload. Moving tokens server-side does not remove XSS — it removes **token theft** as the default prize. You still sanitize, still Content-Security-Policy, still avoid `innerHTML` from API fields.

## Cookie session vs JWT in the SPA

| Concern | SPA-held JWT | BFF cookie + server tokens |
| --- | --- | --- |
| XSS steals refresh token | Yes, if JS can read it | No (httpOnly cookie; tokens on server) |
| CSRF | Low if you use Bearer header only | Must defend (SameSite + antiforgery or custom header) |
| CORS | Required for cross-origin API | Often avoided: SPA and BFF same site |
| Mobile native app | Natural (Bearer) | BFF is for browsers; native still uses tokens |
| Ops complexity | Lower | Extra hop, session store, proxy rules |

Same-site hosting is the unglamorous win. `https://app.example.com` (Angular) and `https://app.example.com/api` (YARP) beat `localhost:4200` talking to `localhost:5001` with `AllowCredentials` and a wildcard origin you forgot to remove.

## A minimal YARP BFF shape

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "__Host-bff";
        options.Cookie.HttpOnly = true;
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.Path = "/";
        options.SlidingExpiration = true;
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
    });

builder.Services.AddAuthorization();
builder.Services.AddAntiforgery();

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/bff/user", (ClaimsPrincipal user) =>
    user.Identity?.IsAuthenticated == true
        ? Results.Ok(new { name = user.Identity.Name })
        : Results.Unauthorized())
    .RequireAuthorization();

app.MapReverseProxy(proxy =>
{
    proxy.Use(async (context, next) =>
    {
        var token = await context.GetTokenAsync("access_token");
        if (!string.IsNullOrEmpty(token))
        {
            context.Request.Headers.Authorization = $"Bearer {token}";
        }

        await next();
    });
}).RequireAuthorization();

app.Run();
```

`GetTokenAsync("access_token")` assumes you saved tokens in the authentication properties at login (OIDC handler or a custom ticket). The important idea is not this exact API: **the browser never sees the bearer token**. YARP forwards it.

YARP config sketch:

```json
{
  "ReverseProxy": {
    "Routes": {
      "claims-api": {
        "ClusterId": "claims",
        "Match": { "Path": "/api/claims/{**catch-all}" }
      }
    },
    "Clusters": {
      "claims": {
        "Destinations": {
          "d1": { "Address": "https://claims-api.internal/" }
        }
      }
    }
  }
}
```

Keep internal APIs off the public internet when you can. The BFF is the public edge.

## Angular changes (this is the point)

- `environment.apiUrl` becomes `''` or `'/api'` on the same origin.
- Drop the Bearer interceptor for cookie-backed calls. Use `withCredentials: true` only if the SPA and BFF are actually cross-site — prefer they are not.
- Auth "am I logged in?" becomes `GET /bff/user` (or a gateway userinfo), not decoding a JWT in the client.
- Logout is `POST /bff/logout` that expires the cookie **and** revokes server-side tokens.

Guards stay. They check BFF session, not `localStorage`.

You still need CSRF protection because cookies are sent automatically. Practical pattern I use:

1. `SameSite=Lax` (blocks most cross-site POSTs)
2. Require a custom header on mutations (`X-CSRF: 1`) that Angular always sets — simple extra origin check
3. Antiforgery cookie + header for form posts if you expose MVC

Do not skip (2) or (3) because "we have SameSite." Defense in depth is cheaper than an incident report.

## Login: authorization code stays on the BFF

The BFF runs the OIDC authorization code + PKCE flow (or a custom cookie login against ASP.NET Identity). The Angular app redirects to `/bff/login`. Tokens land in the server session.

If you currently use [MapIdentityApi](/blog/mapidentityapi-opaque-token-vs-jwt) from the SPA, a BFF is a different product shape: the SPA should not call `/login` with a password against a public API if you are trying to get secrets out of JavaScript. Password posts go to the BFF origin.

## Duende BFF vs custom YARP

The architecture is this page. The **buy vs build** decision — license, CSRF conventions, when custom YARP is honest — is [Duende BFF vs custom YARP](/blog/duende-bff-vs-yarp-custom-bff). Pick with the [identity decision](/blog/identityserver-vs-aspnet-identity), not from a Twitter thread.

## Failure modes I have actually debugged

**Token in YARP logs.** Access tokens in request dumps will end up in a support ticket. Redact `Authorization`.

**SPA still calling the resource API directly.** One leftover `HttpClient` base URL in an Angular service bypasses the BFF and brings CORS back. Grep for the old API host before you declare victory.

**Cookie name without `__Host-` on a shared parent domain.** Then a sibling app can try to confuse sessions. Use `__Host-` when you can (requires `Secure`, no `Domain` attribute, `Path=/`).

**WebSockets / SignalR.** Proxying hubs through YARP needs sticky sessions or a backplane, and you must attach the token on the negotiate request. Do not assume the HTTP cookie path magically authorizes the WebSocket. See also [SignalR + JWT](/blog/signalr-aspnet-core-realtime).

**Server-side session store.** In-memory tickets die on swap in Azure App Service. Use distributed cache or a proper ticket store before the second instance.

## When I still use SPA JWTs

- Native mobile clients
- Machine-to-machine APIs
- Tiny internal Angular tools where XSS blast radius is accepted in writing
- Local demos — not production healthcare or payouts

Hybrid is normal: BFF for the clinician portal, client credentials for a nightly EDI job, JWT validation on every resource API.

## If an interviewer asks

**"What problem does a BFF solve that httpOnly refresh cookies do not?"**

**Strong answer:** HttpOnly cookies hide refresh from JS but the SPA still holds and attaches access tokens. BFF moves **all** tokens server-side — the browser only has a session cookie. Stronger against XSS token theft; adds CSRF defense and ops complexity.

**"Does a BFF replace JWT validation on resource APIs?"**

**Strong answer:** No. Resource APIs still validate JWTs (or introspect). The BFF attaches bearer tokens at the edge. APIs never see the browser cookie — they see standard Authorization headers.

**"When would you skip a BFF?"**

**Strong answer:** Internal VPN tools with accepted XSS risk, native mobile clients (they use bearer directly), machine-to-machine APIs, or early MVPs where CORS + honest refresh is enough until threat model demands more.

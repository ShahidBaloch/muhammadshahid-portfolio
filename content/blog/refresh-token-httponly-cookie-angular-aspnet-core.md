---
title: "Store the Refresh Token in an HttpOnly Cookie (Angular + ASP.NET Core)"
description: "HttpOnly cookie vs localStorage vs memory vs BFF for refresh tokens: CSRF, CORS credentials, cookie flags, and the Angular withCredentials contract I use with ASP.NET Core."
date: "2026-08-16"
category: "authentication"
tags: ["ASP.NET Core", "Angular", "JWT", "Security", "CORS"]
---

People search “store refresh token httpOnly cookie Angular ASP.NET Core” when they have already been burned by `localStorage`. The cookie is not automatically safer. It **moves** the problem: JavaScript cannot read the token, but the browser **will send it** on matching requests — which is CSRF if you are sloppy, and a CORS mess if `AllowCredentials` meets a wildcard origin.

This is a **comparison plus the cookie contract**. Token rotation and reuse detection are [the API rotation article](/blog/aspnet-core-jwt-refresh-token-rotation). Concurrent 401s are [the interceptor queue](/blog/angular-interceptor-401-refresh-queue). Taking **all** tokens off the SPA is [BFF + YARP](/blog/bff-pattern-aspnet-core-angular-yarp).

Nothing here is a security certification. Cookie flags and CORS are easy to copy wrong.

## Four places a refresh token can live

| Place | XSS can steal refresh? | CSRF risk | CORS pain | My default |
| --- | --- | --- | --- | --- |
| `localStorage` / `sessionStorage` | Yes | Low (you send it in a header/body you control) | Lower | Avoid on internet-facing apps |
| Memory only (JS field) | Only while XSS runs in that tab | Low | Lower | Fine for access token; refresh dies on reload unless you have another store |
| **HttpOnly cookie** (this article) | No | **Yes — must mitigate** | **Credentials + exact origins** | Refresh for first-party SPA when you are not ready for a BFF |
| BFF session cookie | No | Yes — BFF must mitigate | Often avoided (same site) | Public SPAs, stronger threat model |

Access tokens stay **short-lived** and I still prefer them in **memory** (Authorization header). Putting the **access** JWT in a cookie for every API call is a different design (CSRF on every POST). Do not mix “httpOnly refresh” with “cookie on all `/api` routes” unless you meant to build a BFF.

## What I set on the refresh cookie (ASP.NET Core)

Login and refresh endpoints **set** the cookie. Angular never reads it.

```csharp
public static class RefreshCookie
{
    public const string Name = "__Host-refresh";

    public static CookieOptions ProductionOptions() => new()
    {
        HttpOnly = true,
        Secure = true,
        SameSite = SameSiteMode.Lax, // Strict if SPA and API are same-site and you tested navigation
        Path = "/api/auth",          // only sent to auth routes, not every static file
        IsEssential = true,
        Extensions = { { "Partitioned", "" } }, // only if you understand CHIPS; omit if unsure
    };
}
```

`__Host-` prefix requires `Secure`, no `Domain` attribute, and `Path=/` in the cookie spec — if you set `Path=/api/auth`, **do not** use `__Host-` (the prefix demands `Path=/`). Pick one:

- `__Host-refresh` + `Path=/` + you accept the cookie on all paths (CSRF surface is wider; mitigate with header checks on **auth** endpoints)
- Name without `__Host-` + `Path=/api/auth` so the cookie is not sent to `/api/claims`

I prefer the **narrow path** when the API host is shared. I prefer `__Host-` when the BFF/API is dedicated and I already CSRF-protect mutations.

Rotate the cookie value on every successful refresh (same as body rotation). Clear it on logout (`Expires` in the past). Hash the value in SQL; the cookie holds the **raw** token once, like a password.

Do not log `Set-Cookie` headers in Application Insights.

## Angular: withCredentials and who calls refresh

```typescript
this.http.post<RefreshResponse>(
  `${environment.apiUrl}/api/auth/refresh`,
  {},
  { withCredentials: true },
);
```

Every call that must **send** the cookie needs `withCredentials: true`. If only the refresh interceptor sets it, and login does not, the cookie never lands. If every API call sets it but the cookie `Path` is `/api/auth`, you are fine — extra flag, cookie not sent to `/api/orders`.

Access token still goes in `Authorization`. The cookie is **not** a bearer token for business APIs.

## CORS: this is where teams explode

Cross-origin SPA (`https://app.example.com`) + API (`https://api.example.com`) + cookie:

- API must `AllowCredentials()`
- API must `WithOrigins("https://app.example.com")` — **no `*`**
- Cookie `SameSite=None; Secure` if it is truly cross-site (Lax will **not** send on that cross-site XHR in the way beginners expect)

Cross-site cookies are the painful path. Same-site (`app.example.com` + `app.example.com/api`) is easier: Lax often works; CORS may disappear if you proxy.

If Chrome shows a CORS error after you added cookies, read [CORS between Angular and ASP.NET Core](/blog/cors-angular-aspnet-core). Many “CORS” failures are **401 without ACAO headers** because middleware order died first. That is a sibling diagnosis, not a reason to put the token back in `localStorage`.

`AllowAnyOrigin()` + `AllowCredentials()` throws `InvalidOperationException` in ASP.NET Core. That throw is the framework saving you. Do not catch it and “make CORS work.”

## CSRF on the refresh endpoint

The cookie will be sent to `POST /api/auth/refresh` if the attacker can make the victim’s browser call that URL while logged in.

Mitigations I stack:

1. Narrow `Path` so random site XHR to `/api/claims` does not include the refresh cookie (they still need a refresh URL CSRF).
2. Require a custom header `X-Requested-With: Angular` (or antiforgery) on refresh — simple requests from a form on `evil.example` cannot set that header.
3. `SameSite=Lax` or `Strict` when same-site.
4. Rotate + [reuse detection](/blog/aspnet-core-jwt-refresh-token-rotation) so a stolen cookie used after the real tab refreshed dies.

SameSite is not a full CSRF story for every browser and every cross-site case. The custom header is cheap. Use it.

## When I refuse the cookie and pick BFF instead

- Multiple APIs on different hosts all need the refresh cookie (you will spread `Domain=` and regret it)
- The SPA is a public internet app with a serious XSS budget and you can afford a gateway
- The team cannot get CORS+credentials right in three environments

Cookie-for-refresh is a **middle** design: better than `localStorage` for XSS theft of refresh, worse than BFF for “JavaScript never sees token plumbing.”

## Checklist before you ship

- [ ] Access JWT not in the refresh cookie
- [ ] Refresh cookie HttpOnly + Secure
- [ ] Path or `__Host-` chosen on purpose
- [ ] Logout clears the cookie
- [ ] Angular `withCredentials` on login, refresh, logout
- [ ] CORS origins explicit if cross-site
- [ ] Refresh POST requires a custom header or antiforgery
- [ ] Rotation + hashed storage on the server
- [ ] Interceptor [queues 401s](/blog/angular-interceptor-401-refresh-queue) so two tabs / six widgets do not rotate twice

---

If you are moving an Angular SPA off `localStorage` refresh tokens onto ASP.NET Core cookies (or deciding that a BFF is cheaper), [contact me](/contact). The cookie flags and CORS matrix are where copy-paste tutorials go to die.

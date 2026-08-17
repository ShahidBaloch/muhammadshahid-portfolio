---
title: "Duende BFF vs Custom YARP BFF for Angular and ASP.NET Core"
description: "When I pay for Duende BFF versus owning a YARP cookie gateway: session, CSRF, OIDC login, licensing, and the failure modes that are not in the architecture diagram."
date: "2026-08-17"
category: "authentication"
tags: ["YARP", "JWT", "Angular", "ASP.NET Core", "Security"]
---

The [BFF + YARP architecture post](/blog/bff-pattern-aspnet-core-angular-yarp) is the shape: Angular talks same-origin cookies; the gateway attaches bearer tokens to APIs. This page is only the **buy vs build** decision for that shape — Duende’s BFF package versus a custom YARP host you maintain.

I have shipped both. They solve the same XSS problem (tokens not in JavaScript). They fail in different ways at 2 a.m.

This is not a vendor ranking and not legal advice. Duende licensing changes; read their current terms for your company. I am not suggesting you copy a commercial product to avoid a fee.

## What you are actually choosing

Both options need:

1. A **browser session** (httpOnly cookie)
2. **OIDC or cookie login** that deposits access/refresh tokens **on the server**
3. A **proxy** that adds `Authorization` to downstream APIs
4. **CSRF** defense because cookies auto-send
5. A **session store** that survives App Service swap

Duende BFF is a supported protocol for (1)–(4) aimed at SPAs, often sitting in front of YARP or its own proxy helpers. Custom YARP is you writing (1)–(4) with cookie auth + `AddReverseProxy`.

The architecture article already shows a YARP sketch. Do not clone it here. The question is **who owns the session protocol**.

## Side-by-side (operations, not slogans)

| Concern | Duende BFF | Custom YARP BFF |
| --- | --- | --- |
| Session + anti-forgery conventions | Documented BFF endpoints (`/bff/login`, user, logout) | You invent names and forget one in Angular |
| OIDC integration | First-class with Duende IdentityServer (and other OIDC) | Cookie handler + `SaveTokens` + your login path |
| CSRF | Package conventions (header requirements) | SameSite + custom header + antiforgery you must test |
| Proxy | Can sit with YARP; you still configure clusters | YARP is the product; middleware attaches tokens |
| License / support | Commercial relationship | Your on-call |
| Fit with ASP.NET Identity only | Possible, more glue | Natural if you already issue your own tokens |
| Fit with Duende IdentityServer already paid | Default | You would be paying and then ignoring the BFF package |

If the client **already pays for Duende** and the SPA is internet-facing, I start with Duende BFF unless there is a concrete reason not to. Rebuilding session middleware to “stay independent” is not independence. It is a second auth stack.

If the client **will not** take a Duende dependency, and identity is ASP.NET Identity + JWTs we issue, I build a thin YARP BFF and I budget tests for cookie flags. I do not pretend it is free.

## When Duende BFF is the shorter path

- Multiple first-party Angular apps, one login, IdentityServer already in the diagram
- Security review wants a **named** BFF protocol, not a wiki page titled “our gateway”
- You need login/logout/userinfo endpoints that Angular developers can grep in docs
- Token server-side storage and refresh are in-package instead of a custom ticket store you will get wrong on the second instance

The win is not “Duende is more secure by magic.” The win is **fewer original cookie bugs**. Most BFF incidents I have seen were `SameSite`, `__Host-` vs `Domain=`, or a leftover Angular `apiUrl` pointing at the resource API.

## When a custom YARP BFF is the honest path

- No Duende in the account, and nobody will approve it this quarter
- You already have a YARP gateway for path-based routing (claims API, catalog API, ops API)
- Login is **not** OIDC yet — Identity cookie on the BFF, APIs still validate JWTs you mint at login
- Native mobile apps will **never** use this BFF (they keep bearer tokens). The gateway is browser-only; do not force phones through it

Custom is also right when the “BFF” is really an **API gateway** that happens to attach tokens, and the SPA is hosted from the same origin. Keep the cookie surface small: login, logout, user, proxy. Do not put business MVC in the BFF “because it is already ASP.NET Core.”

## The license conversation I actually have

I put two numbers on a slide: estimated **engineering days** to own cookie + CSRF + session store + on-call, versus **Duende list price** for this product. I do not invent a moral winner.

Teams that “cannot afford Duende” sometimes spend more than the license on a custom BFF that still has no CSRF tests. Teams that “must use Duende” sometimes have one SPA and would have been fine with [httpOnly refresh cookies](/blog/refresh-token-httponly-cookie-angular-aspnet-core) without a full BFF.

If the threat model is XSS on a public clinic portal, **some** BFF (or equivalent) is the point. Which package is a procurement decision sitting on top of that.

## Angular contract (both options)

The SPA should look the same:

- Same-origin `/api/...` or `/bff/...`
- No Bearer interceptor for cookie-backed calls
- `GET` user endpoint for guards
- `POST` logout
- CSRF header on mutations

If you switch from custom YARP to Duende BFF later, **keep this contract** and only change the path prefix. That is cheaper than teaching every feature module a new auth story.

Guards still belong in Angular. They check session, not `localStorage`. See [auth guards](/blog/angular-auth-guard-aspnet-core).

## Failure modes that are product-specific

**Duende BFF**

- Angular still calls the resource API host (CORS returns, you think auth is “flaky”)
- License / package version skew with IdentityServer
- Assuming BFF removes XSS. It removes **token theft** as the default prize. You still need CSP.

**Custom YARP**

- `GetTokenAsync("access_token")` is null because login never called `SaveTokens`
- In-memory auth ticket: first scale-out logs everyone out
- YARP logs the `Authorization` header into App Insights
- CSRF only “SameSite=Lax” on a site that also has a GET that mutates

**Both**

- SignalR negotiate bypasses the proxy ([JWT over WebSocket](/blog/signalr-aspnet-core-realtime) is a different attach)
- Refresh token reuse if you still rotate in a world with two tabs and no server session ([rotation](/blog/aspnet-core-jwt-refresh-token-rotation))

## A decision I write in the architecture doc

I will not leave this as “we’ll see.” One paragraph:

> Browser apps use a BFF. Tokens never enter JavaScript. We use **Duende BFF** because we already operate IdentityServer and will not staff a custom session protocol. Resource APIs stay JWT. Mobile uses bearer directly. EDI jobs use client credentials. CSRF is required on cookie mutations.

Or:

> Browser apps use a **custom YARP BFF** on the same site as Angular. Cookie `__Host-bff`, antiforgery header `X-CSRF`. We do not take a Duende BFF dependency. Identity is ASP.NET Identity. Session store is distributed cache before the second instance.

If you cannot write one of those paragraphs, you do not have a BFF. You have a backlog item named BFF.

## When I still skip BFF entirely

Internal admin on VPN, ten users, accepted XSS risk in writing — SPA JWT is fine. Machine clients never needed a BFF. [MapIdentityApi](/blog/mapidentityapi-opaque-token-vs-jwt) from a first-party SPA is a different product; do not wrap it in YARP as theatre.

---

If you need a written choice between Duende BFF and a YARP cookie gateway against your real hosts (not a slide), [contact me](/contact). Bring the identity product you already pay for; the BFF should follow that, not fight it.

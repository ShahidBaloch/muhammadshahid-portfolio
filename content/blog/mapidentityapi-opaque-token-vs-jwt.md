---
title: "MapIdentityApi Opaque Tokens vs JWT in ASP.NET Core — Pick Deliberately"
description: "ASP.NET Core Identity’s MapIdentityApi issues opaque access tokens by default — not JWTs. When that is enough, when you still need JWT bearer auth for Angular, and how to stop mixing the two by accident."
date: "2026-08-15"
category: "identity"
tags: ["ASP.NET Core", "ASP.NET Core Identity", "JWT", "Security", "Angular"]
---

A recurring freelance rescue: the team enabled `MapIdentityApi()`, Angular stored `accessToken` from `/login`, and then `[Authorize]` on a JWT bearer pipeline rejected every call. Swagger looked fine. The SPA looked broken. The missing sentence in too many tutorials is this: **Identity’s API endpoints issue opaque tokens by default. They are not JWTs.**

This is a decision article. It is not “JWT is dead” and it is not “never use MapIdentityApi.”

- Broader issuer choice: [IdentityServer vs ASP.NET Identity](/blog/identityserver-vs-aspnet-identity)
- If you truly need JWTs: [JWT checklist](/blog/aspnet-core-jwt-auth) and [refresh rotation](/blog/aspnet-core-jwt-refresh-token-rotation)

Behavior described here follows ASP.NET Core Identity’s API endpoints as commonly used in .NET 8+. Always verify against the version on your machine — templates change.

## What MapIdentityApi is for

`MapIdentityApi<TUser>()` exposes Identity over HTTP: register, login, refresh, and related account endpoints. It is aimed at **first-party SPAs and mobile apps** talking to **this** app’s Identity store.

What you get quickly:

- Cookie or bearer-style **opaque** access tokens tied to Identity’s token store
- Refresh via Identity’s token endpoints
- No signing-key ceremony, no `iss`/`aud` design session on day one

What you do not get:

- A JWT that a second API can validate with a signing key alone
- A portable token for a microservices farm
- OIDC discovery for third-party clients

If your architecture is **one Angular app + one ASP.NET Core host that owns users**, this can be the whole auth story. If your architecture is **Angular + three APIs + a future mobile client that must call API B without sharing the cookie jar**, you are in JWT or OIDC territory.

## Opaque token vs JWT (the confusion)

**JWT (self-contained):** the resource server validates signature, issuer, audience, lifetime. No database hit required for the happy path.

**Opaque token:** a random identifier. The resource server must **ask Identity** (or introspection) “is this still valid, and who is it?” Revocation is straightforward: delete the row. Independent APIs cannot validate the token without calling the issuer.

Identity API access tokens are **opaque** unless you have explicitly replaced that with a JWT bearer design. Decoding the string in jwt.io and seeing garbage is a clue, not a bug.

Angular interceptors that assume `payload.exp` in a base64 JWT will fail in confusing ways. Do not “fix” that by stuffing a JWT parser on an opaque string.

## A decision table I actually use

| Situation | I use |
| --- | --- |
| Single host, Angular same-site or BFF, first-party only | MapIdentityApi + cookies, or opaque bearer to that host |
| Single host, but Angular must send `Authorization` to **this** API only | MapIdentityApi bearer **if** the API that maps Identity **is** the API you call |
| Second API in another process | JWT or OIDC; do not expect opaque Identity tokens to validate there |
| Third-party developers | OIDC (OpenIddict / Duende / Entra), not MapIdentityApi |
| You already have custom JWT refresh tables | Do not add MapIdentityApi “for login” beside them without a written plan |

The failure mode is **two auth stacks**: Identity cookies on some routes, custom JWT on others, Angular never sure which 401 means what.

## How the Angular app should treat opaque tokens

If you stay on MapIdentityApi bearer tokens:

- Store the access token like any bearer secret (memory preferred; see [interceptors](/blog/angular-jwt-interceptors))
- Do **not** decode it for roles. Call a `/manage/info` or your own `GET /me` that Identity already authenticates
- Refresh using **their** refresh endpoint, not your custom `/api/auth/refresh` copied from a JWT blog
- 401 handling still needs single-flight refresh — the queueing problem does not care whether the string is a JWT

If the SPA and API are same-site, **cookies** from Identity may be simpler than bearer tokens. Then you need CSRF discipline, same as a [BFF](/blog/bff-pattern-aspnet-core-angular-yarp).

## If you need JWT anyway

Use Identity as the **user store**, and issue JWTs yourself (or via OpenIddict) after `SignInManager` succeeds. That is a known, boring pattern. MapIdentityApi is optional in that design — sometimes it is extra surface you should not expose.

```csharp
app.MapPost("/api/auth/login", async (
    LoginRequest body,
    UserManager<ApplicationUser> users,
    SignInManager<ApplicationUser> signIn,
    IJwtIssuer jwt) =>
{
    var user = await users.FindByEmailAsync(body.Email);
    if (user is null) return Results.Unauthorized();

    var check = await signIn.CheckPasswordSignInAsync(user, body.Password, lockoutOnFailure: true);
    if (!check.Succeeded) return Results.Unauthorized();

    return Results.Ok(await jwt.IssueAsync(user));
});
```

Here `IJwtIssuer` is **your** rotation-aware issuer. Identity did passwords and lockout. You did token shape. That split is easier to explain than “we called MapIdentityApi and also AddJwtBearer and hoped.”

If you enable both MapIdentityApi and JWT bearer, configure **one** default authenticate scheme and test with the actual Angular header. Mixed schemes fail in production first, not in Swagger.

## MapIdentityApi plus `[Authorize]` on Minimal APIs

Identity API tokens authenticate against Identity’s bearer handler. `AddJwtBearer()` authenticates JWTs. If your endpoint only has JWT bearer as the default, opaque tokens look like anonymous users.

Symptoms:

- `/login` returns 200 and a token
- `/api/orders` returns 401 with that token
- Same endpoint returns 200 with a hand-made JWT from another tool

Fix: either validate the Identity token scheme on those endpoints, or stop using MapIdentityApi tokens for those endpoints. Do not lower `ValidateAudience` to “make it work.”

## What I tell clients in the first auth meeting

1. How many **processes** will validate the token in six months?
2. Do we need **SSO** across apps?
3. Is Angular allowed to hold long-lived secrets?

If the answers are “one,” “no,” and “we’d rather not,” MapIdentityApi or cookie Identity is a legitimate senior choice — not a junior shortcut.

If the answers are “several APIs,” “maybe Azure AD later,” or “mobile next quarter,” design JWT/OIDC now. Retrofitting is possible. It is not free.

---

If your Angular app is sending Identity API tokens into a JWT pipeline (or the other way around), [contact me](/contact). The fix is usually a deliberate scheme choice, not another interceptor.

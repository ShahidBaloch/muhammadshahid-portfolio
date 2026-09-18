---
title: "Microsoft Entra ID for Angular and ASP.NET Core"
description: "How an Angular app and an ASP.NET Core API use Microsoft Entra ID: which token the API accepts, the audience and scope checks that cause 401s, and when a BFF is the better shape."
date: "2026-09-18"
updated: "2026-09-18"
category: "identity"
tags: ["Entra ID", "Azure AD", "Angular", "ASP.NET Core", "JWT"]
related:
  - aspnet-core-jwt-auth
  - bff-pattern-aspnet-core-angular-yarp
  - refresh-token-httponly-cookie-angular-aspnet-core
  - aspnet-core-401-vs-403
faq:
  - q: "Which Entra token should Angular send to ASP.NET Core?"
    a: "The access token for the API, not the ID token. The API checks aud and the scope or app role. An ID token is for the client. Sending it is the usual cause of a 401 with a valid-looking JWT."
  - q: "Does a single-page app need an Entra client secret?"
    a: "No. A public SPA uses PKCE. A client secret in Angular is visible in the browser. If you need a secret, the secret belongs in a backend or a BFF, not in the bundle."
  - q: "When should I use a BFF instead of MSAL in Angular?"
    a: "Use MSAL in Angular when the API is a resource the SPA calls directly and you accept tokens in the browser. Use a BFF when the app is first-party and you want the session in an HttpOnly cookie. Both still trust Entra. They differ in where the token lives."
---

Contract clients ask for Entra, not IdentityServer. The Angular app signs the user in. The ASP.NET Core API accepts one audience and one scope. Everything else is a 401 with a token that "looks fine" in jwt.ms.

Hub: [Identity](/learning/identity). Related: [JWT auth](/blog/aspnet-core-jwt-auth), [401 vs 403](/blog/aspnet-core-401-vs-403). This is not a Duende guide. That comparison already lives on [IdentityServer vs ASP.NET Identity](/blog/identityserver-vs-aspnet-identity).

## Real-world analogy

The building has two badges. The ID token is the badge that gets you through the lobby: it says who you are, and the lobby already checked it. The access token is the key card for the server room. Showing the lobby badge to the server-room reader does nothing. The API is the server room. It wants the card that names that room (`aud`) and the permission printed on it (`scp`).

## Worked example

Angular's interceptor sends the token from the login response. The API returns 401. jwt.ms shows a valid signature, the right tenant, and `aud` equal to the SPA's client id. That is an ID token. The API's audience is `api://<api-client-id>`. The SPA registration never requested the API scope, so Entra never minted an access token for it. Add the scope, map only the API origin to that scope, and send the access token. The same JWT shape with the SPA's client id in `aud` will keep failing, correctly.

## Two app registrations

| App | Platform | What it is |
|---|---|---|
| API | Web API / exposed API | The audience. Defines a scope such as `access_as_user` |
| SPA | Single-page application | Public client. Redirect URI is the Angular callback. No secret |

The SPA registration requests the API scope. The API registration never redirects a browser.

Authority for v2 tokens:

`https://login.microsoftonline.com/{tenant-id}/v2.0`

Use the tenant id for a single tenant. `organizations` is any work account. `common` also allows personal Microsoft accounts, which most line-of-business APIs do not want.

## What the API checks

```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddMicrosoftIdentityWebApi(builder.Configuration.GetSection("AzureAd"));

app.UseAuthentication();
app.UseAuthorization();
```

```json
"AzureAd": {
  "Instance": "https://login.microsoftonline.com/",
  "TenantId": "<tenant-guid>",
  "ClientId": "<api-app-client-id>",
  "Audience": "api://<api-app-client-id>"
}
```

`Audience` must equal the `aud` claim Entra puts on the access token. If the portal shows the bare client id in `aud` and the config says `api://...`, every call is 401. Log the failure. Signature errors are a different bug: [IDX10503](/blog/aspnet-core-idx10503-jwt-signature), [wrong kid](/blog/aspnet-core-idx10501-jwt-kid).

Authorize the scope, not "any authenticated user":

```csharp
builder.Services.AddAuthorization(o =>
    o.AddPolicy("Orders.Read", p =>
        p.RequireScope("access_as_user")));
```

A token with the right audience and no scope is authenticated and not authorized. That is 403, not 401. See [401 vs 403](/blog/aspnet-core-401-vs-403).

## What Angular sends

The interceptor attaches the access token only to the API origin, and only for the scope you listed. A map that says `https://graph.microsoft.com` does not authorize your API. A map that uses `User.Read` gets a Graph token. Your API rejects it. The scope string is `api://<api-app-id>/access_as_user` unless you set a different Application ID URI.

Do not store that token in `localStorage` if you can avoid it. MSAL's cache is still readable by any script on the origin. For a first-party shop, the stronger shape is the [BFF](/blog/bff-pattern-aspnet-core-angular-yarp): Angular talks to your origin, the cookie is HttpOnly, Entra tokens stay on the server. Same Entra tenant. Different place for the secret and the refresh. [Cookie refresh](/blog/refresh-token-httponly-cookie-angular-aspnet-core) is that path. Do not mix "MSAL attaches a bearer header" and "the API only reads a cookie" in one app.

## Redirect URIs

The redirect URI is exact. `http://localhost:4200` and `http://localhost:4200/` are different. Production is `https://www.your-app` with the path MSAL actually uses. A URI you added on the SPA registration does not fix a redirect started by the API registration.

## Production checks

- One tenant until a customer asks for multi-tenant. Then validate the issuer. Do not switch to `common` and skip issuer checks.
- App roles for users who are assigned in Entra. Scopes for what the client is allowed to call. They are not interchangeable.
- Clock skew of a few minutes is normal. A 401 on every call is not skew. It is audience, scope, or the wrong token type.

Healthcare-style boundaries where the identity provider is not yours to swap: [Healthcare SaaS](/work/healthcare-saas). Auction-style IdentityServer work, for contrast, is [CarBazaar](/work/carbazaar).

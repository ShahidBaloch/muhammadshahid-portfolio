---
title: "IdentityServer4 to OpenIddict Migration Checklist for ASP.NET Core"
description: "A production checklist for leaving IdentityServer4: what actually moves to OpenIddict, what stays in ASP.NET Identity, and the Angular OIDC breaks I still see on healthcare and SaaS apps."
date: "2026-08-17"
category: "identity"
tags: ["IdentityServer", "OpenIddict", "OIDC", "ASP.NET Core Identity", "SSO"]
---

IdentityServer4 is end of life. Teams still run it because login works, Angular still redirects, and nobody wants to touch certificates in production. Then a CVE, a .NET upgrade, or a security questionnaire makes the conversation unavoidable.

This page is a **migration checklist**, not a “which product is morally better” essay. For the product choice (Identity alone vs an authorization server vs MapIdentityApi), start with [IdentityServer vs ASP.NET Identity](/blog/identityserver-vs-aspnet-identity) and [opaque tokens vs JWT](/blog/mapidentityapi-opaque-token-vs-jwt). This article assumes you already decided you still need OIDC — multiple apps, a partner, or an enterprise IdP — and you are leaving IS4.

It is not legal advice and not a license comparison table. Duende IdentityServer is the commercial continuation of the IS4 line. OpenIddict is a separate open-source stack. Read **current** terms for your company size before you pick. I am not telling anyone to evade a license.

## What does not migrate as a rename

I have watched more than one team grep `IdentityServer` → `OpenIddict` and call it a spike. That is how you ship a login page that works in Swagger and fails in Angular for three different reasons.

IS4 and OpenIddict share **ideas** (clients, scopes, tokens, discovery). They do not share:

- Database schema for grants, keys, and device flows
- Middleware order and endpoint paths (even when you map `/connect/*` on purpose)
- How refresh tokens are stored and rotated
- How ASP.NET Core Identity is wired as the user store
- The exact claim types Angular and `[Authorize]` already depend on

Treat this as a **cutover**, not a NuGet bump.

## Decide the destination before you inventory

Three honest destinations:

| Destination | When I use it | What you throw away |
| --- | --- | --- |
| **Duende IdentityServer** | You want the closest IS4 operational model and will pay | Least conceptual rewrite; still a version jump |
| **OpenIddict** | You want an OSS authorization server on ASP.NET Core you can own | Client store, key material, grant tables, a lot of config |
| **No authorization server** | You never needed OIDC — one SPA, one API | The whole `/connect` surface; move to Identity + JWT or MapIdentityApi |

If discovery question 1 in the [Identity vs IdentityServer post](/blog/identityserver-vs-aspnet-identity) scores “one app, one team,” **do not migrate IS4 to OpenIddict**. Delete the server. Migrating a product you should not have is how you spend a month to keep accidental complexity.

I pick OpenIddict when the client wants an in-process or sibling ASP.NET Core host, is comfortable owning SQL stores, and does not want Duende’s commercial relationship. I pick Duende when operations already thinks in IS4 clients and the budget is there. I do not pick based on a Twitter thread about licensing.

## Inventory (do this in staging with production-shaped config)

Export, do not guess:

1. **Clients** — client ids, grant types, redirect URIs (every localhost variant counts), post-logout URIs, CORS origins, secrets vs PKCE-only public clients.
2. **Scopes and resources** — API names, audience strings, whether Angular actually sends the scope the API validates.
3. **Users** — Identity tables, external logins, 2FA, lockout. OpenIddict does not replace Identity. Your user ledger stays.
4. **Tokens in the wild** — access token lifetime, refresh lifetime, whether refresh is reusable, whether you persist grants.
5. **Keys** — signing credentials, how you rotate, whether data-protection keys live on one App Service instance.
6. **Downstream** — Angular `oauth-oidc` / `angular-auth-oidc-client` authority URL, SignalR negotiate, machine clients (client credentials), Swagger.

I print this as a spreadsheet the product owner can see. Hidden redirect URIs are how Friday deploys lock clinicians out of the admin portal.

## OpenIddict host shape I actually ship

Keep the **authorization server** a dedicated ASP.NET Core app (or a clearly isolated area) even if it shares a solution with APIs. Mixing MVC business pages and token endpoints in one “god host” is how cookie auth and bearer auth fight.

Sketch — names are examples, not a copy-paste product:

```csharp
builder.Services.AddOpenIddict()
    .AddCore(options =>
    {
        options.UseEntityFrameworkCore()
            .UseDbContext<OpenIddictDbContext>();
    })
    .AddServer(options =>
    {
        options.SetAuthorizationEndpointUris("connect/authorize")
            .SetTokenEndpointUris("connect/token")
            .SetEndSessionEndpointUris("connect/logout");

        options.AllowAuthorizationCodeFlow()
            .RequireProofKeyForCodeExchange()
            .AllowRefreshTokenFlow()
            .AllowClientCredentialsFlow();

        options.RegisterScopes("openid", "profile", "email", "claims.api");

        options.AddDevelopmentEncryptionCertificate()
            .AddDevelopmentSigningCertificate(); // staging only

        options.UseAspNetCore()
            .EnableAuthorizationEndpointPassthrough()
            .EnableTokenEndpointPassthrough()
            .EnableEndSessionEndpointPassthrough();
    })
    .AddValidation(options =>
    {
        options.UseLocalServer();
        options.UseAspNetCore();
    });
```

Production signing is **not** development certificates. Use a persisted certificate (Key Vault, or a cert store the App Service identity can read). If you skip this, the first swap in Azure mints a new key and every access token in Angular dies together.

Seed clients in a **migrator**, not in `Program.cs` on every boot:

```csharp
await manager.CreateAsync(new OpenIddictApplicationDescriptor
{
    ClientId = "clinic-admin-spa",
    ClientType = ClientTypes.Public,
    RedirectUris = { new Uri("https://admin.example.com/callback") },
    PostLogoutRedirectUris = { new Uri("https://admin.example.com/") },
    Permissions =
    {
        Permissions.Endpoints.Authorization,
        Permissions.Endpoints.Token,
        Permissions.Endpoints.EndSession,
        Permissions.GrantTypes.AuthorizationCode,
        Permissions.GrantTypes.RefreshToken,
        Permissions.ResponseTypes.Code,
        Permissions.Scopes.Email,
        Permissions.Scopes.Profile,
        Permissions.Prefixes.Scope + "claims.api"
    },
    Requirements =
    {
        Requirements.Features.ProofKeyForCodeExchange
    }
});
```

Public SPA clients: **PKCE, no secret**. If your IS4 client still has a secret sitting in `environment.ts`, fix that in the same change. A secret in Angular is not a secret.

## Identity stays the user store

OpenIddict authenticates a **subject**. ASP.NET Core Identity still owns password, lockout, and recovery.

The login Razor/MVC page on the OpenIddict host should:

1. Challenge Identity cookie auth
2. On success, create an OpenIddict authorization
3. Return the authorization code to the SPA

Do not invent a second user table “for OIDC.” I have unwound that. Claims you put on the token (`role`, `clinic_id`, `amr`) should be mapped **once** in a profile service equivalent — a claims principal factory you control — so the API `[Authorize(Roles = "Scheduler")]` does not change meaning on cutover.

If IS4 stuffed 40 claims into every access token “for convenience,” this is the moment to stop. APIs can look up clinic membership. Tokens should stay small.

## Angular: authority, discovery, and silent renew

The SPA does not care that you switched libraries. It cares that:

- `authority` / issuer matches the new host
- discovery (`/.well-known/openid-configuration`) lists the endpoints you actually mapped
- `client_id` is unchanged **or** you accept a full re-login
- `scope` still includes the API resource the bearer handler expects
- redirect URI is **exact** (trailing slash included)

Silent renew via iframe is already fragile in modern browsers. If IS4 used it, do not blindly re-enable it on OpenIddict. Prefer:

- Short access tokens + refresh via a **BFF** ([YARP BFF](/blog/bff-pattern-aspnet-core-angular-yarp), or [Duende BFF vs custom YARP](/blog/duende-bff-vs-yarp-custom-bff)), or
- Refresh in a [queued interceptor](/blog/angular-interceptor-401-refresh-queue) if you still hold tokens in the SPA

Cutover weekend: **force re-login**. Trying to honor old IS4 refresh tokens in OpenIddict is a science project. Revoke, expire cookies, tell users once.

## Resource APIs

`AddJwtBearer` on the claims API must use the **new issuer** and signing keys. Audience (`aud`) is the bug I still see most: IS4 used an API resource name; OpenIddict audience might be the scope or the client depending on how you configured it.

Validate in staging with a real token from the SPA, not a hand-made jwt.io token:

```csharp
options.Authority = "https://login.example.com";
options.Audience = "claims.api";
options.TokenValidationParameters.ValidIssuers =
[
    "https://login.example.com",
    "https://login.example.com/"
];
```

Pick one issuer string and make discovery, tokens, and validation agree. Trailing slashes have wasted more hours than key rotation.

Machine clients (EDI jobs, Azure Functions) need **client credentials** re-registered. Client secrets belong in Key Vault, not appsettings committed in 2019.

## Data and keys

- Migrate **users** with Identity. Do not copy IS4 `PersistedGrant` rows and hope.
- Plan a **signing key** that survives swaps (shared Data Protection or a cert).
- Shorten access token lifetime for the first week so a bad claim set dies quickly.
- Keep IS4 running in read-only / redirect mode only if you must — I prefer DNS cutover plus a maintenance page.

## Cutover checklist I walk in a war room

- [ ] Client inventory signed off (redirect URIs, grant types, PKCE)
- [ ] Identity user store pointed at the same SQL the apps already use
- [ ] Production signing cert loaded; Data Protection keys shared across instances
- [ ] Discovery document matches Angular authority
- [ ] One API validated a real SPA token (`aud`, `iss`, `role`)
- [ ] Client-credentials job obtained a token and called one internal endpoint
- [ ] Logout hits end-session and clears the Identity cookie
- [ ] Refresh path tested with [rotation / reuse](/blog/aspnet-core-jwt-refresh-token-rotation) semantics you actually want
- [ ] Old IS4 host decommissioned after TTL of the longest access token
- [ ] Rollback: previous IS4 slot still deployable for 24 hours (DNS, not hope)

## When I would not migrate to OpenIddict

- You only have one Angular app. Use Identity. IS4 was already the wrong building.
- The only “OIDC” you need is **Entra ID**. Federate; do not stand up a second authorization server to wrap Microsoft.
- Nobody on the team will own certificates and client registration. Pay for a hosted IdP or Duende support rather than an unowned OpenIddict.

OpenIddict is a good ASP.NET Core authorization server. It is not free of operations. Migration is the price of leaving a dead product, not a weekend rename.

---

If you are cutting IdentityServer4 over on a .NET + Angular platform and want a second pair of eyes on clients, keys, and the Angular authority URL, [contact me](/contact). Bring the client spreadsheet; architecture without redirect URIs is fiction.

---
title: "IdentityServer vs ASP.NET Core Identity — When SSO Is Worth It"
description: "When ASP.NET Identity is enough, when OpenIddict or IdentityServer earns SSO, and how MapIdentityApi fits — without treating IdentityServer4 as a current option."
date: "2026-08-17"
category: "identity"
tags: ["IdentityServer", "OpenIddict", "OIDC", "ASP.NET Core Identity", "Security", "SSO"]
---

Clients often ask for "single sign-on" before they can name the apps that need to share a login. That is a recipe for shipping Duende IdentityServer (or another OIDC provider) when ASP.NET Core Identity with a well-designed JWT setup would have been enough for the first year.

I have built both. A healthcare SaaS platform with a clinician admin portal, a patient-facing Angular app, and a partner API. A marketplace with buyer and seller surfaces plus an internal ops console. In each case, the identity decision shaped hosting cost, release cadence, and how painful it was to onboard a third application six months later.

This post is not a feature comparison chart copied from documentation. It is how I decide when OIDC and an identity server earn their keep — and when Identity alone is the right call.

**IdentityServer4 is end of life.** Do not start a new IS4 host. If you are stuck on it, the migration checklist is [IdentityServer4 to OpenIddict](/blog/identityserver4-openiddict-migration-checklist) (or Duende if you are buying the continuation). Opaque Identity API tokens vs JWT is [MapIdentityApi vs JWT](/blog/mapidentityapi-opaque-token-vs-jwt).

## What ASP.NET Core Identity actually gives you

ASP.NET Core Identity is a user store and membership system. It handles registration, passwords, lockout, two-factor hooks, external login providers, and role claims — all inside your application database.

For a single API plus one Angular SPA, that is often the entire story:

1. Users authenticate against your API (or a dedicated auth endpoint in the same solution)
2. The API issues JWT access tokens (and optionally refresh tokens)
3. Angular stores tokens and calls protected endpoints
4. Roles and policies live in the same database your business data uses

I have shipped production systems this way for years. The operational surface is small: one app to deploy, one user table to backup, one place to patch security updates.

Where Identity alone starts to strain is not "we need OAuth2 buzzwords." It is when **multiple independent applications** need the same user session, **third parties** need delegated access, or **token semantics** must be standardized across teams that do not share a codebase.

## OpenIddict vs Duende vs Identity (the 2026 menu)

Three products get conflated in Slack:

| Option | What it is | When I reach for it |
| --- | --- | --- |
| **ASP.NET Core Identity** | User store, passwords, 2FA hooks | One app, one team, no partner OIDC |
| **MapIdentityApi** | HTTP endpoints on Identity; **opaque** tokens by default | First-party SPA talking to **this** host only |
| **OpenIddict** | OSS OAuth/OIDC server on ASP.NET Core | You need standards (code+PKCE, client credentials) and will own SQL + keys |
| **Duende IdentityServer** | Commercial authorization server (IS4’s line) | You want that operational model and will pay |

OpenIddict is **not** “free IdentityServer.” Endpoints, grants, and key material are a different implementation. Duende is **not** IdentityServer4 with a NuGet bump — read current licenses. Identity alone is still the correct default for a single Angular + API product.

If Angular is sending a MapIdentityApi string into `AddJwtBearer`, that is a token-type bug, not an SSO decision. Fix it with the [opaque vs JWT post](/blog/mapidentityapi-opaque-token-vs-jwt).

## What IdentityServer / OIDC adds on top

Duende IdentityServer, OpenIddict, and similar OIDC providers sit in front of your applications as a **token issuer**. Clients redirect users to a login UI, receive authorization codes or tokens, and validate them against a well-known issuer URL.

You gain:

- **Central login** across web apps, mobile apps, and machine clients
- **Standard OIDC flows** (authorization code + PKCE for SPAs, client credentials for services)
- **Federated identity** — Azure AD, Google, hospital IdPs — without re-wiring every app
- **Consent and scope** boundaries when external apps access your APIs
- **Session management** at the identity layer, not duplicated per app

That is real value. It is also real infrastructure: another service to host, certificate rotation, client registration, redirect URI discipline, and breaking changes when you misconfigure a scope.

## Scenarios where I reach for OIDC / IdentityServer

### Multiple first-party apps with one login experience

The healthcare platform I mentioned had three Angular apps on different subdomains — admin, clinic scheduling, and analytics. Clinicians refused three separate logins. Identity in one API could have issued JWTs for all three, but logout and refresh semantics would have been inconsistent without custom glue. OIDC gave us one login page, shared session behavior, and per-client redirect URIs without forking auth code. That justified IdentityServer as a first-class deployable.

### SPAs that must not handle passwords directly

For regulated environments, product owners sometimes require that **credentials never touch the business API**. The SPA talks only to the identity server for login; the API accepts only access tokens.

Identity alone can still do this if you split an `Auth` host from your `Api` host, but OIDC formalizes the boundary. Auditors understand "authorization server" language. Security reviews go smoother when the token issuer is explicit.

### Third-party integrations and partner APIs

Marketplace work introduced seller tools built by external agencies and a mobile app from a contractor. They needed access tokens with scoped permissions (`listings:read`, `orders:write`) without database accounts in our main user table.

Client credentials and authorization code flows with registered clients are what OIDC is designed for. Bolting API keys onto Identity without a token service works for a while, then becomes a spreadsheet of secrets nobody rotates.

### Enterprise SSO (Azure AD / Entra ID)

When IT says "we log in with Microsoft," federation is non-negotiable. IdentityServer, Azure AD B2C, or similar becomes the bridge. External login providers in Identity work for one app; multiple apps with consistent claim mapping push you toward a dedicated identity layer.

## Scenarios where Identity alone is enough

### One API, one SPA, one team

If you are building a greenfield SaaS with a single Angular front end and one ASP.NET Core API, start with Identity + JWT. Ship features. Measure pain.

I have seen teams deploy IdentityServer on day one because a blog post said "real apps use OAuth." Six months later they maintained three redirect URIs for localhost variants and still had one production app.

### Internal admin tools with low identity complexity

A small ops dashboard behind VPN or IP allowlisting, shared service accounts, or a handful of internal users does not need a token server. Identity with roles, or even Azure AD app registration pointing directly at the API, is simpler.

## The hybrid I use often

Not everything is binary. A pattern that worked well on a recent eCommerce project:

- **IdentityServer** for human login (buyer account, seller portal, admin)
- **ASP.NET Core Identity user store** behind IdentityServer (Duende supports this cleanly)
- **Client credentials** for warehouse and fulfillment integrations
- **Local Identity** only in a background worker service that had no users at all — just a service principal

Your user records stay in one SQL database. The identity server is the front door; Identity is the ledger. You do not duplicate password hashes across apps.

## Decision questions I ask in discovery

Before recommending IdentityServer to a client, I write answers to these:

1. How many **distinct applications** (not just routes) need login in the next 12 months?
2. Will **external developers** consume your APIs on behalf of users?
3. Is **federated login** (Azure AD, Okta, hospital IdP) a contract requirement?
4. Do you need **central logout** and session revocation across apps?
5. Who operates production — do they want another always-on service?

If the score is low, Identity + JWT gets a six-month runway with a documented migration path. If the score is high, we design OIDC clients and scopes up front so the first app does not paint us into a corner.

## Common mistakes I have had to unwind

**Using IdentityServer because JWT feels hard.** JWT validation is one middleware block; IdentityServer moves complexity to client registration and redirect URIs.

**One giant scope for every client.** Marketplace seller tools should not inherit admin permissions because the scope list was lazy.

**Implicit flow templates and unrotated refresh tokens.** Modern SPAs need authorization code with PKCE. Treat refresh tokens as secrets and plan revocation — especially in healthcare where session hijack has compliance implications.

## Angular and API implications

With Identity alone, Angular posts to `/api/auth/login` and stores the JWT. With IdentityServer, the app redirects to `/connect/authorize` and exchanges the code for tokens via `oauth-oidc` or MSAL. Either way, map the same `sub`, email, and role claims your API policies expect. A login that works in Swagger but fails in the SPA because the audience string differs wastes everyone's time.

## Bottom line

Use **ASP.NET Core Identity alone** when you have one product surface, one team, and no near-term federation or third-party client requirements. It is fast, understandable, and production-proven.

Reach for **OpenIddict or Duende / OIDC** when multiple apps must share login, external clients need standard token flows, or enterprise federation is on the roadmap from day one — and you are willing to operate an identity service properly. If you are leaving IdentityServer4, use the [OpenIddict migration checklist](/blog/identityserver4-openiddict-migration-checklist), not a rename.

The wrong choice is not "Identity without OIDC." The wrong choice is **OIDC before you have the problem it solves**, or **Identity alone long after three apps and a partner API have made auth the bottleneck**.

If you are planning auth for a multi-app .NET and Angular platform and want a second opinion before you commit to IdentityServer or stay lean with Identity, [reach out](/contact).

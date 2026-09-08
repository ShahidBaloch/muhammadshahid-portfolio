---
title: "Identity articles for ASP.NET Core"
---

## Introduction

**Identity on ASP.NET Core** spans three different products people conflate: **ASP.NET Core Identity** (user store in your app), **OpenID Connect / OAuth server** (IdentityServer, OpenIddict, Entra ID), and **JWT bearer resource APIs**. This hub helps you pick the right one before reading migration or redirect URI articles.

## Definitions

| Piece | Role |
|---|---|
| **ASP.NET Core Identity** | Users, passwords, roles in *your* database |
| **IdentityServer / OpenIddict** | Issues tokens; SSO across clients |
| **Resource API** | Validates JWT; does not issue login UI |
| **`MapIdentityApi`** | Minimal Identity endpoints; often opaque tokens — not the same as JWT bearer setup |

## Real-world analogy

- **Identity** — employee directory in your building.
- **Identity server** — corporate SSO that issues badges valid in multiple buildings.
- **API** — door that only checks whether the badge is signed by HR you trust.

Using the **directory phone** (Identity API token) at a **door that expects SSO badge format** (JWT bearer) is the MapIdentityApi vs JWT mismatch.

## Decision guide

| You need… | Start with |
|---|---|
| Single app, local users | ASP.NET Core Identity |
| Multiple apps, SSO, Angular + API | OIDC server (OpenIddict / commercial IdP) |
| API only, tokens from external IdP | JWT bearer validation |
| Leaving IdentityServer4 | [IS4 → OpenIddict checklist](/blog/identityserver4-openiddict-migration-checklist) |

## Common failures

| Symptom | Check |
|---|---|
| Login redirect loop | `redirect_uri` exact match, trailing slash, http vs https |
| Token works in Postman, not Angular | Wrong authority URL, CORS, or opaque vs JWT |
| Migration broke clients | Client ids, secrets, grant types, signing keys |

## Greenfield vs brownfield

| Situation | Reasonable default |
|---|---|
| One Angular SPA + one API, no SSO | ASP.NET Core Identity + JWT you issue |
| Multiple apps, partners, mobile | OpenIddict or managed IdP (Entra, Auth0) |
| API behind BFF | Cookies at edge; API validates session or token exchange |
| Legacy IS4 still running | Migration checklist — do not greenfield on dead IS4 |

## Token shapes Angular must match

| API expects | Angular sends |
|---|---|
| JWT bearer | `Authorization: Bearer <jwt>` from login or OIDC |
| Opaque Identity API token | Not the same middleware — read MapIdentityApi article |
| Cookie session (BFF) | `withCredentials`; no bearer in `localStorage` |

## Interview cross-questions

1. **Identity vs IdentityServer?** — User store vs token issuer / SSO.
2. **Why OpenIddict over IS4?** — Licensing, maintenance, self-host control — not “because blog said so.”
3. **Where do refresh tokens live in SPA?** — Security trade-off: memory, cookie+BFF, not `localStorage` for high-risk apps.

## Deep-dive articles

| Topic | Article |
|---|---|
| Product choice | [IdentityServer vs ASP.NET Identity](/blog/identityserver-vs-aspnet-identity) |
| Redirect loops | [Redirect URI login loop](/blog/identityserver-redirect-uri-login-loop) |
| IS4 migration | [IS4 OpenIddict checklist](/blog/identityserver4-openiddict-migration-checklist) |
| MapIdentityApi vs JWT | [Opaque token vs JWT](/blog/mapidentityapi-opaque-token-vs-jwt) |

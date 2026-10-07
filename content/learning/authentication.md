---
title: "ASP.NET Core + Angular Authentication Articles"
description: "JWT, refresh token rotation, Angular interceptors, BFF pattern, and SPA auth for ASP.NET Core. Production authentication patterns from healthcare and SaaS systems."
---

## Introduction

This page is the **article map** for JWT and SPA auth. Each failure mode has its own article — open those for deep answers and production code.

| You want… | Open |
|---|---|
| **JWT API checklist** | [JWT auth](/blog/aspnet-core-jwt-auth) |
| **Angular interceptors** | [JWT interceptors](/blog/angular-jwt-interceptors) |
| **Concurrent 401 refresh queue** | [401 refresh queue](/blog/angular-interceptor-401-refresh-queue) |
| **401 vs 403** | [401 vs 403](/blog/aspnet-core-401-vs-403) |
| **Refresh rotation** | [Refresh token rotation](/blog/aspnet-core-jwt-refresh-token-rotation) |
| **BFF / YARP** | [BFF pattern](/blog/bff-pattern-aspnet-core-angular-yarp) |
| **HttpOnly cookie refresh** | [Refresh token cookie](/blog/refresh-token-httponly-cookie-angular-aspnet-core) |
| **Auth guards in Angular** | [Angular auth guard](/blog/angular-auth-guard-aspnet-core) |
| **Identity product choice** | [Identity hub](/learning/identity) |

## Definitions

| Term | Meaning | Deep dive |
|---|---|---|
| **Authentication** | Who the user is | [JWT auth](/blog/aspnet-core-jwt-auth) |
| **Authorization** | What they may do (403) | [401 vs 403](/blog/aspnet-core-401-vs-403) |
| **Refresh** | Rotate without re-login | [Rotation](/blog/aspnet-core-jwt-refresh-token-rotation) |
| **BFF** | Tokens stay server-side | [BFF](/blog/bff-pattern-aspnet-core-angular-yarp) |

## Mental model (two minutes)

JWT authentication on ASP.NET Core is a three-layer stack:

1. **Token issuance.** Your identity server (IdentityServer / OpenIddict / Entra ID) issues a JWT access token and a refresh token. The access token is short-lived (15 min). The refresh token is long-lived and stored in an HttpOnly cookie.

2. **Token validation.** The API validates the JWT on every request — `iss`, `aud`, `exp`, and the signing key (`kid`). A misconfigured `TokenValidationParameters` that accepts expired tokens or any signing key is the most common auth bug in .NET APIs. See [JWT signature validation (IDX10503)](/blog/aspnet-core-idx10503-jwt-signature) and [kid validation (IDX10501)](/blog/aspnet-core-idx10501-jwt-kid).

3. **Token delivery.** SPAs should store access tokens in memory (not localStorage — that's XSS-accessible). Refresh tokens belong in HttpOnly cookies, managed server-side by a BFF. See [refresh token in HttpOnly cookie](/blog/refresh-token-httponly-cookie-angular-aspnet-core) and [BFF pattern](/blog/bff-pattern-aspnet-core-angular-yarp).

## The Angular side

Angular handles JWT through HTTP interceptors. The interceptor pattern attaches the bearer token to outgoing requests and handles 401 responses by queuing concurrent requests while a single refresh fires, then replaying them with the new token.

**The most common Angular auth bug** is not handling concurrent 401s: two requests expire simultaneously, both fire a refresh, and one gets a `invalid_grant` error because the refresh token was already consumed. The fix is a refresh queue with a `BehaviorSubject`. See [401 refresh queue](/blog/angular-interceptor-401-refresh-queue).

## When to use BFF

The BFF (Backend for Frontend) pattern moves token management entirely to the server. The Angular SPA gets session cookies, not tokens. There is no bearer token in `localStorage` or even memory — the Angular app never sees a JWT.

Use BFF when:
- The SPA handles sensitive data and XSS is a real threat
- You need token refresh without exposing refresh tokens to JavaScript
- You are integrating with a third-party identity provider (Entra ID, Auth0) and need to hide client secrets

Skip BFF when:
- It is a simple internal tool with no sensitive data
- The team is small and cannot justify the complexity
- The same backend already owns the session

See [BFF vs YARP custom BFF](/blog/duende-bff-vs-yarp-custom-bff) for the trade-off between Duende BFF and rolling your own.

## Common production failures

**Redirect loop with IdentityServer.** Usually a `redirect_uri` mismatch in the client configuration. The error appears in the browser URL bar but not in the .NET logs. See [IdentityServer redirect URI](/blog/identityserver-redirect-uri-login-loop).

**HTTP 401 when the token looks valid.** Either the `aud` claim does not match `ValidAudiences`, or the signing key has rotated and the API has cached the old JWKS. Enable `MetadataAddress` so the API refreshes the JWKS automatically. See [IDX10503](/blog/aspnet-core-idx10503-jwt-signature).

**Angular logging users out under load.** Multiple components make API calls simultaneously on page load. All 401 at once. The interceptor fires a refresh for each — the second refresh call gets `invalid_grant`. Implement the queue. See [401 refresh queue](/blog/angular-interceptor-401-refresh-queue).

## What to read next

For the identity server choice (IdentityServer4 → OpenIddict migration, Entra ID, MapIdentityApi), go to the [identity hub](/learning/identity). For the security implications of authentication — what an attacker can do with a stolen JWT, BOLA, STRIDE — see the [security hub](/learning/security).

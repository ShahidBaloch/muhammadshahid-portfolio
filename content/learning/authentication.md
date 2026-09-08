---
title: "ASP.NET Core + Angular Authentication"
---

## Introduction

**ASP.NET Core authentication with Angular** means agreeing on **who the user is**, **how long credentials last**, and **what happens when a token expires mid-session**. This hub covers JWT bearer APIs, refresh rotation, interceptors, CORS with credentials, cookies, and BFF patterns — not generic “how to log in” tutorials.

## Definitions

| Term | Meaning |
|---|---|
| **Authentication** | Proving identity — login, token issue |
| **Authorization** | What that identity may do — policies, roles, 403 |
| **Access token (JWT)** | Short-lived proof sent on API calls |
| **Refresh token** | Longer-lived credential used only to get new access tokens |
| **Bearer** | `Authorization: Bearer <token>` header |

**401 Unauthorized** — not authenticated or token invalid/expired.  
**403 Forbidden** — authenticated but not allowed. Angular must not treat 403 like “log out” unless that is your product rule.

## Real-world analogy

Authentication is the **badge at the building entrance**; authorization is **which doors the badge opens**:

- Expired badge → 401 → get a new badge (refresh).
- Valid badge, wrong floor → 403 → stay logged in, show “no access.”

If the front desk (refresh endpoint) and security (API) disagree on key rotation, everyone queues at the door — that is the **concurrent refresh race**.

## JWT on ASP.NET Core + Angular (typical flow)

```text
Login → API returns access JWT (+ refresh strategy)
Angular stores access token (memory / secure storage / httpOnly cookie via BFF)
Interceptor attaches Bearer header on each API call
401 → interceptor tries refresh once → retry or logout
```

**Cross-question:** “Why does jwt.io say valid but API returns 401?” → wrong audience/issuer, clock skew, key rotation (`kid` missing from JWKS), or signing key disposed after `using`.

## When to use cookies vs bearer in SPA storage

| Approach | Pros | Risks |
|---|---|---|
| **Bearer in memory** | Simple API contract | Lost on refresh tab; XSS steals token |
| **httpOnly cookie + BFF** | Token not in JS bundle | CSRF, CORS credentials, same-site rules |
| **Duende BFF / YARP edge** | Centralized session | Ops complexity, hosting shape |

## Common production failures

| Symptom | Often actually |
|---|---|
| Login loop | `redirect_uri` mismatch, wrong client id |
| Random 401 after deploy | JWKS `kid` rotation, stale signing key |
| Logout on permission error | SPA treats 403 as 401 |
| Double refresh storm | No queue on interceptor |
| CORS error after login | Credentials + wrong `AllowOrigin` |

## Interview cross-questions

1. **401 vs 403 for Angular?** — 401 re-auth; 403 show forbidden UI.
2. **Refresh token rotation — why?** — Detect reuse/theft; invalidate family on replay.
3. **Why BFF?** — Keep refresh token off browser storage; same-site cookies to API edge.

Scenario posts: [ASP.NET Core interview scenarios](/blog/aspnet-core-interview-questions-scenarios), [Angular interview questions](/blog/angular-interview-questions-aspnet-core).

## Deep-dive articles

| Topic | Article |
|---|---|
| JWT setup checklist | [ASP.NET Core JWT auth](/blog/aspnet-core-jwt-auth) |
| 401 vs 403 contract | [401 vs 403](/blog/aspnet-core-401-vs-403) |
| Signature / key errors | [IDX10503](/blog/aspnet-core-idx10503-jwt-signature), [IDX10501 kid](/blog/aspnet-core-idx10501-jwt-kid) |
| Angular interceptors | [JWT interceptors](/blog/angular-jwt-interceptors) |
| Refresh race | [401 refresh queue](/blog/angular-interceptor-401-refresh-queue) |
| CORS + credentials | [CORS Angular ASP.NET Core](/blog/cors-angular-aspnet-core) |
| BFF pattern | [BFF + YARP](/blog/bff-pattern-aspnet-core-angular-yarp) |

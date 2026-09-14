---
title: "Identity Articles for ASP.NET Core"
---

## Introduction

This page is the **article map** for identity product choice and migration — not JWT interceptor plumbing (see the [authentication hub](/learning/authentication)).

| You want… | Open |
|---|---|
| **IdentityServer vs ASP.NET Identity** | [What is an identity server?](/blog/identityserver-vs-aspnet-identity) |
| **Redirect URI / login loops** | [Redirect URI mismatch](/blog/identityserver-redirect-uri-login-loop) |
| **IS4 → OpenIddict** | [Migration checklist](/blog/identityserver4-openiddict-migration-checklist) |
| **MapIdentityApi opaque vs JWT** | [MapIdentityApi vs JWT](/blog/mapidentityapi-opaque-token-vs-jwt) |

| Piece | Role |
|---|---|
| **ASP.NET Core Identity** | Users/passwords/roles in *your* database |
| **IdentityServer / OpenIddict** | Issues tokens; SSO across clients |
| **Resource API** | Validates JWT; does not own the login UI |

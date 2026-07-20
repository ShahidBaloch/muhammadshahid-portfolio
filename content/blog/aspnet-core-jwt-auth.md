---
title: "ASP.NET Core JWT Auth: A Practical Checklist"
description: "A client-ready checklist for securing ASP.NET Core APIs with JWT — issuers, lifetimes, roles, and Angular token handling."
date: "2026-06-12"
tags: ["ASP.NET Core", "JWT", "Security", "Angular"]
---

When clients ask for “JWT auth,” they usually need a complete access story — not only a token endpoint.

## What to lock down first

1. **Short-lived access tokens** with a clear audience and issuer
2. **Refresh strategy** (or silent renew) that matches your SPA model
3. **Role / policy checks** on every sensitive endpoint
4. **HTTPS everywhere** (`.dev` domains already encourage this)

## API side essentials

In ASP.NET Core, validate issuer, audience, signing key, and lifetime explicitly. Prefer policy-based authorization over scattering `[Authorize]` without named policies.

Keep secrets in configuration providers (Azure Key Vault / environment), never in source control.

## Angular side essentials

- Store tokens carefully (memory + httpOnly cookie patterns beat naive `localStorage` for many apps)
- Attach `Authorization: Bearer` through an interceptor
- Handle 401s with a single refresh/retry path to avoid login loops

## Delivery tip for freelancers

Document the auth flow in one diagram for the client: login → token → API call → refresh → logout. It builds trust faster than listing libraries.

If you need this wired into a production .NET + Angular app, [get in touch](/contact).

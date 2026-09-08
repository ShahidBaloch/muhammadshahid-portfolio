---
title: "ASP.NET Core JWT Auth: A Practical Checklist"
description: "Production ASP.NET Core JWT authentication checklist — token lifetimes, refresh rotation, authorization policies, Angular client habits, and go-live security review."
date: "2026-06-12"
updated: "2026-09-07"
category: "authentication"
tags: ["ASP.NET Core", "JWT", "Security", "Angular"]
faq:
  - q: "How do I set up JWT auth in ASP.NET Core?"
    a: "Add JwtBearer, validate issuer, audience, signing key, and lifetime, then protect endpoints with policies. A token endpoint alone is not a production auth system."
  - q: "How long should an ASP.NET Core JWT live?"
    a: "Access tokens should be short — minutes, not days. Stay signed in with a refresh contract, not a 30-day JWT in localStorage."
  - q: "Is JWT auth enough without refresh tokens?"
    a: "For a kiosk or a job that already has another session, maybe. For Angular users who should stay signed in, you need rotation or a BFF. Those are separate articles."
---

**JWT authentication in ASP.NET Core** is a system — not a token endpoint — covering issuance, validation, lifetimes, refresh, policies, and how the SPA stores and sends credentials.

```text
Login ──► access JWT (short) + refresh (long, server-tracked)
              │
              ▼
         API validates iss/aud/key/exp on every request
              │
              ▼
         [Authorize] policies on sensitive paths
              │
         401 ──► SPA refresh ──► retry or logout
```

Think of JWT auth as a **theme park wristband system**: the wristband (access token) gets you through rides for a few hours; the season pass record (refresh token) at guest services lets you get a new wristband — but guest services can revoke the pass if it is stolen.

**New to this** → stay here. **Angular interceptors** → [JWT interceptors](/blog/angular-jwt-interceptors). **Route guards** → [auth guards](/blog/angular-auth-guard-aspnet-core). **Refresh rotation** → [refresh token rotation](/blog/aspnet-core-jwt-refresh-token-rotation). **Interview prep** → [If an interviewer asks](#if-an-interviewer-asks).

## What "JWT auth" actually includes

Treat auth as a **system**, not a NuGet package:

1. **Identity issuance** — who creates tokens, with what claims, signed how
2. **Token lifetime policy** — access token TTL, refresh token rules, revocation
3. **Authorization** — roles, policies, and resource-level checks on every sensitive path
4. **Client storage and transport** — how the SPA holds tokens and attaches them to API calls
5. **Operational hygiene** — secret rotation, HTTPS, logging without leaking credentials

Skip any one of those and you do not have production auth. You have a demo that returns 200 on `/api/me`.

## API-side essentials in ASP.NET Core

### Validate everything explicitly

Do not rely on framework defaults you have not read. In `Program.cs` (or your auth extension), configure:

```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = config["Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = config["Jwt:Audience"],
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(config["Jwt:Key"]!)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });
```

If issuer, audience, or signing key are wrong, I want the request to fail loudly in staging — not silently in production when a mobile client appears with a misconfigured build.

### Prefer policies over bare `[Authorize]`

Roles alone get messy in SaaS products. I define named policies early:

```csharp
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("ManageCatalog", policy =>
        policy.RequireRole("Admin", "Merchandiser"));

    options.AddPolicy("ViewPatientChart", policy =>
        policy.RequireRole("Clinician")
              .AddRequirements(new SameClinicRequirement()));
});
```

On Ecom_NET10, catalog mutations and order refunds map to different policies even when some users share a broad "Admin" label. In healthcare APIs, role plus resource scope is non-negotiable — a valid clinician token must not imply access to every patient record.

### Keep secrets out of source control

Signing keys, client secrets, and connection strings belong in environment variables, Azure Key Vault, or your host's secret store — never in `appsettings.json` committed to Git. I document which values each environment needs in a table the client owns, not in the repository.

## Token lifetimes and refresh strategy

Short-lived access tokens limit damage when one leaks. I commonly start around **15–30 minutes** for SPA clients, then tune based on UX complaints and risk profile.

Refresh tokens need explicit rules:

- **Rotation** — issuing a new refresh token when the old one is used, invalidating the previous
- **Storage** — httpOnly secure cookies for refresh on many SPAs; avoid long-lived refresh tokens in `localStorage`
- **Revocation** — server-side invalidation on password change, admin lockout, or "log out everywhere"

CarBazaar's identity service centralizes issuance so auction and search APIs trust the same issuer. Smaller monoliths like Ecom_NET10 can expose `/api/auth/refresh` directly, but the contract is the same: one refresh path, one place that decides if the session is still valid.

Document the flow in one diagram for the client: login → access token → API call → 401 → refresh → retry or logout. That diagram has closed more scope arguments than any library list.

## Angular client habits that prevent rework

### Attach tokens in one interceptor

```typescript
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = authStore.accessToken();
  if (!token) return next(req);

  return next(req.clone({
    setHeaders: { Authorization: `Bearer ${token}` }
  }));
};
```

Every API call goes through the same path. Feature teams do not hand-copy headers into individual services.

### Handle 401 with a single refresh/retry path

Multiple competing refresh handlers cause login loops — especially painful in healthcare portals where users lose half-entered forms. One service owns refresh; the interceptor awaits it once and retries the original request, or clears session and routes to login.

### Storage tradeoffs (be honest with the client)

| Approach | Pros | Cons |
|----------|------|------|
| Memory only | Smallest XSS window | Lost on full page refresh unless paired with refresh cookie |
| httpOnly refresh cookie + memory access token | Strong common pattern | Requires correct CORS and cookie flags |
| localStorage for both | Easy to implement | XSS can exfiltrate tokens |

I explain the tradeoff in writing. "Easy localStorage" is not free — it is a risk acceptance decision.

## Security checklist before go-live

Run through this with the client's name on each line:

- [ ] HTTPS enforced everywhere, including staging
- [ ] Access token TTL documented and justified
- [ ] Refresh rotation and revocation tested manually
- [ ] Every sensitive endpoint has policy or resource check — spot-check with a lower-privilege test user
- [ ] CORS allows only known SPA origins — no wildcard with credentials
- [ ] JWT claims do not carry PHI or PII the SPA does not need
- [ ] Auth failures return consistent error shapes ([401 vs 403 distinguishable](/blog/aspnet-core-401-vs-403))
- [ ] Logs never print bearer tokens or refresh tokens
- [ ] Password reset and lockout flows tested end to end
- [ ] Secret rotation procedure written (even if rotation is manual at first)

For healthcare-adjacent work, add: audit log entries for admin impersonation, role changes, and failed access to restricted records — without logging patient identifiers into generic application logs.

## Common failures I see on freelance rescue work

**Long-lived access tokens "because refresh was hard."** Refresh is always harder than skipping it. So is explaining a breach.

**Authorization only on controllers.** Minimal APIs, SignalR hubs, and background job triggers need the same policies.

**Copy-pasted JWT config from a tutorial.** Issuer and audience mismatches between staging and production cause week-long mysteries.

**Angular stores everything in localStorage.** Fine for a hackathon. Not fine for a marketplace with seller payouts or a clinic admin panel.

**No logout story.** Client-side token deletion is not server-side revocation. Document what each logout button actually does.

## Delivery tip: document the contract, not just the code

Handoff quality matters on freelance engagements. I deliver:

- Sequence diagram (login, refresh, logout)
- Table of claims and which policies consume them
- Environment variable list for JWT settings
- Test accounts per role with expected access matrix

Clients trust the system when they can **verify** it without reading `Program.cs`. That trust is what gets you phase two.

If the log is **IDX10503: Signature validation failed** (often with a misleading “no kid”), that is [the IDX10503 article](/blog/aspnet-core-idx10503-jwt-signature) — not a missing `[Authorize]` attribute. If it is **IDX10501: Unable to match key**, the `kid` is missing from JWKS: [IDX10501](/blog/aspnet-core-idx10501-jwt-kid).

## When to reach for IdentityServer / OpenIddict

Not every project needs a separate [identity server](/blog/identityserver-vs-aspnet-identity) on day one. I split identity out when:

- Multiple APIs or SPAs share the same user base (CarBazaar-style)
- Third-party clients need OAuth client credentials
- Centralized SSO across services is already a requirement

For a single API + single Angular admin, JWT baked into the API with clear refresh endpoints is often enough until the second consumer appears.

## If an interviewer asks

**"What must you validate on every JWT in ASP.NET Core?"**

**Strong answer:** Issuer, audience, signing key, and lifetime — explicitly in `TokenValidationParameters`. Do not rely on defaults you have not read. Clock skew should be modest (about one minute), not five minutes that keep expired tokens alive.

**"How long should access vs refresh tokens live?"**

**Strong answer:** Access: minutes (5–15 for SPAs). Refresh: hours to days with server-side hashing, rotation, and family revocation. Long-lived access tokens because refresh was hard is a common breach pattern.

**"Is JWT auth enough without refresh tokens?"**

**Strong answer:** For kiosks or jobs with another session, maybe. For SPAs where users stay signed in, you need refresh rotation, httpOnly cookie refresh, or a BFF — each is a documented tradeoff, not an accident.


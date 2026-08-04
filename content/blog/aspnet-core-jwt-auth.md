---
title: "ASP.NET Core JWT Auth: A Practical Checklist"
description: "A production-ready checklist for JWT authentication in ASP.NET Core APIs — token lifetimes, refresh flows, policies, and Angular client habits from real client work."
date: "2026-06-12"
category: "architecture"
tags: ["ASP.NET Core", "JWT", "Security", "Angular"]
---

When a client says "we need JWT auth," they almost never mean "give us a token endpoint and call it a day." They mean users can sign in, stay signed in reasonably, hit protected APIs from an Angular SPA, and log out in a way that actually sticks — without security holes that show up the first time a contractor runs OWASP ZAP.

I have wired JWT and OAuth-style flows across marketplace microservices, eCommerce storefronts, and healthcare admin portals. CarBazaar splits identity into its own service with IdentityServer patterns. Ecom_NET10 keeps auth inside the monolith API with role-based policies. Healthcare work added stricter session and audit expectations. The libraries repeat; the threat model and UX constraints do not.

This post is the checklist I wish every kickoff email included — API configuration, refresh strategy, Angular handling, and the documentation that keeps clients confident after handoff.

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
- [ ] Auth failures return consistent error shapes (401 vs 403 distinguishable)
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

## When to reach for IdentityServer / OpenIddict

Not every project needs a separate identity server on day one. I split identity out when:

- Multiple APIs or SPAs share the same user base (CarBazaar-style)
- Third-party clients need OAuth client credentials
- Centralized SSO across services is already a requirement

For a single API + single Angular admin, JWT baked into the API with clear refresh endpoints is often enough until the second consumer appears.

---

JWT auth is boring when it is done right — and exciting in the wrong way when it is not. If you need ASP.NET Core and Angular auth wired for production, with policies that match your domain rather than a template, [contact me](/contact) and we can map your flow before code multiplies the cost of fixing it.

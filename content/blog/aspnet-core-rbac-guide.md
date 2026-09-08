---
title: "ASP.NET Core RBAC: Policies Over Scattered Roles"
description: "ASP.NET Core RBAC with named authorization policies — role claims at login, tenant resource handlers, permission claims, and why Angular UI hiding is not security."
date: "2026-03-08"
category: "authentication"
tags: ["ASP.NET Core", "RBAC", "Security", "Healthcare"]
faq:
  - q: "What is RBAC in ASP.NET Core?"
    a: "Role-based authorization: the user is authenticated, then a role or named policy decides whether the action runs. Authentication (JWT) is a different layer."
  - q: "Should I use Authorize Roles or policies?"
    a: "Named policies. Scattered [Authorize(Roles)] strings are un-auditable in a clinic portal. Policies map SupportAgent vs ReadOnlyAuditor in one place."
  - q: "Does hiding an Angular button enforce RBAC?"
    a: "No. UI hiding is courtesy. The API must Forbid 403 on the same policy. Otherwise a forged request still hits clinical notes."
---

**RBAC in ASP.NET Core** is role-based access control enforced by named authorization policies — deciding what an authenticated user may do after JWT validation succeeds.

```text
JWT valid ──► [Authorize(Policy = "ViewClinicalRecords")]
                    │
              role + tenant check
                    │
         pass ──► action runs
         fail ──► 403 Forbid (not 401)
```

Think of RBAC as **job titles on a badge**: "Physician" gets you through certain doors. Tenant checks ask "is this your clinic's patient record?" — role alone is not enough in healthcare or multi-tenant SaaS.

**New to this** → stay here. **401 vs 403** → [401 vs 403](/blog/aspnet-core-401-vs-403). **JWT claims at login** → [ASP.NET Core JWT checklist](/blog/aspnet-core-jwt-auth). **Angular guards** → [auth guards](/blog/angular-auth-guard-aspnet-core). **Interview prep** → [If an interviewer asks](#if-an-interviewer-asks).

## Roles are for humans; policies are for enforcement

Business stakeholders think in roles: Physician, ClinicAdmin, BillingStaff. Developers should encode enforcement as **named policies** that can evolve without grep-across-controllers surgery.

Instead of:

```csharp
[Authorize(Roles = "ClinicAdmin,SuperAdmin")]
[HttpPost("providers/register")]
public async Task<IActionResult> RegisterProvider(...) { ... }
```

I register policies once:

```csharp
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("ManageProviderRegistration", policy =>
        policy.RequireRole("ClinicAdmin", "PlatformAdmin"));

    options.AddPolicy("ViewClinicalRecords", policy =>
        policy.RequireRole("Physician", "Nurse", "ClinicAdmin"));

    options.AddPolicy("ManageBilling", policy =>
        policy.RequireRole("ClinicAdmin", "BillingStaff"));
});
```

Controllers stay readable and stable:

```csharp
[Authorize(Policy = "ManageProviderRegistration")]
[HttpPost("providers/register")]
public async Task<IActionResult> RegisterProvider(...) { ... }
```

When "manage registration" later requires a specific permission claim — not just a role — I update one policy class or registration block, not twelve attributes.

## Claims at login time, not ad-hoc in controllers

Whether you use ASP.NET Core Identity, IdentityServer, or a legacy staff table from an acquired clinic system, the rule is the same: **materialize roles and tenant scope into claims when the token is issued.**

Typical claims I emit for multi-tenant healthcare APIs:

- `sub` — user id
- `tenant_id` or `clinic_id` — scope for row-level checks
- `role` — one or more role claims
- optional `permission` claims when roles get too coarse

Controllers and policies read claims. They do not query the staff table on every request to rediscover whether someone is still a ClinicAdmin after a demotion yesterday.

For IdentityServer integrations, I align API resource scopes with what the Angular app requests at login. Missing scope at token issuance is easier to catch in staging than as a mysterious 403 in production.

## Tenant and resource checks are not optional

Role alone is insufficient in healthcare and marketplace admin portals.

A user with role Physician must not read patients outside their clinic. A CarBazaar vendor admin must mutate only their own listings. RBAC answers "what kind of user?" Resource checks answer "may this user touch this row?"

Pattern I repeat:

1. Authorize the policy for the action type (`ViewClinicalRecords`)
2. Load the resource
3. Verify tenant/clinic/vendor ownership against claims
4. Execute the command

```csharp
[Authorize(Policy = "ViewClinicalRecords")]
[HttpGet("patients/{id:guid}")]
public async Task<IActionResult> GetPatient(Guid id, CancellationToken ct)
{
    var patient = await _patients.GetByIdAsync(id, ct);
    if (patient is null) return NotFound();

    var auth = await _authorization.AuthorizeAsync(
        User, patient, "SameClinicAsPatient");

    return auth.Succeeded ? Ok(patient) : Forbid();
}
```

Register `SameClinicAsPatient` with a requirement handler that compares `clinic_id` from the token to the patient's clinic. Keep that logic out of the controller body.

Never trust `clinicId` from the request body over the token claim for authorization decisions. Body values are input; claims are identity.

## Policies over scattered roles: migration approach

On brownfield APIs I audit before adding features:

1. List every `[Authorize]` attribute and inline `User.IsInRole` call
2. Group by business capability (user management, billing, clinical read, exports)
3. Create one policy per capability
4. Replace attributes incrementally, starting with highest-risk endpoints (exports, bulk delete, cross-tenant search)
5. Add integration tests for 401/403 paths per policy

This migration is boring work clients appreciate during security reviews. A spreadsheet of endpoints vs policies becomes the UAT role matrix stakeholders can sign off on.

## Permission claims when roles become blunt

Pure RBAC breaks when BillingStaff in Tenant A may refund but BillingStaff in Tenant B may only view invoices.

Options:

- Split roles (`BillingStaffRefund`, `BillingStaffReadOnly`) — works for small matrices
- Add permission claims assigned through roles — scales better
- Combine: roles for assignment UI, permissions for policy evaluation

```csharp
options.AddPolicy("RefundInvoices", policy =>
    policy.RequireClaim("permission", "billing.refund"));
```

Admin screens in Angular load role-permission mappings from the API. Hard-coding permission strings only in the SPA guarantees drift. The server remains authoritative; Angular hides buttons for UX.

## JWT snapshots vs live role changes

Roles live in the database. JWTs are snapshots. Demote a ClinicAdmin to ReadOnlyAuditor and their access token may still carry the old role until expiry.

Mitigations by risk level:

- Short access token lifetime (5–15 minutes) for admin portals
- Server-side security stamp or token version claim invalidated on role change
- Refresh token revocation when privileged roles are removed

For healthcare admin changes, I prefer forced re-authentication or revocation over waiting an hour for natural expiry. Audit logs for role changes matter as much as the code path.

## Angular mirrors RBAC; it does not enforce it

The API is the gate. Angular improves experience:

- Route guards driven by roles or permissions from token or `/me`
- `*ngIf` on destructive actions
- Graceful 403 pages when someone bookmarks a forbidden URL

The freelance failure mode: a guard blocks a route while the API endpoint remains open. That is decoration, not security. I verify Swagger and direct curl calls after wiring guards.

Centralize helpers:

```typescript
hasPolicy(permission: string): boolean {
  return this.permissions.includes(permission);
}
```

Feature modules should not each parse JWT payloads differently.

## Testing authorization as deliverable work

I ship authz tests with feature work:

- Anonymous → 401
- Authenticated wrong role → 403
- Correct role wrong tenant → 403
- Correct role correct tenant → success

Also test side doors: file download links, SignalR hubs, background export endpoints, and admin search that returns cross-tenant rows if mis-filtered. Those paths often lag behind main CRUD authorization.

On Azure deployments, I confirm staging uses the same policy names as production so configuration drift does not hide missing `[Authorize]` after slot swap.

## Operational habits clients remember

- Log authorization failures with user id, policy name, resource id — not sensitive payloads
- Document roles in plain language for UAT ("ClinicAdmin can register providers but cannot view clinical notes")
- Give support a view of effective roles and claims for a user account
- Review policy registration in code review like you review database migrations

Regulated environments treat role change audit trails as a feature, not paperwork.

## Closing

RBAC stays maintainable in ASP.NET Core when you name policies after business capabilities, issue consistent claims at login, combine role policies with tenant resource handlers, and treat Angular as a reflection of server rules — not the security boundary. Replace scattered role strings early; add permission claims when roles get blunt; test 403 paths as seriously as happy paths.

## If an interviewer asks

**"Policies vs [Authorize(Roles)] — when do you switch?"**

**Strong answer:** Named policies from day one on any app that will grow past two roles. Policies group business capabilities (`ManageProviderRegistration`) in one registration block. When requirements change, you update one policy — not twelve controller attributes.

**"How do you handle JWT role snapshots after a demotion?"**

**Strong answer:** Short access token TTL (5–15 minutes), refresh revocation on role change, or a security stamp / token version claim invalidated on demotion. For privileged role removal in healthcare, force re-authentication rather than waiting for natural expiry.

**"Does hiding a button in Angular enforce RBAC?"**

**Strong answer:** No. UI hiding is UX. Verify with curl/Swagger that the API returns 403 for wrong roles. The guard blocking a route while the endpoint is `[AllowAnonymous]` is decoration, not security.


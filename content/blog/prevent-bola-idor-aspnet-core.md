---
title: "Prevent BOLA/IDOR in ASP.NET Core: Object-Level Authorization"
description: "Prevent BOLA/IDOR in ASP.NET Core with object-level authorization — ownership checks, IAuthorizationService resource handlers, list-endpoint filters, and cross-tenant id defenses. Complements the RBAC policies guide; does not rewrite roles."
date: "2026-10-01"
category: "security"
tags: ["ASP.NET Core", "BOLA", "IDOR", "Authorization", "Security"]
related:
  - aspnet-core-rbac-guide
  - aspnet-core-jwt-auth
  - ef-core-global-query-filters-soft-delete
  - aspnet-core-webapplicationfactory
  - aspnet-core-401-vs-403
faq:
  - q: "What is BOLA/IDOR in ASP.NET Core?"
    a: "Broken Object Level Authorization (BOLA), also called IDOR, is when an authenticated user can read or change another user's object by swapping an id in the URL or body. Role checks alone do not stop it — you must authorize the resource instance."
  - q: "How is BOLA different from RBAC?"
    a: "RBAC answers what kind of user may perform an action type. Object-level authorization answers whether this user may touch this row. You need both in multi-tenant and healthcare APIs."
  - q: "Is an EF global query filter enough to stop IDOR?"
    a: "No. Filters help and can be bypassed with IgnoreQueryFilters. Always authorize the loaded resource (or fail closed) in the application layer."
---

**Preventing BOLA/IDOR in ASP.NET Core** means every `{id}` route loads a resource and proves the caller may access that instance — not merely that they have a role that can access some instances.

```text
GET /api/patients/{id}
   |
   v
Authenticate JWT --> Policy for action type --> Load resource
   --> Authorize resource (tenant/owner) --> Project DTO
         fail --> 403 Forbid or 404
```

Metaphor: RBAC is the **job title on your badge**. Object-level auth is the **room number on the chart**. A physician badge does not open every patient room in the building.

**New to this** stay here for ownership patterns. **Roles and policies** see [RBAC guide](/blog/aspnet-core-rbac-guide). **JWT** see [JWT auth](/blog/aspnet-core-jwt-auth). **401 vs 403** see [401 vs 403](/blog/aspnet-core-401-vs-403).

Search intent for **bola broken object level authorization asp.net core** is how-to: ownership checks and list defenses that stop horizontal privilege bugs.

## BOLA/IDOR vs role checks: the confusion that causes breaches

Teams ship `[Authorize(Roles = "Physician")]` and believe the API is safe. Attackers then:

1. Log in as a valid physician.
2. Enumerate `/api/patients/1`, `/api/patients/2`, ...
3. Read charts from other clinics when ids are not scoped.

OWASP API1 is exactly this class. Your Angular UI may only show "my patients," but the API is the security boundary — UI hiding is courtesy.

## Dangerous vs safe controller examples

Dangerous:

```csharp
[Authorize(Roles = "Physician")]
[HttpGet("{id:guid}")]
public async Task<IActionResult> Get(Guid id, AppDbContext db, CancellationToken ct)
{
    var patient = await db.Patients.FindAsync([id], ct);
    return patient is null ? NotFound() : Ok(patient); // any physician, any patient
}
```

Safer:

```csharp
[Authorize(Policy = "ViewClinicalRecords")]
[HttpGet("{id:guid}")]
public async Task<IActionResult> Get(
    Guid id,
    IPatientStore store,
    IAuthorizationService authz,
    CancellationToken ct)
{
    var patient = await store.FindAsync(id, ct);
    if (patient is null) return NotFound();

    var result = await authz.AuthorizeAsync(User, patient, "PatientRead");
    if (!result.Succeeded) return Forbid(); // or NotFound() per oracle policy

    return Ok(PatientDto.From(patient));
}
```

Never return EF entities — project DTOs so internal fields do not leak even after auth passes.

## Load-then-authorize with IAuthorizationService

Pattern I repeat on mutate and read:

1. Authorize the **action policy** (ManageAppointments).
2. Load the entity by id.
3. Authorize the **resource** (AppointmentEdit requirement).
4. Execute the command.
5. Return DTO.

```csharp
public sealed class PatientOwnerHandler
    : AuthorizationHandler<PatientOwnerRequirement, Patient>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        PatientOwnerRequirement requirement,
        Patient patient)
    {
        var clinic = context.User.FindFirst("clinic_id")?.Value;
        if (clinic is not null &&
            Guid.TryParse(clinic, out var clinicId) &&
            patient.ClinicId == clinicId)
        {
            context.Succeed(requirement);
        }
        return Task.CompletedTask;
    }
}

// Registration
builder.Services.AddSingleton<IAuthorizationHandler, PatientOwnerHandler>();
builder.Services.AddAuthorization(o =>
{
    o.AddPolicy("PatientRead", p =>
        p.AddRequirements(new PatientOwnerRequirement()));
});
```

Claims come from validated JWT at login — do not trust `X-Clinic-Id` headers from Angular ([JWT](/blog/aspnet-core-jwt-auth), [RBAC](/blog/aspnet-core-rbac-guide)).

## Resource-based handlers (preview)

Dedicated deep-dives on handler composition belong in a sibling post. Minimum bar here: one handler per resource decision that matters (patient read, appointment edit, invoice pay). Keep handlers small and unit-tested with mock ClaimsPrincipal.

## List endpoints: filter in query, never in UI only

BOLA is not only single-id routes. Lists leak too:

```csharp
// Dangerous: returns all clinics' patients to any physician
return await db.Patients.AsNoTracking().Take(100).ToListAsync(ct);

// Safer: scope in the query using claims
var clinicId = User.GetClinicId(); // extension that reads clinic_id claim
return await db.Patients.AsNoTracking()
    .Where(p => p.ClinicId == clinicId)
    .Take(100)
    .Select(p => PatientDto.FromEntity(p))
    .ToListAsync(ct);
```

EF global query filters help ([global query filters](/blog/ef-core-global-query-filters-soft-delete)) but:

- They can be ignored with `IgnoreQueryFilters()`.
- They do not replace explicit resource checks on single-id routes.
- They must be tested so a missing tenant claim fails closed, not open.

## Cross-tenant id guessing attacks

Guids slow naive enumeration; they do not stop leaks if an id is stolen from logs, emails, or another response. Sequential ints make scanning trivial — prefer opaque ids and still authorize.

Oracle policy: returning 404 for cross-tenant ids (instead of 403) reduces confirmation that an id exists. Pick one approach, document it, apply consistently.

## Angular DTO id exposure warnings

Angular will hold ids in route params and stores. That is normal. Warnings:

- Do not treat client-side filtering as authorization.
- Do not send `clinicId` from the client as the source of truth for scoping — use token claims.
- When displaying lists, still expect the API to refuse forged detail navigations.

## Tests that catch horizontal privilege bugs

Use WebApplicationFactory ([factory](/blog/aspnet-core-webapplicationfactory)) with two users:

```csharp
[Fact]
public async Task Physician_A_cannot_read_physician_B_patient()
{
    var clientA = factory.CreateClientForUser(userA);
    var patientB = await SeedPatientForAsync(userB);
    var res = await clientA.GetAsync($"/api/patients/{patientB.Id}");
    Assert.True(res.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.NotFound);
}
```

Add list tests: user A list endpoint never contains user B ids. These tests are worth more than another unit test on a DTO mapper.

## Checklist for every {id} route

1. Authentication required?
2. Action policy named and applied?
3. Resource loaded then authorized (or query inherently scoped)?
4. DTO projected (no EF entity)?
5. List sibling scoped the same way?
6. Abuse test with second tenant user exists?
7. 401 vs 403 vs 404 behavior documented?
8. Admin break-glass path explicit and audited?

## Pitfalls

- Checking ownership only on PUT, forgetting GET.
- Authorizing on a request body id while loading a different path id.
- Trusting query filters alone.
- Returning 200 with empty body on authz failure — confuse Angular.
- Logging patient ids with tokens in the same line without redaction.

## Verification

1. Two seeded clinics; swap ids; expect Forbid/NotFound.
2. Missing token → 401.
3. Wrong role, right clinic → 403 from policy.
4. List endpoint JSON contains only caller clinic ids (assert in test).
5. IgnoreQueryFilters call in a mistaken code path → caught by review checklist / test.

## Practitioner go-live order

1. Inventory all `{id}` routes.
2. Add resource policies for the top sensitive resources (PHI, payments, PII).
3. Fix lists next — they dump volume.
4. Add cross-tenant tests in CI.
5. Train the team: PR template checkbox for object auth.

## If an interviewer asks

**How do you prevent IDOR in ASP.NET Core?** Authenticate, authorize action policy, load resource, authorize resource against claims (tenant/owner), project DTO, test with a second user.

**Is RBAC enough?** No. RBAC is necessary but not object-safe by itself.


## Multi-tenant SaaS specifics

In marketplace and clinic SaaS, ownership is rarely a single `UserId` column. Common shapes:

| Resource | Ownership signal |
|---|---|
| Patient | ClinicId matches token clinic_id |
| Vendor listing | VendorId matches token vendor_id |
| Invoice | AccountId in caller allowed set |
| Platform admin | Separate policy; still audit |

Handlers should read the claim once via a small `ICurrentTenant` abstraction so claim type strings are not copy-pasted across handlers.

When a user can belong to multiple clinics, prefer an active clinic claim set at login or switch-clinic endpoint — still server-issued — over accepting clinicId from the request body as authoritative.

## PUT/PATCH body tampering

Attackers change path id to a resource they own and body foreign keys to resources they do not:

```json
PUT /api/appointments/{ownedId}
{ "patientId": "{victimPatientId}", "providerId": "..." }
```

Authorize every referenced resource or enforce foreign keys that cannot escape the tenant in the domain layer. Object auth on the appointment alone is insufficient if patientId can be swapped to another clinic patient.

## Soft delete and IDOR

Soft-deleted rows can still be IDOR probes. Decide: do deleted ids return 404 always, and do admins with IgnoreQueryFilters get a separate audited path? Global filters for soft delete ([filters post](/blog/ef-core-global-query-filters-soft-delete)) interact with authorization — write tests for deleted ids.

## Performance note

Load-then-authorize does an extra round trip versus a single filtered query. Prefer:

```csharp
var patient = await db.Patients.AsNoTracking()
    .FirstOrDefaultAsync(p => p.Id == id && p.ClinicId == clinicId, ct);
if (patient is null) return NotFound();
```

when the rule is a simple tenant equality. Use IAuthorizationService when rules compose (role OR ownership OR share grant). Do not skip auth for speed on PHI.

## Shared documents and break-glass

Healthcare break-glass ("emergency view") must be an explicit policy with audit row, time limit, and alerting — not a missing Where clause. If you add share links, treat the share grant as a resource requirement, not a query-string secret alone.

## Mapping to OWASP and STRIDE

BOLA is OWASP API1. In STRIDE terms it is primarily Elevation (horizontal) and Information disclosure. If you ran the STRIDE worksheet on appointment update, object auth is the mitigation ticket that must close before go-live.



## PR review cheat sheet

When reviewing an ASP.NET Core PR that touches a controller:

1. Is there an `{id}` (or body id) without a tenant/owner predicate or resource authorize call?
2. Does a new list endpoint return `DbSet` without a clinic filter?
3. Are tests updated with a second-user negative case?
4. Did anyone add `IgnoreQueryFilters` without a comment and admin policy?

If the answer to 1 or 2 is yes, request changes before merge. BOLA is rarely a "follow-up ticket" problem — it is a ship blocker for clinical and billing data.

## Summary for practitioners

RBAC policies decide whether a Physician may view clinical records at all. Object-level authorization decides whether *this* Physician may view *this* patient. Hang both locks. Angular will never be able to close the second lock for you.



## Minimal API equivalent

The same rules apply outside controllers:

```csharp
group.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal user, IPatientStore store, IAuthorizationService authz, CancellationToken ct) =>
{
    var patient = await store.FindAsync(id, ct);
    if (patient is null) return Results.NotFound();
    var auth = await authz.AuthorizeAsync(user, patient, "PatientRead");
    return auth.Succeeded ? Results.Ok(PatientDto.From(patient)) : Results.Forbid();
}).RequireAuthorization("ViewClinicalRecords");
```

Minimal APIs make it easy to forget authorization in the chain of lambdas — RequireAuthorization plus resource checks are still mandatory. Pair with Problem Details for Forbid/NotFound consistency when you standardize error bodies.

With those habits, BOLA stops being an abstract OWASP acronym and becomes a boring checklist on every id route.


## Related

**Related:** [RBAC](/blog/aspnet-core-rbac-guide) · [JWT](/blog/aspnet-core-jwt-auth) · [Query filters](/blog/ef-core-global-query-filters-soft-delete) · [WebApplicationFactory](/blog/aspnet-core-webapplicationfactory) · [401 vs 403](/blog/aspnet-core-401-vs-403)

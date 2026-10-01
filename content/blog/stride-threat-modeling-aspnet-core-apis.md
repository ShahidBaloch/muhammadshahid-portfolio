---
title: "STRIDE Threat Modeling for ASP.NET Core REST APIs"
description: "Lightweight STRIDE threat modeling for ASP.NET Core REST APIs — walk Spoofing through Elevation on an Angular-facing clinic appointment endpoint, map mitigations to JWT, RBAC, validation, rate limits, and a reusable worksheet. Not enterprise GRC fluff."
date: "2026-10-01"
category: "security"
tags: ["ASP.NET Core", "STRIDE", "Threat Modeling", "API Security", "Angular"]
related:
  - aspnet-core-jwt-auth
  - aspnet-core-rbac-guide
  - aspnet-core-api-validation
  - idempotency-key-aspnet-core
  - aspnet-core-rate-limiting
faq:
  - q: "What is STRIDE threat modeling for ASP.NET Core APIs?"
    a: "STRIDE is a mnemonic — Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege — used to ask structured abuse questions about an endpoint before you ship. You map each finding to concrete ASP.NET Core controls."
  - q: "Do I need enterprise GRC tooling to do STRIDE?"
    a: "No. A one-page worksheet on a representative Angular-facing endpoint, done in a one-hour review, catches most design misses. Heavyweight tooling is optional later."
  - q: "How is STRIDE different from OWASP API Top 10 checklists?"
    a: "OWASP ranks common failures. STRIDE is a thinking frame you apply to *your* data flow. Use both: STRIDE while designing; OWASP when auditing."
---

**STRIDE threat modeling for ASP.NET Core REST APIs** means walking a real Angular-facing endpoint through six abuse categories and writing down mitigations you can implement with JWT, policies, validation, and rate limits — before production traffic finds the gaps.

```text
Angular SPA ──HTTPS──► ASP.NET Core API ──► EF Core / SQL
                │
         STRIDE questions per hop
         S T R I D E → mitigations → tests
```

Metaphor: STRIDE is a **pre-flight checklist**, not a 200-page security novel. Pilots still fly; they just do not skip the flaps.

**New to this** → stay here for the walkthrough. **JWT** → [JWT auth](/blog/aspnet-core-jwt-auth). **Policies** → [RBAC](/blog/aspnet-core-rbac-guide). **Validation** → [API validation](/blog/aspnet-core-api-validation). **Abuse volume** → [rate limiting](/blog/aspnet-core-rate-limiting).

Search intent for **stride threat modeling api asp.net core** is a practical how-to on an API shape teams actually ship.

## STRIDE in one page for API teams

| Letter | Question in API language | Typical ASP.NET Core levers |
|---|---|---|
| **S**poofing | Can someone pretend to be another user or service? | JWT validation, HTTPS, mTLS for service callers |
| **T**ampering | Can someone alter path, query, or body undetected? | TLS, signatures, antiforgery where cookies, immutable audit fields |
| **R**epudiation | Can someone deny they performed an action? | Authn identity in logs, correlation ids, append-only audit |
| **I**nformation disclosure | Can someone read data they should not? | Object authZ, DTO projection, PII redaction |
| **D**enial of service | Can someone exhaust CPU/DB/connections? | Rate limits, pagination caps, timeouts, complexity limits |
| **E**levation of privilege | Can someone gain admin or cross-tenant power? | Policies, separate admin routes, deny-by-default |

You do not need a special Microsoft Threat Modeling Tool session to start. Whiteboard + endpoint + this table is enough for SSDLC “design review” gates on small teams.

## Pick a representative Angular-facing endpoint

We will model:

```http
PUT /api/clinics/{clinicId}/appointments/{appointmentId}
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "startsAtUtc": "2026-10-02T09:00:00Z",
  "providerId": "…",
  "reason": "Follow-up"
}
```

Actors: Patient portal user, ClinicAdmin, anonymous attacker with a stolen token, automated scraper.

Data flow: Angular → API → authorization → domain command → EF Core → SQL → (optional) notification outbox.

Why this endpoint: it mutates schedule state, touches provider ids, and is a classic BOLA target if `appointmentId` is guessable across clinics.

## Spoofing

**Threats**

- Stolen Bearer token replayed from another device.
- Algorithm confusion / bad JWT validation (`HandleSymmetricJwkOnly` mistakes, missing audience).
- Calling the API without TLS in a misconfigured environment.

**Mitigations**

- Validate issuer, audience, lifetime, signing keys per [JWT checklist](/blog/aspnet-core-jwt-auth).
- Short-lived access tokens + refresh rotation.
- HTTPS only; HSTS at the edge.
- For service-to-service, prefer managed identity / separate client credentials — not the user’s SPA token reused on a worker.

**Note on Angular:** storing access tokens in `localStorage` increases XSS blast radius; BFF/cookie patterns change spoofing notes — pointer only here.

## Tampering

**Threats**

- Changing `clinicId` in the path while keeping a token for another clinic.
- Flipping `providerId` to steal another clinician’s slot.
- Replaying an old JSON body (schedule change after cancel).

**Mitigations**

- Resource authorization after load: appointment must belong to `clinicId` and caller’s tenant ([RBAC](/blog/aspnet-core-rbac-guide) + object checks).
- FluentValidation / DataAnnotations on ranges and allowed status transitions ([validation](/blog/aspnet-core-api-validation)).
- Idempotency keys for retried PUTs from flaky mobile networks ([idempotency](/blog/idempotency-key-aspnet-core)).
- Optimistic concurrency token on appointment row (EF concurrency) so silent overwrites fail loudly.

```csharp
[Authorize(Policy = "ManageAppointments")]
[HttpPut("{appointmentId:guid}")]
public async Task<IActionResult> Update(
    Guid clinicId,
    Guid appointmentId,
    UpdateAppointmentRequest body,
    CancellationToken ct)
{
    var appt = await _store.GetAsync(appointmentId, ct);
    if (appt is null || appt.ClinicId != clinicId) return NotFound();

    var auth = await _authz.AuthorizeAsync(User, appt, "AppointmentEdit");
    if (!auth.Succeeded) return Forbid();

    // domain update + concurrency stamp...
    return Ok(AppointmentDto.From(appt));
}
```

## Repudiation

**Threats**

- Admin claims they never changed an appointment; logs cannot prove who did.
- Shared service accounts in logs erase human accountability.

**Mitigations**

- Log `sub`, `clinic_id`, correlation id, appointment id, before/after status (no clinical free-text if PII policy forbids).
- Append-only audit table written in the same transaction as the update when regulations demand it.
- Prefer user tokens over long-lived shared secrets for interactive admin actions.

Structured log that satisfies a repudiation review:

```csharp
_logger.LogInformation(
    "AppointmentRescheduled by {Sub} for clinic {ClinicId}: " +
    "appointment {AppointmentId} {OldStatus}→{NewStatus} | corr:{CorrelationId}",
    User.FindFirstValue("sub"),
    clinicId,
    appointment.Id,
    oldStatus,
    appointment.Status,
    HttpContext.TraceIdentifier);
```

For regulatory append-only audit (HIPAA audit log pattern):

```csharp
// Inside the same EF SaveChanges transaction
_context.AuditEvents.Add(new AuditEvent
{
    Subject       = User.FindFirstValue("sub"),
    ClinicId      = clinicId,
    ResourceId    = appointment.Id.ToString(),
    Action        = "AppointmentRescheduled",
    OldValue      = JsonSerializer.Serialize(snapshot),   // before-state DTO
    OccurredAtUtc = DateTime.UtcNow,
    CorrelationId = HttpContext.TraceIdentifier
});
await _context.SaveChangesAsync(ct);  // audit + entity in one commit
```

Key point: the `sub` claim comes from the validated JWT, not from a client-supplied header. A shared service account makes every action look identical in logs — use separate Entra/OIDC identities for admins.

## Information disclosure

**Threats**

- `404` vs `403` timing/oracle on cross-clinic ids (product decision: often return 404 for non-visible resources).
- ProblemDetails stack traces in production.
- Over-broad GET DTO including internal cost fields.
- Verbose Swagger in production.

**Mitigations**

- Project DTOs explicitly; never return EF entities.
- Production exception handler → ProblemDetails without secrets ([global exception](/blog/aspnet-core-global-exception-handling)).
- Object-level checks before returning bodies.
- Disable public Swagger in prod or protect it.

## Denial of service

**Threats**

- Scripted PUT loops locking appointment rows.
- Unbounded search endpoints (sibling of this PUT) scanning with heavy includes.
- Huge JSON bodies.

**Mitigations**

- [Rate limiting](/blog/aspnet-core-rate-limiting) per user and per IP on mutate routes.
- Request body size limits; pagination mandatory on lists.
- Timeouts and cancellation tokens through EF calls.
- Circuits around notification side effects.

## Elevation of privilege

**Threats**

- Patient token calling ClinicAdmin-only reschedule window override.
- Horizontal privilege: User A reschedules User B’s appointment by id (BOLA).
- Vertical: role claim manipulated if you trust unsigned client headers (`X-Role: Admin` — never).

**Mitigations**

- Named policies for action types; resource handlers for ownership.
- Ignore client-supplied roles; take roles from validated token claims only.
- Separate admin API surface when risk warrants.
- Tests that attempt cross-tenant appointment ids expect Forbid/NotFound.

## Map findings to existing portfolio controls

| STRIDE finding (example) | Portfolio control |
|---|---|
| Spoofed Bearer | JWT auth guide |
| Cross-clinic tampering | RBAC + BOLA/object auth post |
| Fat error payloads | Global exception / ProblemDetails |
| PUT storms | Rate limiting |
| Replay double-book | Idempotency keys |
| Bad input ranges | API validation |

STRIDE does not replace these posts — it tells you **which** to apply on this flow.

## Worksheet template you can reuse

Copy per endpoint:

```text
Endpoint: ________________________________
AuthN: ___________________________________
Trusted callers: _________________________

Spoofing risks / mitigations:
-

Tampering risks / mitigations:
-

Repudiation risks / mitigations:
-

Info disclosure risks / mitigations:
-

DoS risks / mitigations:
-

Elevation risks / mitigations:
-

Tests to add:
-
Open questions / accept risk:
-
```

Time-box: 45–60 minutes with API + Angular + one security-minded reviewer.

## How STRIDE feeds SSDLC gates (pointer)

Lightweight SSDLC: design review uses this worksheet; code review checks mitigations exist; QA adds abuse cases; release checks Swagger exposure and rate limits. Full SSDLC program design is a sibling topic — do not block shipping on tooling procurement.

## Pitfalls

- **Boiling the ocean** — model one critical flow well before cataloging every microservice.
- **Paper STRIDE** — findings with no backlog tickets.
- **Trusting Angular validators** as tamper resistance.
- **Confusing 401 and 403** — spoofing vs elevation symptoms differ ([401 vs 403](/blog/aspnet-core-401-vs-403)).

## Verification

1. Attempt PUT with token from clinic A on clinic B’s appointment → NotFound or Forbid.
2. Attempt without Bearer → 401.
3. Attempt with Patient role on admin-only field → 403.
4. Burst 1000 PUTs → rate limit engages.
5. Force validation failure → ProblemDetails, no stack trace in prod config.
6. Confirm audit row written for successful update (if in scope).

## Practitioner checklist

1. Pick top 3 mutate endpoints and 2 sensitive GETs.
2. Run STRIDE worksheet once each.
3. File tickets for missing object auth, rate limits, audit gaps.
4. Add at least one automated abuse test per Elevation/Tampering finding.
5. Revisit after major auth changes.

## If an interviewer asks

**"How do you threat model an API?"**  
Identify actors and data flow, apply STRIDE per trust boundary, map to framework controls, track mitigations as work items, verify with abuse tests.

**"STRIDE vs DREAD?"**  
STRIDE categorizes threats; DREAD scores them. Start with STRIDE categories; score only if you need prioritization theater for leadership.


## Example findings → tickets

From the appointment PUT walkthrough, a realistic backlog:

1. Add resource authorization handler for AppointmentEdit (Elevation/Tampering).
2. Add rate limit policy `appointments-mutate` (DoS).
3. Emit audit row with sub + appointment id (Repudiation).
4. Ensure Production ProblemDetails hide EF messages (Info disclosure).
5. Add idempotency key support on reschedule (Tampering/replay).

Each ticket links back to the worksheet section so auditors see design → mitigation traceability without a GRC platform.

## Facilitator tips for a one-hour session

- Bring one sequence diagram, not five.
- Ban tooling debates in the first session.
- Capture "accept risk" explicitly when product refuses a mitigation.
- Schedule a 20-minute follow-up after tickets land to re-test abuse cases.



## Relating STRIDE output to Angular trust boundaries

Remind the room: Angular validation, route guards, and *ngIf are not mitigations for Tampering or Elevation on the API. List them under "UX controls" if you want, but every STRIDE mitigation that matters must land in ASP.NET Core or infrastructure. That single reminder prevents half the false comfort I see in design reviews.

Also record which endpoints are anonymous (health, JWKS, marketing lead forms) so Spoofing discussions do not assume Bearer everywhere.



## After the workshop

Store the worksheet next to the endpoint's feature folder or in `/docs/threat-models/`. Link the PR that closed each mitigation. Six months later, when someone asks "did we ever threat model reschedule?", you have an answer that is not tribal memory.



That artifact, plus the abuse tests in CI, is enough SSDLC evidence for most product teams shipping ASP.NET Core + Angular without hiring a full-time threat modeling bureaucracy.


## Related

**Related:** [JWT auth](/blog/aspnet-core-jwt-auth) · [RBAC](/blog/aspnet-core-rbac-guide) · [Validation](/blog/aspnet-core-api-validation) · [Idempotency](/blog/idempotency-key-aspnet-core) · [Rate limiting](/blog/aspnet-core-rate-limiting)

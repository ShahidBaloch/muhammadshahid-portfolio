---
title: "Freelance .NET + Angular Project Checklist Before You Start"
description: "A discovery-to-acceptance checklist for freelance ASP.NET Core and Angular client engagements — scope, auth, hosting, and handoff criteria that prevent costly surprises."
date: "2026-07-28"
category: "architecture"
tags: ["Freelance", ".NET", "Angular", "Delivery"]
---

The cheapest hour on a freelance .NET + Angular project is the hour you spend clarifying scope before writing code. The most expensive week is the one where you discover — after building half the admin portal — that the client expected Azure AD login, HIPAA-friendly audit logs, and a deployment pipeline nobody mentioned in the kickoff call.

I have taken engagements across healthcare SaaS modules, eCommerce platforms like Ecom_NET10, and marketplace architectures like CarBazaar. The tech stacks rhyme; the failure modes repeat. This checklist is what I run through before signing a statement of work or pushing the first commit. It is written for freelancers and for clients hiring them — either side can use it to align expectations.

## Phase 1: Discovery — understand the job, not just the stack

### Outcome over inventory

"Build an Angular frontend and .NET API" is an inventory. An outcome sounds like:

- Sellers can list vehicles and buyers can bid without double-selling the same lot.
- Clinic staff can register providers and attach active fee schedules before go-live.
- Customers can browse, cart, and checkout with role-based admin for catalog management.

Write the outcome in the client's words. If two stakeholders describe different outcomes, resolve that before estimating.

### Users, roles, and the first vertical slice

Document:

| Question | Why it matters |
|----------|----------------|
| Who logs in on day one? | Drives auth scope and test accounts |
| What is the first end-to-end workflow? | Defines phase boundary |
| What is explicitly out of scope? | Prevents silent scope creep |
| Who accepts the release? | One named decision maker |

Propose a thin vertical slice: auth for real roles, one or two core workflows, minimal admin to operate them, deployed environment the client can click. Everything else is phase two until phase one is accepted.

### Existing systems and constraints

Ask what already exists:

- Legacy database you must integrate with — or greenfield?
- Corporate SSO (Azure AD, Okta) mandated?
- Cloud preference or lock-in (Azure, AWS, on-prem)?
- Source control and CI owned by client or you?

Healthcare and enterprise clients often have non-negotiable infrastructure. Discover that in discovery, not in week four.

## Phase 2: Scope — freeze boundaries and deliverables

### Written deliverable list

Every engagement should have bullet-level deliverables tied to the vertical slice:

- ASP.NET Core API with documented OpenAPI
- Angular SPA with agreed routes for in-scope features
- Auth flow (JWT, OAuth, or SSO) per written spec
- Deployment to agreed environment
- Handoff document and test account matrix

Avoid "implement best practices" as a line item. Name the practices: RBAC policies, pagination standard, error envelope, etc.

### Change control in plain language

Tell the client how scope changes work:

- Small tweaks inside the slice — discuss in standup
- New workflows or integrations — change request with time/cost estimate
- "Just one more role" often means new policies, tests, and UI — not a five-minute task

Clients respect freelancers who explain tradeoffs. They lose trust when surprises appear as invoice line items without warning.

### Acceptance criteria before build

For each workflow, define **done** in testable terms:

- Given a merchandiser role, when I deactivate a product, then it disappears from public catalog within one API call.
- Given an expired refresh token, when the SPA calls a protected endpoint, then the user is routed to login without an infinite retry loop.

Acceptance criteria are how you end debates at demo time.

## Phase 3: Auth — nail the security story early

Auth is where freelance projects bleed time. Lock these decisions in writing:

- [ ] Identity model: local users, Azure AD, IdentityServer, social login?
- [ ] Token strategy: JWT access + refresh, cookie session, hybrid?
- [ ] Role and policy matrix: who can do what on which resources?
- [ ] Secret storage: Key Vault, environment variables — never repo
- [ ] Logout and revocation behavior documented
- [ ] CORS and cookie rules for Angular ↔ API in dev and prod

For marketplace or multi-API work (CarBazaar-style), clarify whether you are building a central identity service or embedding auth in one API. That decision ripples through every estimate.

Healthcare-adjacent work: confirm PHI handling, audit requirements, and what must **not** appear in logs or JWT claims. Do not improvise compliance language.

## Phase 4: Hosting and environments

### Minimum environment plan

| Environment | Owner | Purpose |
|-------------|-------|---------|
| Local | Developer | Daily work |
| Staging | Client or you | Demos and UAT |
| Production | Client | Live users |

Clarify who pays for Azure/AWS resources, who holds admin credentials, and whether you get contributor access or deploy via pipeline only.

### Deployment and rollback

Before phase one ends, the client should see:

- Repeatable deploy steps (script, GitHub Action, Azure DevOps — pick one)
- Connection strings and secrets outside source control
- Health check endpoint for the API
- Staging URL the stakeholder bookmarked

If "deploy" means FTP to shared hosting, know that early — it changes how you structure Angular builds and API hosting.

### Domain, SSL, and email

Small items that block go-live:

- Custom domain and TLS certificate ownership
- SMTP or SendGrid for transactional email
- Blob storage for uploads (Azure Blob, S3)

I list these as client-provided or freelancer-delivered in the SOW so nobody assumes "it comes free with Azure."

## Phase 5: Data, integrations, and access

### Access checklist (week zero)

You cannot progress without:

- [ ] Repository access (or greenfield repo created)
- [ ] Database connection or permission to provision dev DB
- [ ] VPN or IP allowlist if required
- [ ] Design assets or component library reference
- [ ] Sample anonymized data for realistic dev — **never** production PHI dumps on laptops

### Third-party integrations

Payment gateways, eligibility APIs, search indexes — each needs:

- Sandbox credentials
- Documented rate limits
- Owner on the client side for API key rotation
- Fallback behavior when the integration is down

Estimate integrations separately. They dominate risk.

## Phase 6: Communication and delivery rhythm

### Cadence that matches risk

- Weekly demo or async Loom for stakeholders
- Shared backlog both sides can see
- Single chat channel for quick questions; email for scope changes
- Response time expectations (e.g., client feedback within 48h on PRs)

Freelance does not mean silent. The best clients I have kept are the ones who saw working software every week, even when the week was humble.

### Documentation deliverables

Plan to hand off:

- Architecture sketch (monolith vs services, main projects)
- Auth flow diagram
- Environment variable table
- OpenAPI URL or export
- Test users per role
- Known limitations and recommended phase two items

This is how you get referrals. Clients remember freelancers who made them independent.

## Phase 7: Acceptance and payment alignment

### Definition of done for the engagement

 Tie payment milestones to accepted deliverables, not vibes:

1. **Milestone A** — Auth + first workflow on staging, accepted
2. **Milestone B** — Admin + remaining in-scope features, accepted
3. **Milestone C** — Production deploy + handoff doc, accepted

Acceptance period in writing (e.g., five business days to report blocking issues). Define what "blocking" means.

### What you retain vs hand off

Clarify IP ownership, license to reuse generic utilities, and whether you offer retainer support after launch. Ambiguity here ends friendships.

### Post-launch boundary

State whether production support, on-call, and bug fixes are included for a window (e.g., 14 days) and what hourly rate applies after. Healthcare and eCommerce clients assume someone is watching after launch — say if that someone is you and on what terms.

## Red flags that should pause the start date

- "We will figure out auth later."
- No single decision maker for acceptance
- Refusal to provide staging infrastructure
- Scope that equals three products but budget that equals one sprint
- Requirement to use production data on developer machines
- Verbal promise of "more work after this" with no phase two budget

Pausing is not unprofessional. Starting blind is.

## Quick reference: one-page kickoff table

Fill this with the client before code:

| Item | Agreed value |
|------|----------------|
| Primary outcome | |
| Vertical slice | |
| Out of scope | |
| Auth approach | |
| Hosting / cloud | |
| Acceptance owner | |
| Milestones | |
| First demo date | |

---

Freelance .NET and Angular work is most successful when both sides treat discovery as part of delivery — not a formality before the "real" coding starts. I use this checklist on every engagement, from storefront APIs to healthcare admin modules.

If you are planning a client project and want a second pair of eyes on scope, auth, or architecture before commitments harden, [reach out](/contact). A focused review call is cheaper than a rework month.

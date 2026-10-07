---
title: "API Security and Threat Modeling for ASP.NET Core"
description: "ASP.NET Core API security guides: OWASP API Top 10, BOLA/IDOR, Content Security Policy for Angular, STRIDE threat modeling, and security headers from production healthcare and SaaS systems."
---

## Introduction

This page is the **article map** for securing ASP.NET Core APIs and Angular frontends against real-world attack vectors. Each linked article covers one attack class in depth — this index tells you which to open.

| You want… | Open |
|---|---|
| **OWASP API Top 10 mapped to .NET** | [OWASP API Security Top 10](/blog/owasp-api-security-top-10-aspnet-core) |
| **Preventing BOLA / IDOR access flaws** | [Prevent BOLA/IDOR in ASP.NET Core](/blog/prevent-bola-idor-aspnet-core) |
| **Nonce-based CSP for Angular SPAs** | [Content Security Policy for Angular](/blog/content-security-policy-angular-aspnet-core) |
| **Lightweight STRIDE threat modeling** | [STRIDE threat modeling for APIs](/blog/stride-threat-modeling-aspnet-core-apis) |
| **Security headers for Kestrel & reverse proxies** | [ASP.NET Core security headers](/blog/aspnet-core-security-headers) |
| **Data protection / XML encryption** | [ASP.NET Core data protection](/blog/aspnet-core-data-protection-xml-encryptor) |

Security controls belong in middleware, authorization handlers, and pipeline checks — not client-side assumptions.

## Mental model (two minutes)

Security on a .NET API is not a single switch. It is a **defence-in-depth stack**: identity tells you who the caller is, authorization decides what they may do, input validation rejects malformed data at the boundary, and security headers tell the browser what the page is allowed to load.

**The four questions for every new API endpoint:**

1. **Who can call it?** An unauthenticated endpoint that returns user-owned data is a BOLA (Broken Object Level Authorization) bug by default. Require authentication and check that the resource ID in the URL belongs to the caller. See [BOLA/IDOR prevention](/blog/prevent-bola-idor-aspnet-core).

2. **What can it receive?** Validate at the boundary. Use FluentValidation or data annotation attributes with a [global exception handler](/blog/aspnet-core-global-exception-handling) that returns [RFC 9457 Problem Details](/blog/rfc-9457-problem-details-aspnet-core). Do not trust any input from the client, including JWT claims you can forge by modifying the token without signature validation.

3. **What can the browser load?** A Content Security Policy blocks inline scripts and restricts which origins can load resources into your Angular SPA. Without a CSP, a single XSS payload on any page can exfiltrate tokens. See [CSP for Angular](/blog/content-security-policy-angular-aspnet-core).

4. **What attacks are plausible?** STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) gives a systematic taxonomy. A lightweight STRIDE pass on your API surface before deployment finds privilege escalation and repudiation gaps that code review misses. See [STRIDE threat modeling](/blog/stride-threat-modeling-aspnet-core-apis).

## OWASP API Top 10 mapped to .NET

The OWASP API Security Top 10 names the attack classes that cause most real-world API breaches. In the .NET context:

- **API1 – BOLA**: Row-level ownership checks in authorization handlers, not just `[Authorize]`. Every GET/PUT/DELETE by resource ID needs a `userId == resource.OwnerId` check.
- **API2 – Broken Authentication**: Validate JWT `kid`, `iss`, and `aud`. A misconfigured `TokenValidationParameters` that accepts any signing key is the most common .NET auth bug. See [JWT kid and IDX10501](/blog/aspnet-core-idx10501-jwt-kid).
- **API3 – Broken Object Property Level Authorization**: Mass assignment via model binding. Use input DTOs, not entity models, as controller parameters.
- **API8 – Security Misconfiguration**: Default ASP.NET Core configs expose detailed errors in production. Use `UseProblemDetails` and suppress stack traces. Set security headers. Remove the `Server` header.

Full mapping and code examples: [OWASP API Security Top 10 for ASP.NET Core](/blog/owasp-api-security-top-10-aspnet-core).

## Healthcare and SaaS-specific concerns

Healthcare APIs handle PHI (Protected Health Information). Logging entity snapshots, serializing claim graphs into Serilog, or writing audit trails with full row data are compliance incidents, not just code quality issues.

Key rules:
- Log entity type, ID, and state in audit interceptors — never the full graph. See [audit log interceptors](/blog/ef-core-interceptors-audit-log).
- Redact PII fields in Serilog with destructuring policies. See [Serilog PII redaction](/blog/serilog-pii-redaction-healthcare-aspnet-core).
- Use Azure Key Vault for secrets, not `appsettings.json`. See [Azure Key Vault integration](/blog/azure-key-vault-secrets-aspnet-core).

## What to read next

Start with [OWASP API Security Top 10](/blog/owasp-api-security-top-10-aspnet-core) for the complete vulnerability map. For identity-specific security (JWT validation, token rotation, IdentityServer), go to the [authentication hub](/learning/authentication) and [identity hub](/learning/identity).

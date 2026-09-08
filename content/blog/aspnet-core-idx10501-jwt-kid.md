---
title: "IDX10501 Unable to Match Key (kid) in ASP.NET Core JWT"
description: "Fix IDX10501 JWT kid mismatch in ASP.NET Core — token header kid not in JWKS, signing cert rotation overlap, Authority mismatch, and OpenIddict key refresh."
date: "2026-09-08"
category: "authentication"
tags: ["JWT", "ASP.NET Core", "Security", "IdentityServer", "OpenIddict"]
related:
  - aspnet-core-idx10503-jwt-signature
  - aspnet-core-jwt-auth
  - identityserver4-openiddict-migration-checklist
faq:
  - q: "What is IDX10501 in ASP.NET Core JWT?"
    a: "IDX10501 means IdentityModel found a kid on the token and none of the keys it loaded share that id. The signature algorithm is not the first question — the key set is."
  - q: "Is IDX10501 the same as IDX10503?"
    a: "No. IDX10503 is “I tried these keys and the signature still failed” (wrong secret, no kid, disposed RSA). IDX10501 is “I cannot even pick a key because the kid is missing from JWKS.”"
  - q: "Should I add a kid header to fix IDX10501?"
    a: "Only if the issuer actually signs with a key that publishes that kid. Inventing a kid on the API side does nothing. Fix the signing credential overlap or the Authority that downloads JWKS."
---

**IDX10501** means IdentityModel read a `kid` in the JWT header but found no matching key in JWKS or `TokenValidationParameters` — the key set and the token disagree before signature verification even runs.

```text
JWT header: kid = A1B2C3D4
                │
                ▼
         Load JWKS from Authority
                │
    keys: [X9Y8Z7]  ──► no match ──► IDX10501
```

Picture a **locksmith with a key ring**: the token says "I need key #A1B2C3D4." JWKS only has key #X9Y8Z7. That is IDX10501 — wrong key on the ring. IDX10503 is when the right key is on the ring but the cut does not turn.

**New to this** → stay here. **Signature failed after key match** → [IDX10503](/blog/aspnet-core-idx10503-jwt-signature). **JWT setup** → [ASP.NET Core JWT checklist](/blog/aspnet-core-jwt-auth). **Interview prep** → [If an interviewer asks](#if-an-interviewer-asks).

## Read the kid before you rotate anything else

Typical Development log once PII is on:

```text
IDX10501: Signature validation failed. Unable to match key:
kid: 'A1B2C3D4'.
Number of keys in TokenValidationParameters: '0'.
Number of keys in Configuration: '1'.
```

Three facts:

1. The token **has** a `kid` — otherwise you usually see IDX10503 with “Token does not have a kid”
2. **Configuration** keys came from metadata (`Authority` / `MetadataAddress` → JWKS)
3. That JWKS id is **not** `A1B2C3D4`

Turn on PII only in Development: `IdentityModelEventSource.ShowPII = true`. Decode the access token header (not the refresh token) and compare `kid` to `https://{authority}/.well-known/openid-configuration` → `jwks_uri`.

## Cause 1: Signing credential rotated, validation keys did not overlap

Duende / OpenIddict: you replaced `AddSigningCredential(newCert)` and recycled the identity host. New tokens carry the new thumbprint. APIs that already downloaded JWKS keep the **old** set until `ConfigurationManager` refreshes. Angular still holds a token from five minutes ago *or* a brand-new token the cached JWKS cannot name.

Fix I actually ship:

- Publish **both** certificates during overlap: current signing credential plus `AddValidationKeys` (or OpenIddict’s validation key collection) for the previous cert
- Keep the old cert valid until access-token lifetime has passed (if access is 15 minutes, overlap at least that plus clock skew)
- Recycle **resource APIs** after the identity host, or wait for automatic refresh — do not assume every App Service instance fetched JWKS at the same second

This is not Data Protection key-ring XML. Signing certs for JWT are a different pile of keys than antiforgery cookies.

## Cause 2: Two identity hosts, one Angular memory

Staging IdentityServer on `login-test.example.com`, production API `Authority` still `https://login.example.com`. A developer signed in against test, then pointed the SPA at production APIs (or the reverse). The production JWKS never heard of the test `kid`.

Same shape: auction and search behind two OpenIddict containers that each generated a **dev certificate** on first boot because the shared cert volume was empty on one replica.

Fix: one issuer URL per environment, one signing material per issuer, tokens never cross. `Authority` on every `AddJwtBearer` must be the host that **issued** that access token.

## Cause 3: Azure AD / Entra tenant or app registration mismatch

`Authority = "https://login.microsoftonline.com/{wrong-tenant}/v2.0"` downloads a JWKS that will never contain the `kid` from tokens issued by the tenant the SPA actually uses. The error looks like “JWT is broken.” The tenant GUID is wrong.

Fix: copy tenant id and `aud` from a **real** token payload, not from a wiki page that still has the old directory. Audience mismatches are IDX10214 — if you already confirmed `aud` and still see IDX10501, the JWKS tenant is the remaining suspect.

## Cause 4: Metadata never loads, then a later request looks like IDX10501

If the API **cannot download** discovery, the first exception is usually **IDX20803 / IDX20807** (“Unable to obtain configuration” / “Unable to retrieve document”). Docker DNS, HTTP instead of HTTPS, a 404 on `/ .well-known/openid-configuration`, or App Service cannot reach the identity host.

I have seen a follow-up IDX10501 when someone “fixed” metadata by stuffing a **single** RSA key into `IssuerSigningKeys` that was not the key in the token. That is still a kid mismatch. Restore discovery, or load the JWKS document you actually serve.

Do not copy `IssuerSigningKey` from a symmetric `Jwt:Key` appsetting onto an API that is supposed to validate OpenIddict RS256 tokens. That path is how teams turn a metadata problem into a kid problem.

## What IDX10501 is not

| Log | Look here instead |
| --- | --- |
| IDX10503, “Token does not have a kid”, wrong HMAC secret, disposed RSA | [IDX10503](/blog/aspnet-core-idx10503-jwt-signature) |
| IDX20803 / IDX20807, cannot GET discovery or JWKS | Network, `Authority` URL, TLS, Docker DNS — then this page if a kid still will not match |
| IDX10214 / IDX10204 | `aud` / `iss`, not JWKS |
| No XML encryptor found | [Data Protection key ring](/blog/aspnet-core-data-protection-xml-encryptor) |
| 403 after a valid JWT | [401 vs 403](/blog/aspnet-core-401-vs-403) |

## Checklist I run in ten minutes

1. Decode the **access** token header — copy `kid` and `alg`
2. Open the issuer’s JWKS (from discovery `jwks_uri`). Is that `kid` listed?
3. If no: the issuer is not publishing the key it signed with — overlap certs, fix the replica’s empty cert volume, or wait out stale `ConfigurationManager` (recycle the API)
4. If yes on JWKS but IDX10501 on one API only: that API’s `Authority` is a different host or an old instance with a cached document
5. Enable PII in Development, reproduce once, turn it off
6. Leave HS256 `Jwt:Key` tutorials if `alg` is `RS256` / `PS256`

Leaving IdentityServer4? Signing keys on the new host are the [OpenIddict migration checklist](/blog/identityserver4-openiddict-migration-checklist) — after cutover, leftover IS4 tokens against OpenIddict JWKS are this error, not an audience essay.

## Related reading

- [IDX10503 JWT signature](/blog/aspnet-core-idx10503-jwt-signature)
- [ASP.NET Core JWT auth checklist](/blog/aspnet-core-jwt-auth)
- [IdentityServer4 to OpenIddict checklist](/blog/identityserver4-openiddict-migration-checklist)

## If an interviewer asks

**"What is the difference between IDX10501 and IDX10503?"**

**Strong answer:** IDX10501 — the token's `kid` is not in the loaded key set; key selection fails. IDX10503 — keys were tried and signature verification failed (wrong secret, disposed RSA, opaque token). Fix one error at a time; do not rotate signing keys for an audience mismatch.

**"How do you rotate signing certs without IDX10501?"**

**Strong answer:** Publish both old and new keys in JWKS during overlap. Keep the old cert until all issued access tokens expire plus clock skew. Recycle resource APIs after the identity host, or wait for `ConfigurationManager` refresh. Never rotate signing and validation on different schedules without overlap.

**"Token looks fine on jwt.io but API returns 401?"**

**Strong answer:** jwt.io may use a secret you typed, not the API's JWKS. Decode the header `kid`, fetch the issuer's `jwks_uri`, confirm that `kid` exists. If JWKS has it but one API fails, that API's `Authority` points at a different host or stale cached metadata.

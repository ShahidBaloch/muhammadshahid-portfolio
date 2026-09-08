---
title: "IDX10503 Signature Validation Failed in ASP.NET Core JWT"
description: "Fix IDX10503 JWT signature validation failed in ASP.NET Core — wrong HMAC secret, disposed RSA keys, opaque Identity tokens, and how it differs from IDX10501 kid mismatch."
date: "2026-09-07"
category: "authentication"
tags: ["JWT", "ASP.NET Core", "Security", "Angular", "Identity"]
related:
  - aspnet-core-idx10501-jwt-kid
  - aspnet-core-jwt-auth
  - mapidentityapi-opaque-token-vs-jwt
faq:
  - q: "What is IDX10503 in ASP.NET Core JWT?"
    a: "IDX10503 means IdentityModel picked keys and the signature still failed: wrong symmetric secret, disposed RSA, or an opaque Identity token treated as a JWT."
  - q: "Is IDX10503 the same as IDX10501?"
    a: "No. IDX10501 is “the kid is not in the key set.” IDX10503 is “I tried keys and none verified the signature.” Fix the matching error, not both articles at once."
  - q: "Can I disable ValidateIssuerSigningKey to silence IDX10503?"
    a: "No. That accepts forged tokens. Fix the signing credential, key lifetime, or stop sending MapIdentityApi opaque tokens to JwtBearer."
---

**IDX10503** means IdentityModel selected one or more signing keys and none of them verified the token's signature — the credential was parsed but cryptographically rejected.

```text
JWT arrives ──► pick key(s) ──► verify signature ──► FAIL ──► IDX10503
                     │
         (wrong secret / disposed RSA / not a JWT at all)
```

Think of a **signature on a check**: the bank found your account number (key selection worked) but the signature does not match what's on file. IDX10501 is when the bank cannot even find the right signature card on file (`kid` missing from JWKS).

**New to this** → stay here. **kid not in JWKS** → [IDX10501](/blog/aspnet-core-idx10501-jwt-kid). **JWT setup** → [ASP.NET Core JWT checklist](/blog/aspnet-core-jwt-auth). **Opaque Identity tokens** → [MapIdentityApi vs JWT](/blog/mapidentityapi-opaque-token-vs-jwt). **Interview prep** → [If an interviewer asks](#if-an-interviewer-asks).

## Read the line before you add a `kid`

Typical log:

```text
IDX10503: Signature validation failed. Token does not have a kid.
Keys tried: '[PII is hidden]'. Number of keys in TokenValidationParameters: '1'.
```

Three facts:

1. **Signature check failed** — that part is true
2. **“No kid”** is a key-*selection* hint, not a requirement of JWS. Symmetric keys often have no `kid`
3. **PII hidden** — turn on IdentityModel PII logging in Development only (`IdentityModelEventSource.ShowPII = true`) so you can see the key id it tried

Do not add a random `kid` header to “satisfy the error.” That does not fix a wrong secret.

## Cause 1: The secret on issue is not the secret on validate

Angular 401s. jwt.io says the token is valid **with the secret you typed there**. The API uses `Jwt:Key` from **App Service application settings**, which is still the old 16-character string from the first tutorial.

HS256 with a key shorter than the algorithm expects, or UTF-8 vs Base64 mismatch (`GetBytes` vs `FromBase64String`), produces IDX10503, not a friendly “key too short.”

Fix: one secret, one encoding, staged and production **slot settings** in sync. Document the byte length. I do not put the key in `appsettings.json` in git — that is the checklist article.

## Cause 2: You disposed the RSA key inside `using`

Manual `ValidateToken` in a helper:

```csharp
using var rsa = RSA.Create();
rsa.ImportParameters(parameters);
var key = new RsaSecurityKey(rsa);

handler.ValidateToken(token, new TokenValidationParameters
{
    IssuerSigningKey = key,
    // ...
}, out _);
```

IdentityModel **caches** signature providers. The next request reuses a disposed RSA. First call works, second IDX10503, third works. That pattern is all over Stack Overflow.

Fix: keep the `RsaSecurityKey` for the app lifetime (singleton / `AddJwtBearer` options), or set:

```csharp
options.TokenValidationParameters.CryptoProviderFactory = new CryptoProviderFactory
{
    CacheSignatureProviders = false,
};
```

Prefer **not disposing** the key you registered with the host. Disabling cache is the hotfix when a library constructs keys per request.

## Cause 3: Angular sent an opaque Identity token into JWT bearer

`MapIdentityApi` login returns an **opaque** access token. `AddJwtBearer` tries to parse it as a JWS. Signature validation is meaningless — it is not a JWT. The exception may still say IDX10503 (or a parse error one layer up).

If `/login` came from Identity API endpoints and `[Authorize]` uses JWT bearer, you mixed two token types. Pick one pipeline. Details: [MapIdentityApi opaque vs JWT](/blog/mapidentityapi-opaque-token-vs-jwt).

## Cause 4: Access token vs refresh token in the Authorization header

The interceptor attached the **refresh** token (or the Identity cookie value) as `Bearer`. jwt.io shows three segments but a different signing key than `IssuerSigningKey`. IDX10503.

Fix the Angular attach path: [JWT interceptors](/blog/angular-jwt-interceptors). Do not “fix” it by turning `ValidateIssuerSigningKey` off.

## What IDX10503 is not

| Log / status | Look here instead |
| --- | --- |
| IDX10501 / unable to match key | Token `kid` not in JWKS — [IDX10501](/blog/aspnet-core-idx10501-jwt-kid) |
| IDX10223 / lifetime | Clock skew, expired access token, refresh flow |
| IDX10214 / audience | `ValidAudience` vs `aud` claim |
| IDX10204 / issuer | `ValidIssuer` vs `iss` |
| 401 with no IdentityModel line | Missing `Authorization` header, wrong scheme, CORS preflight |

Audience and issuer failures are **not** signature failures. Do not rotate the signing key because `aud` was `spa` and the API expected `api`.

## Checklist I run in ten minutes

1. Decode the token (header + payload only) — is it a JWT at all?
2. Compare **iss** / **aud** / **alg** to `TokenValidationParameters` (if those are wrong you should see IDX102xx, not 10503 — unless the token is garbage)
3. Confirm the **same** key bytes used to **sign** in the issuer project
4. If RSA/EC: no `using` around a key the handler caches
5. If Identity API login: stop sending that string to `AddJwtBearer`
6. Enable PII in Development, reproduce once, turn it off

## Related reading

- [ASP.NET Core JWT auth checklist](/blog/aspnet-core-jwt-auth)
- [IDX10501 unable to match key](/blog/aspnet-core-idx10501-jwt-kid)
- [MapIdentityApi opaque tokens vs JWT](/blog/mapidentityapi-opaque-token-vs-jwt)
- [Angular JWT interceptors](/blog/angular-jwt-interceptors)
- [JWT refresh token rotation](/blog/aspnet-core-jwt-refresh-token-rotation)

## If an interviewer asks

**"Can you disable ValidateIssuerSigningKey to fix IDX10503?"**

**Strong answer:** No. That accepts forged tokens. Fix the signing credential alignment, RSA key lifetime, or stop sending opaque Identity tokens to JwtBearer. Disabling validation is not a fix — it removes security.

**"Why does IDX10503 say 'Token does not have a kid' on HS256?"**

**Strong answer:** Symmetric keys often have no `kid` header. IdentityModel still tried the configured key and signature failed. The "no kid" hint is about key selection, not the root cause. The root cause is usually wrong secret bytes or encoding mismatch between issuer and validator.

**"401 only on every second request — what causes that?"**

**Strong answer:** Disposed RSA inside a `using` block while IdentityModel caches signature providers. First request works; second hits disposed key. Keep `RsaSecurityKey` for app lifetime or disable provider caching as a hotfix.

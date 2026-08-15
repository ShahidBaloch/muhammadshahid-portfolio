---
title: "ASP.NET Core JWT Refresh Token Rotation (and How to Detect Theft)"
description: "A production guide to JWT refresh token rotation in ASP.NET Core: hashed storage, family revocation, reuse detection, and the Angular contract that keeps short-lived access tokens usable."
date: "2026-08-15"
category: "authentication"
tags: ["ASP.NET Core", "JWT", "Security", "Angular"]
---

A login endpoint that returns a JWT is not an auth system. The first production incident I still remember from a marketplace API was quieter than a breach headline: a refresh token lived for 30 days in `localStorage`, never rotated, and was never hashed in SQL. When one seller laptop was compromised, we could not tell which sessions were legitimate. We could only wipe every refresh row and force a global re-login.

That is the gap this article closes. It is the **API-side refresh contract**: rotation, reuse detection, and revocation. It is not a beginner JWT tutorial.

- Angular concurrent 401s and interceptors: [401 refresh queue](/blog/angular-interceptor-401-refresh-queue) · [JWT interceptors](/blog/angular-jwt-interceptors)
- Refresh in an httpOnly cookie: [cookie vs localStorage vs BFF](/blog/refresh-token-httponly-cookie-angular-aspnet-core)
- Issuance, policies, and lifetimes checklist: [ASP.NET Core JWT auth](/blog/aspnet-core-jwt-auth)
- When cookies beat SPA-held refresh tokens: [BFF with YARP](/blog/bff-pattern-aspnet-core-angular-yarp)

This is practitioner guidance from ASP.NET Core and Angular delivery work. It is not legal advice, and it is not a promise that any snippet makes an application “secure” or compliant by itself.

## What refresh token rotation actually means

**Rotation** means: every successful refresh **consumes** the presented refresh token and issues a **new** refresh token. The previous value must not work again.

Without rotation, a stolen refresh token is valid until expiry. With rotation and **reuse detection**, a stolen token that is used after the legitimate client already rotated it becomes a signal: treat the **token family** as compromised and revoke it.

I use three identifiers in the store:

1. **Token id** — unique row for this refresh value (store a hash, never the raw token)
2. **Family id** — shared across rotations of the same login session
3. **User id** — who this session belongs to

When reuse is detected, revoke **every row in that family**, not only the reused row. The thief and the real user both lose the session. That is the point. The real user signs in again; the thief does not keep a silent foothold.

## Access token vs refresh token (do not mix their jobs)

| Token | Typical lifetime I start with | Stored where (API) | Sent how |
| --- | --- | --- | --- |
| Access JWT | 5–15 minutes for internet-facing SPAs | Not stored after issuance (stateless validation) | `Authorization: Bearer` |
| Refresh | Hours to a few days, product-dependent | Hashed in SQL (or equivalent) with expiry + family | Body, or better: httpOnly cookie |

Access tokens stay short so a leak is time-boxed. Refresh tokens stay server-tracked so you can kill a session. If you issue a 24-hour JWT “because refresh was hard,” you skipped the hard part and kept the risk.

On healthcare admin portals I have shipped, access tokens were shorter than on internal ops tools behind VPN. The code pattern was the same. The **policy** was not.

## A storage model that supports reuse detection

```csharp
public sealed class RefreshToken
{
    public Guid Id { get; set; }
    public Guid FamilyId { get; set; }
    public Guid UserId { get; set; }
    public required string TokenHash { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public Guid? ReplacedByTokenId { get; set; }
    public string? CreatedByIp { get; set; }
    public string? UserAgentHash { get; set; }
}
```

Rules I enforce in one service, not in controllers:

- Persist **SHA-256** (or stronger) of the refresh token plus a server-side pepper from Key Vault. If the database leaks, the raw token is not sitting in a column named `RefreshToken`.
- Never log the raw token. Log `FamilyId` and `UserId`.
- Index `(TokenHash)` unique, and `(FamilyId, RevokedAt)` for family revoke.
- On password change, admin lock, or “log out everywhere,” revoke all families for that user.

User-agent and IP are **signals**, not identity. NATs and mobile networks will lie to you. I record them for incident review. I do not auto-revoke solely because the IP changed — that trains users to hate your product.

## Refresh endpoint behavior

```csharp
public sealed record RefreshRequest(string RefreshToken);

public async Task<IResult> RefreshAsync(
    RefreshRequest request,
    HttpContext http,
    IRefreshTokenService tokens,
    CancellationToken ct)
{
    var presented = request.RefreshToken;
    if (string.IsNullOrWhiteSpace(presented))
        return Results.Unauthorized();

    var outcome = await tokens.RotateAsync(presented, http.Connection.RemoteIpAddress?.ToString(), ct);

    return outcome switch
    {
        RotateSuccess s => Results.Ok(new
        {
            accessToken = s.AccessToken,
            refreshToken = s.RefreshToken,
            expiresIn = s.AccessExpiresInSeconds
        }),
        RotateReuseDetected => Results.Unauthorized(),
        RotateInvalid => Results.Unauthorized(),
        _ => Results.Unauthorized()
    };
}
```

I return **401** for invalid, expired, revoked, and reuse. Do not return 200 with `{ success: false }`. Do not return 403. Angular interceptors should treat this as “session is dead,” not “try a different permission.”

On reuse detection I still return 401 to the caller, and I **revoke the family in the same transaction**. Then I write a security log event. In healthcare work that event is an audit row without PHI — session and user identifiers only.

## Rotation algorithm (the part tutorials skip)

Inside `RotateAsync`:

1. Hash the presented token. Look up the row.
2. If missing, expired, or already revoked **and not a reuse of a replaced token** → `RotateInvalid`.
3. If the row is revoked **because it was replaced** (has `ReplacedByTokenId`) → **reuse**. Revoke the family. `RotateReuseDetected`.
4. Otherwise, in a transaction:
   - Insert a new row (new id, **same family**, new hash, new expiry)
   - Set `RevokedAt` and `ReplacedByTokenId` on the old row
   - Issue a new access JWT
   - Return the **new** raw refresh token once

Concurrency matters. Two Angular tabs can refresh at the same instant. If both pass step 2 before either writes, you get two valid children or a false reuse alarm.

I serialize rotation per family with a SQL transaction and a row lock on the current token:

```csharp
await using var tx = await db.Database.BeginTransactionAsync(ct);

var current = await db.RefreshTokens
    .FromSql($"SELECT * FROM RefreshTokens WITH (UPDLOCK, ROWLOCK) WHERE TokenHash = {hash}")
    .SingleOrDefaultAsync(ct);
```

If you are on PostgreSQL, use `FOR UPDATE`. If you skip the lock, you will debug “random logouts” for a week and blame Angular.

A slightly softer approach used on one eCommerce admin: if two rotations race within a 2–3 second window and both present the **same** still-active token, issue one successor and return it to both. I only do that when product owners refuse false logouts more than they fear a tiny race. Reuse of an **already replaced** token still kills the family. Document the choice.

## JWT claims on the access token

Keep access tokens boring:

- `sub` — user id
- `iss` / `aud` — validated explicitly
- roles or a small set of policy claims
- `jti` — useful if you later add a short-lived denylist for logout-before-expiry

Do **not** put refresh family ids, PHI, emails you do not need, or “the whole user object” in the JWT. Angular will decode it. So will every XSS bug.

Signing: asymmetric keys (RS256) once you have more than one API trusting the issuer. Symmetric keys are fine for a single API if the key lives in Key Vault and is long enough. Clock skew: one minute, not the default 5 minutes that keeps expired tokens alive.

## Best practices checklist (this is the “jwt refresh token best practices” section)

Use this as a go-live review, not as decoration:

- [ ] Access JWT TTL is short and written down
- [ ] Refresh tokens are hashed at rest
- [ ] Rotation is mandatory — old refresh value fails after success
- [ ] Reuse of a rotated token revokes the **family**
- [ ] Refresh failures are 401, not 200
- [ ] Logout hits the API and revokes the family (cookie or body)
- [ ] Password reset revokes all families
- [ ] Angular has **one** in-flight refresh ([interceptor notes](/blog/angular-jwt-interceptors))
- [ ] CORS + credentials are correct if the refresh token is a cookie
- [ ] Tokens never appear in application logs or exception messages

If you only implement half of this, implement hashing + family revoke. Rotation without reuse detection still helps. Reuse detection without hashing is theater.

## Angular contract (so the API design does not fight the SPA)

The API should assume:

- Many requests 401 at once when the access token expires
- The SPA will call refresh **once**, then retry
- A failed refresh means redirect to login, not a retry storm

If you store refresh tokens in JSON bodies, the SPA must hold them. That is why I prefer httpOnly cookies for refresh on same-site or carefully configured cross-site setups, and why a [BFF](/blog/bff-pattern-aspnet-core-angular-yarp) is the stronger long-term shape for public internet SPAs.

Do not refresh on **403**. If your API uses 401 for “wrong role,” you will rotate tokens because a nurse opened an admin route. Fix status codes first.

## Example: what I test before I call it done

1. Login → refresh → old refresh returns 401 → new refresh works
2. Use old refresh again → 401 and **all** family rows revoked
3. Two parallel refreshes with a lock → one or two successor tokens, no stuck user
4. Expired refresh → 401, no new access token
5. Logout → refresh 401
6. User B’s refresh cannot be used as user A

I test with a real Angular client, not only Swagger. Swagger does not stampede.

## When not to build this yourself

If you already need SSO, external IdPs, or multiple first-party apps, a dedicated issuer ([Identity vs OpenIddict vs IdentityServer](/blog/identityserver-vs-aspnet-identity), and [MapIdentityApi vs JWT](/blog/mapidentityapi-opaque-token-vs-jwt)) may own refresh for you. You still need to **understand** rotation. You should not assume the default template did reuse detection.

Custom refresh is reasonable for a single ASP.NET Core API plus one Angular admin. It becomes a liability when every new app copies the token table.

---

Short-lived JWTs are easy. Honest refresh is the work. If you want this wired against an existing ASP.NET Core API and Angular SPA — including the race and reuse cases tutorials skip — [contact me](/contact).

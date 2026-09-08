---
title: "ASP.NET Core 401 vs 403: Challenge vs Forbid for Angular APIs"
description: "ASP.NET Core 401 Unauthorized vs 403 Forbidden — Challenge vs Forbid, JWT bearer mapping, Angular interceptor rules, and why logging out on 403 is wrong."
date: "2026-09-07"
category: "authentication"
tags: ["ASP.NET Core", "JWT", "Angular", "Authorization", "API Security"]
related:
  - aspnet-core-jwt-auth
  - angular-interceptor-401-refresh-queue
  - aspnet-core-rbac-guide
faq:
  - q: "What is the difference between 401 and 403 in ASP.NET Core?"
    a: "401 Challenge means the request is unauthenticated (missing or invalid JWT). 403 Forbid means the user is authenticated and failed a policy. They are not interchangeable."
  - q: "Should Angular log out on every 403?"
    a: "No. 403 is “you are signed in and not allowed.” Logging out trains users to think the session died. Only 401 should start refresh or login."
  - q: "When does JWT bearer return Challenge vs Forbid?"
    a: "No token or a failed token is Challenge (401). A valid token that misses a role or policy is Forbid (403). Misconfigured schemes make both look like 401."
---

**401 Unauthorized** means the caller is not authenticated (or the credential is unusable). **403 Forbidden** means the caller is authenticated but not allowed — two different questions the API must answer consistently.

```text
No Bearer header        ──► 401 Challenge  ("Who are you?")
Expired / bad signature   ──► 401 Challenge  ("Credential invalid")
Valid JWT, wrong role     ──► 403 Forbid     ("I know you; no.")
Valid JWT, wrong tenant   ──► 403 Forbid     ("Not your clinic.")
```

Think of a **building lobby**: 401 is the security desk saying "show your badge." 403 is the desk recognizing your badge but refusing the executive floor. Logging someone out on 403 is escorting them from the building because they tried the wrong elevator.

**New to this** → stay here. **JWT setup** → [ASP.NET Core JWT checklist](/blog/aspnet-core-jwt-auth). **Angular refresh on 401 only** → [401 refresh queue](/blog/angular-interceptor-401-refresh-queue). **Policy design** → [RBAC guide](/blog/aspnet-core-rbac-guide). **Interview prep** → [If an interviewer asks](#if-an-interviewer-asks).

## What 401 and 403 mean on an API

| Status | Who the user is | What the API is saying | Typical Angular reaction |
| --- | --- | --- | --- |
| **401 Unauthorized** | Not authenticated (or the credential is unusable) | Send a credential, or refresh, or go to login | Maybe refresh once; then login |
| **403 Forbidden** | Authenticated | You are not allowed this resource | Show “not allowed”; **do not** refresh; **do not** logout |

The HTTP names are terrible. **401 is “who are you?”** **403 is “I know who you are; no.”** I write that sentence in the API README for every Angular team I join.

I have watched marketplace seller portals and clinic admin UIs both ship the wrong mapping: a SupportAgent hitting a PHI route gets 403, the interceptor clears tokens, and the user thinks the API “kicked them out.” Support then files “auth is flaky.”

## Challenge vs Forbid in ASP.NET Core

Authorization middleware does not pick 401/403 by vibe. It asks the authentication handler:

```csharp
// Unauthenticated caller + [Authorize]
await context.ChallengeAsync(); // → 401 for JWT bearer (WWW-Authenticate)

// Authenticated caller, policy failed
await context.ForbidAsync();    // → 403
```

You can call those yourself:

```csharp
[HttpGet("fees/{id:guid}")]
public async Task<IActionResult> GetFee(Guid id)
{
    if (User.Identity?.IsAuthenticated != true)
        return Challenge(); // 401

    if (!User.IsInRole("Billing") && !User.IsInRole("ClinicAdmin"))
        return Forbid();    // 403

    // load fee…
    return Ok(fee);
}
```

Prefer **policies** over `IsInRole` strings — that design is the RBAC article. Here the only point is: **Challenge is 401. Forbid is 403.** Returning `Unauthorized()` vs `Forbid()` on an `IActionResult` is the same split.

## JWT bearer: no token, bad token, failed policy

With `AddJwtBearer` the mapping I expect on healthcare and SaaS APIs:

| Incoming request | Result |
| --- | --- |
| No `Authorization` header | **401** Challenge |
| Bearer token expired / bad signature / wrong audience | **401** Challenge (token unusable) |
| Valid token, `[Authorize(Policy = "CanViewFees")]` fails | **403** Forbid |
| Valid token, resource-based check fails inside the action | **403** (`Forbid()` or `Results.Forbid()`) |

IDX10503 signature failures and IDX10501 `kid` mismatches are still **401** — the credential never became a `User`. Diagnose those in [IDX10503](/blog/aspnet-core-idx10503-jwt-signature) and [IDX10501](/blog/aspnet-core-idx10501-jwt-kid), not here.

A common “bug” that is actually correct: Swagger “Authorize” forgotten → 401. Policy too tight → 403. Teams swap the numbers in Angular because both look like “auth failed” in the Network tab.

## Cookie schemes confuse the numbers

Cookie authentication’s default **challenge** can **redirect to `/Account/Login` (302)** instead of returning 401 JSON. An Angular `HttpClient` then parses HTML and the interceptor sees a 200 login page or a CORS error. That is not a 401 vs 403 puzzle; it is the wrong scheme for an API.

For a SPA I want:

```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(/* … */);
```

If you must keep cookies for MVC **and** JWT for Angular, name the schemes and set `[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]` on API controllers. Mixing defaults is how a “401” becomes a redirect.

## FallbackPolicy turns anonymous endpoints into 401s

```csharp
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});
```

Useful. Also how **health checks**, **Swagger**, and a public `GET /api/catalog` start returning 401 until you `.AllowAnonymous()` or map them before the fallback. That 401 is correct: there is no user. It is not a 403. Do not “fix” it by catching 401 in Angular globally if the route was supposed to be public.

## Angular interceptor rule

Inside the interceptor:

1. **401** on an API that uses JWT: skip refresh for `/auth/login` and `/auth/refresh` themselves. For other calls, **one** in-flight refresh, then retry — that algorithm is the [401 queue post](/blog/angular-interceptor-401-refresh-queue).
2. **403**: **do not refresh.** **do not clear tokens.** Surface a toast or an empty state: “You do not have access to this record.”
3. **401 after refresh already failed**: then logout.

If you `catchError` both 401 and 403 into `this.auth.logout()`, you will punish every policy miss as a session death. ClinicAdmin vs Billing is a 403. Expired JWT is a 401.

Optional: have the API send a ProblemDetails `type` so the SPA does not guess:

```csharp
return Results.Problem(
    title: "Forbidden",
    statusCode: StatusCodes.Status403Forbidden,
    type: "https://httpstatuses.io/403",
    extensions: new Dictionary<string, object?>
    {
        ["code"] = "fee.view.denied",
    });
```

Angular reads `error.error?.code`. That is a contract, not a second authorization system.

## What I check when the SPA “randomly logs out”

1. Network tab: is the status **401 or 403**? If 403, stop looking at refresh.
2. Does the request have `Authorization: Bearer`? If not, 401 is correct.
3. Decode the JWT (staging only): `role` / policy claims present? If yes and still 403, the policy is doing its job.
4. Is cookie challenge redirecting? Look for 302 to a login path.
5. Did someone add `FallbackPolicy` this week and forget `[AllowAnonymous]` on a widget the dashboard loads?

Weak answer: “Make everything 401 so the interceptor is simpler.” Strong answer: **401 is credential, 403 is permission**, and the interceptor has two branches.

## Related reading

- [ASP.NET Core JWT Auth: A Practical Checklist](/blog/aspnet-core-jwt-auth)
- [Angular interceptor: queue concurrent 401s](/blog/angular-interceptor-401-refresh-queue)
- [ASP.NET Core RBAC](/blog/aspnet-core-rbac-guide)
- [IDX10503 JWT signature](/blog/aspnet-core-idx10503-jwt-signature)
- [IDX10501 JWT kid match](/blog/aspnet-core-idx10501-jwt-kid)
- [Auth & tokens hub](/learning/authentication)

## If an interviewer asks

**"What is the difference between Challenge and Forbid in ASP.NET Core?"**

**Strong answer:** `ChallengeAsync()` → 401 for unauthenticated callers — missing or invalid JWT. `ForbidAsync()` → 403 for authenticated callers who fail a policy. JWT bearer maps no token and bad signature to Challenge; valid token with wrong role to Forbid.

**"Should Angular refresh on 403?"**

**Strong answer:** No. 403 means the session is valid but permission is missing. Refreshing will not add a role. Clear tokens only after 401 when refresh also fails. Treat 403 as UX — toast or empty state, not logout.

**"Why do cookie APIs confuse this?"**

**Strong answer:** Cookie authentication's default challenge redirects to login (302 HTML), not 401 JSON. Angular `HttpClient` then sees CORS errors or HTML bodies. Use JWT bearer scheme on API controllers, or name schemes explicitly with `[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]`.


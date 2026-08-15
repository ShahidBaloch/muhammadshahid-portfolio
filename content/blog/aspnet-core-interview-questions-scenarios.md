---
title: "ASP.NET Core Interview Questions: Scenario-Based Answers That Hold Up"
description: "ASP.NET Core interview questions with detailed scenario answers — DI captive dependencies, JWT with Angular, middleware order, async starvation, EF Core slowness, and production tradeoffs."
date: "2026-08-12"
category: "architecture"
tags: ["Interview Questions", "ASP.NET Core", ".NET", "C#", "Career", "Web API"]
---

Interviewers hiring for healthcare, SaaS, and marketplace APIs do not care if you can define middleware. They care whether you can debug a production story without guessing.

I interview and coach .NET candidates around the same failures I fix on client systems: tenant data leaking through a singleton cache, JWTs that work in Postman but not Angular, thread pools dying under “fine looking” sync code. Below are scenario answers — what a strong candidate says, what a weak one says, and how I verify the fix.

This is interview narration. Implementation depth lives in the linked how-to posts (JWT, DI, async), not in this URL.

## How to use this guide

For each scenario:

1. Read the prompt out loud (simulate the interview)
2. Answer without scrolling
3. Compare to the **strong answer** and the **trap**
4. Skim the verification steps — seniors talk about how they would prove the fix

Related deep dives live in separate posts ([DI](/blog/aspnet-core-dependency-injection), [JWT](/blog/aspnet-core-jwt-auth), [async](/blog/csharp-async-await-aspnet-core)). This page is about **interview storytelling under pressure**.

---

## Scenario 1: Users see each other’s dashboard data after a “harmless” cache

**Prompt:** You added an in-memory report cache registered as `Singleton`. A week later, support tickets say User A briefly saw User B’s clinic metrics. Staging never reproduced it. What do you investigate first?

### Weak answer

“Caching is hard. I would clear Redis and restart the app.”

### Strong answer (what I want to hear)

Start with **lifetime + identity in the cache key**, not infrastructure panic.

1. **Captive dependency** — Did the singleton take `DbContext`, `IHttpContextAccessor` incorrectly, or an `ICurrentUser` resolved once at startup?
2. **Key design** — Are keys only `"dashboard"` instead of `$"{tenantId}:{userId}:dashboard:v1"`?
3. **Static mutable state** — Any `static ConcurrentDictionary` filled without tenant scope?
4. **AsyncLocal / thread-static leftovers** — Rare, but I’ve seen “current user” stored globally in a helper.

```csharp
// Smell: singleton + scoped user/db
public sealed class ReportCache
{
    private readonly AppDbContext _db; // scoped captive
    private readonly ICurrentUser _user; // often request-scoped

    public ReportCache(AppDbContext db, ICurrentUser user)
    {
        _db = db;
        _user = user;
    }
}
```

**Fixes that sound senior:**

- Make the cache **scoped** if it must touch request identity
- Or keep singleton but inject `IServiceScopeFactory`, create a scope per fetch, and **never** reuse a user id from construction time
- Always include tenant + user (or role scope) in the key
- Add a regression test that runs two parallel requests with different users and asserts isolation

On multi-tenant healthcare portals, this class of bug is a **compliance incident**, not a “caching quirk.”

---

## Scenario 2: JWT works in Postman, Angular gets 401

**Prompt:** The access token from `/api/auth/login` works when pasted into Postman. The Angular SPA receives 401 on `/api/orders`. Walk me through your debug order.

### Weak answer

“CORS is broken” or “Angular is bad with cookies.”

### Strong answer

Treat it as a **pipeline**, not a single guess:

1. **Does the browser send `Authorization: Bearer …`?** DevTools → Network → request headers. If missing, the interceptor never ran, ran on the wrong requests, or the token was never stored after login.
2. **Is the SPA calling the same API host/environment** as Postman? Wrong `environment.apiUrl` is embarrassingly common after slot swaps.
3. **Preflight (OPTIONS)** — If custom headers are blocked, you may see CORS noise; fix CORS allow-list for `Authorization`.
4. **Token validation** — `ValidIssuer`, `ValidAudience`, signing key, and clock skew must match the issuer used by login. Staging token against production validation config fails silently from the SPA’s perspective.
5. **Cookie vs bearer mix-ups** — Some apps set an httpOnly refresh cookie but the API only accepts bearer access tokens; the SPA forgot to attach the access token.

```typescript
// Interceptor must target API only and attach after login write
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }
  const token = authStore.accessToken();
  if (!token) return next(req);
  return next(req.clone({
    setHeaders: { Authorization: `Bearer ${token}` }
  }));
};
```

**How I’d verify:** log the validated `NameIdentifier` on a throwaway `/api/me` endpoint; compare Postman vs SPA. If `/api/me` is 200 in Postman and 401 in SPA, it is almost never “EF Core.”

---

## Scenario 3: Staging is fine; production hangs under load

**Prompt:** CPU looks low, SQL is healthy, App Service instances are “green,” but p95 latency explodes at 9am. Where do you look before scaling out?

### Weak answer

“Add more instances” or “Angular is too chatty.”

### Strong answer

Suspect **thread-pool starvation** and **sync-over-async** before hardware:

- `.Result`, `.Wait()`, `GetAwaiter().GetResult()` on request paths
- Sync EF methods (`ToList()` instead of `ToListAsync`) inside hot endpoints
- Blocking HTTP calls without `IHttpClientFactory` async APIs
- Long CPU work on the request thread without offloading (rare but real)

Explain the mechanism: ASP.NET Core needs free thread-pool workers to resume continuations. If workers are blocked waiting on tasks that need workers, throughput collapses while CPU stays mysteriously calm.

**Interview bonus:** mention you’d capture a dump / check thread-pool metrics, search the codebase for `.Result`, and load-test a single suspect endpoint with concurrent clients.

Deep dive: [C# async and await in ASP.NET Core](/blog/csharp-async-await-aspnet-core).

---

## Scenario 4: Business rules live in the controller

**Prompt:** A junior adds partner-specific discount logic as nested `if` statements in `OrdersController`. How do you redesign without a six-month rewrite?

### Weak answer

“We need microservices and Clean Architecture folders.”

### Strong answer

Apply **SRP + Open/Closed** surgically:

1. Keep the controller as HTTP adapter (status codes, auth, ProblemDetails)
2. Move orchestration to a handler/service (`CreateOrderHandler`)
3. Extract discount variants behind `IPricingStrategy` (or a policy service)
4. Register strategies in DI; select by partner key

You are not required to invent ten projects. You are required to stop editing the controller for every commercial rule. See [SOLID in ASP.NET Core](/blog/solid-principles-aspnet-core) and [Strategy Pattern](/blog/csharp-strategy-pattern).

**What I listen for:** the candidate can name *what changes together* and *what should be closed to modification*.

---

## Scenario 5: Middleware order

**Prompt:** Authenticated calls still hit `[Authorize]` as anonymous after a refactor. `UseAuthorization()` was moved above `UseAuthentication()`. Explain.

### Strong answer

Authorization middleware runs **before** the authentication middleware has set `HttpContext.User`. Every user looks anonymous; policies fail closed (401/403 depending on setup).

A practical order many apps use:

1. Exception handling / ProblemDetails
2. HTTPS redirection
3. Routing
4. CORS
5. Authentication
6. Authorization
7. Endpoints

**Senior nuance:** endpoint routing changes historically confused teams — speak in terms of “auth must populate the user before authorize runs,” not memorized lore alone.

---

## Scenario 6: Detail page fast, Angular grid slow

**Prompt:** `/api/orders/{id}` is 40ms. `/api/orders?status=&from=&to=` takes 4 seconds and sometimes times out the SPA. Debug plan?

### Strong answer (ordered)

1. **Capture SQL** — EF logging, `ToQueryString()`, or SQL Profiler. Guessing indexes without SQL is theater.
2. **N+1** — lazy navigation in a loop, or `Include` trees that explode.
3. **Over-fetch** — materializing full entities when the grid needs five columns. Project to DTOs.
4. **Missing indexes** on filter/sort columns used by the Angular query model.
5. **Unbounded results** — SPA asks for “all rows”; API obliges. Enforce pagination server-side.
6. **Serialization cost** — huge graphs, cycles, or accidental blob fields.

```csharp
// Prefer projection for lists
var rows = await _db.Orders.AsNoTracking()
    .Where(o => o.Status == status)
    .OrderByDescending(o => o.CreatedUtc)
    .Skip(skip).Take(take)
    .Select(o => new OrderListItemDto(o.Id, o.Status, o.Total, o.CreatedUtc))
    .ToListAsync(ct);
```

See [EF Core performance](/blog/ef-core-sql-performance).

---

## Scenario 7: Minimal APIs vs controllers for an Angular BFF

**Prompt:** Greenfield admin BFF. Team is excited about Minimal APIs. How do you decide?

### Strong answer

| Lean Minimal APIs | Prefer controllers / larger structure |
|---|---|
| Health, webhooks, small vertical slices | Dozens of admin actions with shared filters |
| Clear endpoint groups outside `Program.cs` | Existing MVC conventions already paid for |
| Team comfortable with function composition | Need familiar patterns for a large hiring funnel |

I reject both “Minimal APIs are toys” and “controllers are legacy.” I ask about **surface area, team skills, and how you prevent `Program.cs` landfills**. Details: [Minimal APIs](/blog/aspnet-core-minimal-apis).

---

## Scenario 8: Validation errors Angular cannot bind

**Prompt:** API returns 400 with inconsistent shapes; reactive forms cannot highlight fields. What do you standardize?

### Strong answer

Use **ProblemDetails** / validation problem details with stable `errors` keys matching field names. One exception middleware for unhandled errors; validation stays 400 without stack traces. Document the contract for the SPA. See [API validation](/blog/aspnet-core-api-validation) and [global exception handling](/blog/aspnet-core-global-exception-handling).

---

## Scenario 9: Rate limiting locks out an office

**Prompt:** Login rate limit is per IP. A clinic on one NAT gets mass 429s at morning rush. Redesign?

### Strong answer

Partition thoughtfully: per-user or per-username on login after identity is known; gentler limits for authenticated APIs; different policies for login vs read APIs; consider distributed counters if multi-instance. Explain tradeoffs honestly — IP limits stop casual abuse but punish shared egress. See [rate limiting](/blog/aspnet-core-rate-limiting).

---

## What interviewers score you on

| Weak signal | Strong signal |
|---|---|
| Buzzword salad | Ordered debug steps |
| “Always microservices” | Modular monolith vs services with change-rate reasons |
| Blame Angular first | Trace auth and network evidence |
| Scale out immediately | Find blocking calls and bad SQL first |
| Copy-paste definitions | Personal failure story with a fix |

## Practice prompts (answer in 2 minutes each)

1. Why is `async void` unacceptable on an API action?
2. How do you revoke refresh tokens after password reset?
3. When is the Repository Pattern earning its keep vs wrapping EF for no reason?
4. How do you design cache keys for multi-tenant SaaS?
5. What belongs in an Angular auth guard vs an ASP.NET Core policy?

## Related reading

- [C# Async Await Interview Questions](/blog/csharp-async-await-interview-questions)
- [Angular Interview Questions with ASP.NET Core](/blog/angular-interview-questions-aspnet-core)
- [SOLID Principles in C# and ASP.NET Core](/blog/solid-principles-aspnet-core)
- [Clean Architecture in ASP.NET Core](/blog/clean-architecture-aspnet-core)

Preparing for a senior ASP.NET Core interview loop, or building one for your hiring team? [Contact me](/contact) — scenario practice beats memorizing property bags.

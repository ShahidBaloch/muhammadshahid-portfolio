---
title: "Angular Auth Guard with ASP.NET Core JWT"
description: "Angular auth guard and CanActivateFn with ASP.NET Core JWT — route protection, role guards, token expiry checks, returnUrl safety, and why guards are UX not API security."
date: "2026-08-01"
category: "authentication"
tags: ["Angular", "Auth Guard", "JWT", "ASP.NET Core", "Security"]
faq:
  - q: "How do Angular auth guards work with ASP.NET Core JWT?"
    a: "The guard decides whether a route may open using token presence, expiry, and role claims. The API must still authorize. A guard is UX, not a security boundary."
  - q: "Is localStorage.getItem('token') enough for an auth guard?"
    a: "No. A string in storage can be stale or forged. Check expiry, and map roles from claims the API issued — not a role key the SPA wrote itself."
  - q: "Do auth guards replace HTTP interceptors?"
    a: "No. Guards block navigation. Interceptors attach Bearer tokens and handle 401. Role UI hiding is also not authorization — policies on the API are."
---

**An Angular auth guard** is a `CanActivateFn` (or class guard) that decides whether the router may load a route — using token presence, expiry, and role claims from the JWT the API issued.

```text
User clicks /admin
       │
       ▼
  authGuard ──no token──► /login?returnUrl=/admin
       │
    has token
       │
       ▼
  roleGuard ──wrong role──► /forbidden
       │
    allowed
       │
       ▼
  load admin component  (API still enforces [Authorize] on every call)
```

Think of guards as the **bouncer at the door**: they check your wristband before you enter the VIP room. The kitchen (API) still verifies you before serving food. A demo that only checks `localStorage.getItem('token')` is a bouncer who never looks at expiry or whether the wristband was printed by the venue.

**New to this** → stay here. **Token attach and 401 recovery** → [Angular JWT interceptors](/blog/angular-jwt-interceptors). **API claims and policies** → [ASP.NET Core JWT checklist](/blog/aspnet-core-jwt-auth). **Interview prep** → [If an interviewer asks](#if-an-interviewer-asks).

## What people mean when they search this

Most developers want three outcomes:

1. Unauthenticated users cannot open `/dashboard`
2. Users without the right role cannot open `/admin`
3. Expired tokens send people back to login without a broken UI loop

Angular’s `CanActivateFn` (or class-based `CanActivate`) is only the last gate. The real security still lives on the ASP.NET Core API. The guard improves UX and reduces noise; it does not replace `[Authorize]` and policies on the server.

## ASP.NET Core: put the claims the guard needs

Your JWT must carry stable claims the SPA can read safely:

- `sub` or `NameIdentifier` — who the user is
- `role` / `roles` — what they can do
- `exp` — when access ends
- optional tenant or org claim for multi-tenant SaaS

On the API side I prefer policy-based authorization over scattering string roles in controllers. Example shape:

```csharp
options.AddPolicy("AdminOnly", policy =>
    policy.RequireRole("Admin"));

options.AddPolicy("ProviderOps", policy =>
    policy.RequireAssertion(ctx =>
        ctx.User.IsInRole("Admin") ||
        ctx.User.IsInRole("ProviderManager")));
```

If Angular shows an Admin menu based on a claim that the API never enforces, you have a cosmetic lock — not security. I have reviewed portals where the guard blocked the route but a direct `HttpClient` call still returned sensitive data because the endpoint was `[AllowAnonymous]` by mistake.

## Angular: a practical auth guard

With standalone Angular, a functional guard is usually enough:

```typescript
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], {
      queryParams: { returnUrl: router.url },
    });
  }

  return true;
};
```

`isAuthenticated()` should do more than “token string exists”:

- Decode `exp` (or track expiry from login response)
- Treat clock skew carefully (30–60 seconds is fine)
- Clear storage and return false if the token is malformed

Do **not** trust a boolean you wrote into `localStorage` at login time. Tokens expire. Users leave tabs open overnight. Healthcare ops staff especially leave portals running between shifts.

## Role guard: read claims, do not invent them

```typescript
export const roleGuard = (roles: string[]): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  if (!auth.hasAnyRole(roles)) {
    return router.createUrlTree(['/forbidden']);
  }

  return true;
};
```

Route usage:

```typescript
{
  path: 'admin',
  canActivate: [authGuard, roleGuard(['Admin'])],
  loadComponent: () => import('./admin/admin.page'),
}
```

Role names must match what ASP.NET Core emits. A common bug: API issues `http://schemas.microsoft.com/ws/2008/06/identity/claims/role` while Angular looks for a short `role` claim after decoding. Map claim types consistently when you create the token, or normalize them once in `AuthService`.

## Pair the guard with an HTTP interceptor

Guards protect navigation. Interceptors protect API calls after the page loads.

Minimum interceptor duties:

1. Attach `Authorization: Bearer …`
2. On `401`, attempt a single refresh (if you have refresh tokens) or logout
3. Avoid infinite retry loops

I wrote a deeper interceptor checklist in [Angular JWT interceptors](/blog/angular-jwt-interceptors). Use that with this guard post — they are one auth story, not two features.

## returnUrl without open redirects

When the guard sends users to login, keep `returnUrl` as an **internal path only**:

- Allow `/dashboard`, `/providers/123`
- Reject `https://evil.example` or `//evil.example`

Validate with a simple “starts with `/` and not `//`” rule before `router.navigateByUrl(returnUrl)`.

## Lazy-loaded modules and guard placement

On larger Angular portals I put `authGuard` on the parent lazy route, then add `roleGuard` on child admin routes. That way the feature bundle does not download for anonymous users, and role checks stay close to the screens that need them.

Example structure:

```typescript
{
  path: 'ops',
  canActivate: [authGuard],
  loadChildren: () => import('./ops/ops.routes'),
}
```

Inside `ops.routes`, only the `admin` child gets `roleGuard(['Admin'])`. Provider managers can still open the rest of ops without seeing admin configuration.

## Testing guards without flaky E2E only

Unit-test `AuthService.isAuthenticated()` and `hasAnyRole()` with fixed JWTs (expired, valid, missing role). Then smoke-test navigation in the browser:

1. Open `/admin` logged out → login with `returnUrl`
2. Login as non-admin → `/forbidden`
3. Login as admin → page loads
4. Expire the access token → next navigation or API call recovers cleanly

I also verify with DevTools that a forbidden UI does not mean the API is open. Call the admin endpoint directly with a non-admin token and expect 403.

## What I skip in early MVPs (and add before go-live)

Skip early if the product is internal and tiny:

- Fancy permission matrices in the SPA
- Multiple nested guards per lazy module

Add before production:

- Server policies matching every sensitive route
- Expiry-aware `isAuthenticated()`
- Forbidden page that does not leak whether a resource exists
- Logout that clears memory/cookies and cancels in-flight calls

## Delivery checklist I use with clients

1. Login returns access token (+ refresh if required)
2. Token includes roles the product actually uses
3. `authGuard` on all authenticated feature routes
4. `roleGuard` on admin/ops areas
5. Every sensitive API endpoint has `[Authorize]` / policies
6. Interceptor handles 401 without login loops
7. Manual test: expired token, wrong role, direct API call without UI

## If an interviewer asks

**"Do auth guards secure the API?"**

**Strong answer:** No. Guards are client-side UX. They block navigation and lazy-loaded bundles. Anyone can call the API with curl. Security is `[Authorize]` and policies on ASP.NET Core. Guards reduce confusion and prevent downloading admin bundles to anonymous users.

**"Why not just hide the Admin menu with `*ngIf`?"**

**Strong answer:** Bookmarks, deep links, and browser history bypass hidden UI. A guard on the route plus API policy on the endpoint covers both navigation and data access. Hiding buttons is courtesy; guards and policies are enforcement layers.

**"How do you handle expired tokens in a guard?"**

**Strong answer:** Decode `exp` (with modest clock skew), not just "string exists." Pair with an interceptor that refreshes on 401 so a guard during async init does not race refresh-on-startup. Clear storage and redirect to login when refresh fails.


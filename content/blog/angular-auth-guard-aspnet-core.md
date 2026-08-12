---
title: "Angular Auth Guard with ASP.NET Core JWT: Protect Routes the Right Way"
description: "How to implement Angular auth guards and role guards with ASP.NET Core JWT — canActivate, token expiry checks, and role claims from the API without brittle localStorage hacks."
date: "2026-08-01"
category: "architecture"
tags: ["Angular", "Auth Guard", "JWT", "ASP.NET Core", "Security"]
---

If you search for **Angular auth guard ASP.NET Core JWT**, you will find dozens of tutorials that stop at `localStorage.getItem('token')`. That is enough for a demo. It is not enough for a healthcare portal, an admin SPA, or any product where a stale token or a forged role claim becomes a production incident.

I wire Angular route guards against ASP.NET Core JWT APIs on client work regularly — provider portals, marketplace admin screens, and eCommerce back offices. This post is the checklist I actually use: what the API must put in the token, how the Angular guard should decide, and where people break security without noticing.

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

If you want the same auth story wired into your product, [contact me](/contact).

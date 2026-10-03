---
title: "Angular Silent Token Refresh on App Startup"
description: "Angular silent token refresh on startup runs one cookie POST before the first secured call and keeps the access token in memory, not localStorage."
date: "2026-10-03"
category: "authentication"
tags: ["Angular", "ASP.NET Core", "JWT", "Refresh Token", "HttpOnly"]
related:
  - angular-interceptor-401-refresh-queue
  - refresh-token-httponly-cookie-angular-aspnet-core
  - aspnet-core-jwt-refresh-token-rotation
  - angular-auth-guard-aspnet-core
faq:
  - q: "How do I silently refresh an Angular access token on startup?"
    a: "Block bootstrap with an app initializer that POSTs to the ASP.NET Core refresh endpoint with credentials. On 200, keep the new access token in memory. On 401, leave the user anonymous and let the route guard send them to login. Do not wait for the first API 401."
  - q: "Should the access token be stored in localStorage?"
    a: "No. The refresh token belongs in an HttpOnly cookie. The short-lived access token stays in a service field so a script cannot read the refresh token and an XSS payload cannot steal a long-lived credential from storage."
  - q: "How is startup refresh different from a 401 interceptor queue?"
    a: "The 401 queue retries calls that already failed after the session was warm. Startup refresh runs once before those calls exist. Cookie flags, rotation, and the queue are separate posts."
---

**Angular silent token refresh on app startup** is a single credentialed POST to the ASP.NET Core refresh endpoint that finishes before routers and feature HttpClients run, so a returning user gets a memory-only access token without a login screen and without a burst of 401s.


```text
Browser load
  -> cookie "session_present" ? 
       no  -> anonymous, no refresh call
       yes -> POST /api/auth/refresh (HttpOnly cookie)
                200 -> access token in memory, app continues
                401 -> clear memory, app continues as anonymous
  -> guards and interceptors read memory only
```

Metaphor: the 401 queue is the bouncer who stops a crowd that already walked in. Startup refresh is checking the membership card at the door, once, before anyone is inside.

**New to this** stay here. **Calls that 401 after login** see [401 refresh queue](/blog/angular-interceptor-401-refresh-queue). **Where the refresh cookie lives** see [HttpOnly refresh cookie](/blog/refresh-token-httponly-cookie-angular-aspnet-core). **Rotation rules on the server** see [refresh token rotation](/blog/aspnet-core-jwt-refresh-token-rotation). **Guards** see [auth guard](/blog/angular-auth-guard-aspnet-core).

You have already chosen cookie-backed refresh and an interceptor. They still see a logged-out flash, or a pile of 401 responses, because nothing runs until a component fires `HttpClient`.

## How to run an Angular silent token refresh on startup

Block bootstrap on one credentialed POST to `/api/auth/refresh`. On 200, keep the access token in a service field. On 401, continue as anonymous and let the guard send protected routes to login.

Use this path when all of the following are true:

- Angular is a separate SPA (or a hosted SPA) calling ASP.NET Core.
- The refresh token is an HttpOnly cookie. JavaScript never reads it.
- The access token is a short-lived JWT kept in a service, not in `localStorage` or `sessionStorage`.
- You want a returning browser to look signed-in on the first protected screen.

Do not use startup refresh as the only recovery path. A token can still expire while the user is filling a form. That later failure belongs to the [401 queue](/blog/angular-interceptor-401-refresh-queue). Do not use startup refresh to invent a BFF. If the browser never holds an access token at all, read [BFF with YARP](/blog/bff-pattern-aspnet-core-angular-yarp) instead of bolting a bearer token onto this flow.

## Why the first 401 is the wrong trigger

> **Watch:** If the refresh call goes through the 401 interceptor, it queues behind itself and bootstrap never finishes. Skip auth URLs before any queue.

A cold load of `/orders` does this if you only refresh inside the interceptor:

1. The guard or the component calls `GET /api/orders` with no Authorization header.
2. ASP.NET Core returns 401.
3. The interceptor starts a refresh, queues the GET, then replays it.
4. The template already rendered an error or a login redirect from the first 401.

That is a correct queue and a bad startup. The user sees a flicker, extra latency, and sometimes a router race: the guard decided "logged out" before the refresh Observable completed. An app initializer removes the race because Angular does not create the router guards' first navigation until the initializer promise settles.

Anonymous users must not pay for a refresh round-trip on every public page. A non-HttpOnly marker cookie is enough to decide.

## Marker cookie, not a second secret

> **Watch:** Refreshing when the marker cookie is absent makes every anonymous visit pay a 401. A 5xx is not a logout; do not clear a still-valid cookie on a network failure.

When login or refresh succeeds, set a cookie the SPA can see:

```csharp
http.Response.Cookies.Append("session_present", "1", new CookieOptions
{
    HttpOnly = false,
    Secure = true,
    SameSite = SameSiteMode.Lax,
    Path = "/",
    MaxAge = TimeSpan.FromDays(14)
});
```

The value is the constant `1`. It is not a token, not a user id, and not a CSRF secret. On logout, delete `session_present` and the HttpOnly refresh cookie together. If an attacker copies only the marker, the refresh POST still fails because the refresh cookie is missing. If they copy only the refresh cookie, your CSRF rules below still apply.

The SPA reads `document.cookie` for `session_present`. If it is absent, `trySilentRefresh` resolves `false` and does not touch the network.

## Block bootstrap on one refresh

> **Watch:** Do not throw from the initializer, and do not stash the access token in sessionStorage so a reload can skip the refresh.

`provideAppInitializer` (Angular 19 and later) runs before the app is considered stable. Return the promise so bootstrap waits. Older apps can do the same with `APP_INITIALIZER`.

```typescript
import { inject, provideAppInitializer } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { AuthSession } from "./auth-session";

export function provideSilentRefresh() {
  return provideAppInitializer(() => {
    const session = inject(AuthSession);
    return firstValueFrom(session.trySilentRefresh());
  });
}
```

Register it next to `provideHttpClient(withInterceptors([authInterceptor]))` in `app.config.ts`. Do not register a second initializer that also calls refresh. Two concurrent rotations will invalidate each other if the server rotates on every refresh. One call per page load is the rule.

```typescript
@Injectable({ providedIn: "root" })
export class AuthSession {
  private accessToken: string | null = null;

  constructor(private readonly http: HttpClient) {}

  token(): string | null {
    return this.accessToken;
  }

  trySilentRefresh(): Observable<boolean> {
    if (!this.hasMarker()) {
      this.accessToken = null;
      return of(false);
    }

    return this.http
      .post<{ accessToken: string; expiresIn: number }>(
        "/api/auth/refresh",
        {},
        { withCredentials: true, headers: { "X-Requested-With": "spa" } }
      )
      .pipe(
        tap((body) => {
          this.accessToken = body.accessToken;
        }),
        map(() => true),
        catchError(() => {
          this.accessToken = null;
          return of(false);
        })
      );
  }

  private hasMarker(): boolean {
    return document.cookie.split("; ").some((c) => c.startsWith("session_present="));
  }
}
```

`catchError` to `false` is deliberate. A 401, a network blip, or a 5xx must not reject the initializer. A rejected initializer blocks the entire app on a blank page. Public routes should still render. Protected routes hit the guard, see a null token, and send the user to login once.

Do not `tap` the token into `localStorage` "just for a refresh". That undoes the reason the refresh token is HttpOnly.

## Interceptor contract during startup

The initializer's POST must not go through the bearer logic or the 401 queue.

```typescript
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(AuthSession);
  if (req.url.includes("/api/auth/refresh") || req.url.includes("/api/auth/login")) {
    return next(req);
  }

  const token = session.token();
  const authed = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authed);
};
```

Keep the 401 queue in this interceptor for later calls, as described in the queue post. Startup does not need the queue: there are no in-flight feature calls yet. If you start the queue from inside `trySilentRefresh`, you will deadlock, because the queue waits for refresh and refresh waits for the queue.

`withCredentials: true` is required even for same-origin cookies if you ever split the SPA and the API across sites. Same-origin hosting can still send cookies without it, but setting it makes the dev proxy (`ng serve` to Kestrel) behave like production.

## ASP.NET Core refresh endpoint

The server sketch below is the startup contract, not the rotation algorithm. Persist hashes, families, and reuse detection as in the [rotation guide](/blog/aspnet-core-jwt-refresh-token-rotation).

```csharp
app.MapPost("/api/auth/refresh", async (
    HttpContext http,
    IRefreshService refresh,
    CancellationToken ct) =>
{
    if (!http.Request.Headers.ContainsKey("X-Requested-With"))
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Missing SPA header");

    if (!http.Request.Cookies.TryGetValue("refresh", out var raw) || string.IsNullOrEmpty(raw))
        return Results.Unauthorized();

    var rotated = await refresh.RotateAsync(raw, http.Connection.RemoteIpAddress, ct);
    if (rotated is null)
    {
        http.Response.Cookies.Delete("refresh", new CookieOptions { Path = "/api/auth" });
        http.Response.Cookies.Delete("session_present", new CookieOptions { Path = "/" });
        return Results.Unauthorized();
    }

    http.Response.Cookies.Append("refresh", rotated.RefreshToken, new CookieOptions
    {
        HttpOnly = true,
        Secure = true,
        SameSite = SameSiteMode.Strict,
        Path = "/api/auth",
        MaxAge = TimeSpan.FromDays(14)
    });

    return Results.Ok(new { accessToken = rotated.AccessToken, expiresIn = 300 });
}).AllowAnonymous();
```

Narrow `Path` so the refresh cookie is not attached to every `/api/orders` call. The access token travels in `Authorization`, not in a cookie. `expiresIn` lets the client schedule a quiet refresh later; that timer is optional and is not a substitute for the 401 queue. If you add a timer, jitter it and stop it on logout.

Return a normal 401 with an empty body for a bad cookie. Do not return a redirect to a login HTML page. Angular is looking for a status code, not a Razor view.

## CSRF on a cookie-authenticated POST

A refresh cookie with `SameSite=Strict` is not sent on a cross-site POST from another site's form. That blocks the classic CSRF case. Two extra locks are still worth it:

- Require a custom header such as `X-Requested-With: spa`. Browsers do not add that header to a simple form POST, so the request becomes a CORS preflight that your API rejects from unknown origins.
- Keep CORS `AllowCredentials` limited to the SPA origin. Do not combine credentials with `AllowAnyOrigin`.

This is not a general CSRF article. State-changing business POSTs that use cookie sessions need anti-forgery tokens. This refresh endpoint is the one cookie POST in an otherwise bearer API.

## Guards after the initializer

Because bootstrap waited, a guard can be synchronous:

```typescript
export const authGuard: CanActivateFn = () => {
  const session = inject(AuthSession);
  if (session.token()) return true;
  return inject(Router).createUrlTree(["/login"], {
    queryParams: { returnUrl: inject(Router).url }
  });
};
```

Do not call `trySilentRefresh` inside the guard. The guard runs on every navigation. A second refresh on every click rotates the token, races other tabs, and hides bugs in the initializer.

Other tabs: the server must treat refresh reuse as theft, which the rotation post covers. Startup does not need a cross-tab lock if only a full page load refreshes. If you also refresh on a timer, take a `navigator.locks` lock named `auth-refresh` so two tabs do not rotate the same cookie. Document that as a follow-on, and do not build the lock until you have the timer.

## Server-side rendering

Do not run this initializer during prerender. There is no user cookie in the build machine, and a failed refresh must not fail `ng build`. Gate it:

```typescript
provideAppInitializer(() => {
  const platformId = inject(PLATFORM_ID);
  if (!isPlatformBrowser(platformId)) return Promise.resolve();
  return firstValueFrom(inject(AuthSession).trySilentRefresh());
});
```

Angular SSR hosting details stay in [SSR on ASP.NET Core](/blog/angular-ssr-hosted-aspnet-core). This page only says: silent refresh is a browser concern.

## Pitfalls

- **Refresh through the 401 interceptor.** The initializer call is queued behind itself and the app never boots. Skip auth URLs before any queue logic.
- **Throwing from the initializer.** `firstValueFrom` rejects on HTTP errors. Catch inside `trySilentRefresh` and return `false`.
- **Storing the access token in sessionStorage** so a reload "does not need refresh". Anything script-readable is stealable, and you now have two sources of truth.
- **Refreshing when the marker cookie is missing.** Every anonymous visit to the marketing page pays a 401 and fills security logs.
- **Wide cookie path.** `Path=/` on the refresh cookie sends it to static files and to endpoints that do not need it. Use `/api/auth`.
- **Logging the refresh body.** The JSON contains an access token. Log status codes and correlation ids only. See [PII redaction](/blog/serilog-pii-redaction-healthcare-aspnet-core) if logs already capture request bodies.
- **Treating 5xx like a logout.** A down API during boot should not delete a still-valid cookie. The sample `catchError` clears memory only. Delete cookies on the server when rotation fails, not when the network fails. If you cannot tell them apart, prefer keeping the cookie and showing a retry on the next navigation.
- **Access token lifetime longer than the refresh.** Then startup refresh rarely runs and a stolen access token lives too long. Five to fifteen minutes for the access token is the usual band; pick from the rotation post, not from this one.

## Verification

Browser, cold load, user already logged in:

1. Application cookies show `session_present` and an HttpOnly `refresh`. Application storage shows no token.
2. The first XHR is `POST /api/auth/refresh` with the custom header and no Authorization header. Status 200. Response JSON has `accessToken`. `Set-Cookie` rotates `refresh`.
3. The next call is the feature GET with `Authorization: Bearer`. It is not preceded by a 401.
4. A protected route renders the signed-in shell without a login redirect.

Anonymous cold load:

1. No `session_present`.
2. No refresh request in the network log.
3. Public pages render. A protected route redirects to `/login` once.

Failed refresh:

1. Delete the `refresh` cookie in devtools, keep the marker.
2. Reload. One refresh POST returns 401. No retry storm.
3. The SPA stays on public pages. The guard redirects only when a protected URL is opened.

Automated: an `HttpTestingController` test expects exactly one POST to `/api/auth/refresh` when the marker is present, zero when it is absent, and a null `token()` when the mock returns 401. A second test asserts the interceptor does not add Authorization to that POST.

Server: integration test with `WebApplicationFactory` sets the cookie, posts with `X-Requested-With`, and asserts a new cookie plus a JWT whose `exp` is minutes away. A second test omits the header and expects 400.

## What this page does not cover

The queue that replays failed calls, the cookie flags in depth, and the database rules for rotation are already written. Linking them is the point. Entra ID redirect login is a different startup problem: [Entra ID with Angular](/blog/entra-id-angular-aspnet-core). Do not mix a confidential-client code flow into this initializer.

**Related:** [401 refresh queue](/blog/angular-interceptor-401-refresh-queue) | [HttpOnly refresh cookie](/blog/refresh-token-httponly-cookie-angular-aspnet-core) | [Refresh token rotation](/blog/aspnet-core-jwt-refresh-token-rotation) | [Auth guard](/blog/angular-auth-guard-aspnet-core)

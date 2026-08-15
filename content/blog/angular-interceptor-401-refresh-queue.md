---
title: "Angular Interceptor: Queue Concurrent 401s So Refresh Runs Once"
description: "The concurrent 401 stampede against ASP.NET Core JWT refresh: why shareReplay still double-rotates, how I queue retries in RxJS, and what to skip so you do not log the user out."
date: "2026-08-16"
category: "authentication"
tags: ["Angular", "JWT", "ASP.NET Core", "Security", "RxJS"]
---

The dashboard loads six widgets. The access JWT expired thirty seconds ago. Six HTTP calls return **401** in the same tick. Six interceptors call `/auth/refresh`. If the API [rotates refresh tokens](/blog/aspnet-core-jwt-refresh-token-rotation), the second caller presents a token the first caller already consumed. The server may treat that as **reuse** and kill the session. The user did nothing wrong.

This page is only that failure: **multiple 401s, one refresh, queued retries**. The broader interceptor, storage, and guard story lives in [Angular JWT interceptors](/blog/angular-jwt-interceptors). Do not copy that article into this one.

## What “queue” means (and what it does not)

I do **not** mean a FIFO of refresh HTTP calls. I mean:

1. The first 401 **owns** the refresh request.
2. Later 401s **wait** on that same in-flight work.
3. When refresh succeeds, waiters **retry their original requests** with the new access token.
4. When refresh fails, waiters **fail once** and the app routes to login — not six toasts and a loop.

If you fire six refreshes, you do not have a queue. You have a race.

## Why a naive `shareReplay` still double-rotates

The sketch in many tutorials (including a simplified version I use as a starting point) stores one `Observable` and `shareReplay(1)`s it. That is necessary. It is not sufficient.

I have still seen **two refresh network calls** when:

- **Two interceptors** are registered (root + a lazy-loaded feature `provideHttpClient`). Each has its own injected service instance if the refresh helper is not `providedIn: 'root'`, or worse, two copies of the interceptor function close over different state.
- **The refresh call itself goes through the same 401 interceptor.** Refresh returns 401 (expired cookie, CSRF, or rotation already happened). The interceptor tries to refresh again. Infinite loop, or a second rotation.
- **`HttpClient` inside the refresh service is intercepted.** The in-flight flag is set *after* `http.post` is constructed; a second 401 sneaks in before the assignment. Classic TOCTOU in JavaScript’s single thread still happens across two microtasks if you `await` something before setting the lock.
- **Two browser tabs.** `shareReplay` is per tab. Tab A rotates; tab B still holds the old refresh body token and looks like a thief. Cookies shared across tabs need a **single refresh owner** (BroadcastChannel, or [keep refresh off the SPA](/blog/bff-pattern-aspnet-core-angular-yarp)).

Fix the interceptor graph first. Then add the lock.

## Skip list (do this before RxJS cleverness)

Do **not** refresh when:

| Condition | Why |
| --- | --- |
| Status is **403** | Authenticated, not allowed. Refresh will not change the role. |
| Request URL is the **refresh** (or login) endpoint | You would recurse. |
| Request already has a **retry marker** | One retry. Not three. |
| You already **logged out** this session | Waiters should error, not mint a new session. |

ASP.NET Core APIs that return 401 for failed policies will keep you in this article forever. Fix `[Authorize]` to 403 when the user is known. I have written that into more healthcare APIs than I have rewritten Angular for.

## A lock that is assigned synchronously

The important line is: **set the in-flight observable before any async work**.

```typescript
@Injectable({ providedIn: 'root' })
export class RefreshGate {
  private inFlight: Observable<string> | null = null;

  constructor(
    private http: HttpClient,
    private tokens: AuthTokenService,
  ) {}

  waitForNewAccessToken(): Observable<string> {
    if (!this.inFlight) {
      this.inFlight = this.http
        .post<RefreshResponse>(
          `${environment.apiUrl}/auth/refresh`,
          {},
          {
            withCredentials: true,
            headers: { 'X-Skip-Auth-Refresh': '1' },
          },
        )
        .pipe(
          tap((res) => this.tokens.setAccessToken(res.accessToken)),
          map((res) => res.accessToken),
          finalize(() => {
            this.inFlight = null;
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }

    return this.inFlight;
  }
}
```

`refCount: false` keeps the replay for late subscribers in the same stampede. `finalize` clears the lock so the **next** expiry can refresh again. If you never clear it, the user cannot recover after a failed refresh without a full reload.

The custom header (or a URL allowlist) is how the interceptor **opts the refresh POST out** of the 401 handler.

## Interceptor: wait, then retry once

```typescript
export const queuedRefreshInterceptor: HttpInterceptorFn = (req, next) => {
  const gate = inject(RefreshGate);
  const tokens = inject(AuthTokenService);
  const router = inject(Router);

  if (req.headers.has('X-Skip-Auth-Refresh')) {
    return next(req);
  }

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || req.headers.has('X-Retry')) {
        return throwError(() => err);
      }

      return gate.waitForNewAccessToken().pipe(
        switchMap((accessToken) => {
          const retry = req.clone({
            setHeaders: {
              Authorization: `Bearer ${accessToken}`,
              'X-Retry': '1',
            },
          });
          return next(retry);
        }),
        catchError((refreshErr) => {
          tokens.clear();
          void router.navigate(['/login'], {
            queryParams: { reason: 'session-expired' },
          });
          return throwError(() => refreshErr);
        }),
      );
    }),
  );
};
```

`switchMap` here is “after refresh, run **this** request.” It does not cancel other waiters. Each 401 pipeline has its own `switchMap`. They all subscribe to the **same** `inFlight` observable. That is the queue.

Register **once** at application bootstrap:

```typescript
provideHttpClient(withInterceptors([attachBearerInterceptor, queuedRefreshInterceptor]))
```

If a feature module calls `provideHttpClient` again, you cloned the stampede. I grep for `provideHttpClient` in inherited Angular repos before I touch RxJS.

## POSTs and “retry the original request”

Retrying `GET /api/claims` is easy. Retrying `POST /api/claims` after a 401 is a **product** decision. The first POST may have succeeded; the 401 might be a lost response. A blind retry can double-submit a claim or a payment.

What I do on healthcare and marketplace APIs:

- GET/HEAD/OPTIONS: retry after refresh
- PUT/PATCH with idempotent semantics: retry
- POST that creates money or clinical records: **do not** auto-retry unless the API has an **Idempotency-Key** and the team tested duplicate suppression

The interceptor can skip retry for those URLs and instead surface “session refreshed — submit again.” Ugly. Safer than two 837-shaped submissions.

## Multi-tab (optional, and often skipped)

If the refresh token lives in **JavaScript** (memory or `localStorage`), two tabs **will** race. Options:

1. Move refresh to an [httpOnly cookie](/blog/refresh-token-httponly-cookie-angular-aspnet-core) and still single-flight **per tab** (cookie is shared; rotation still needs a lock **or** a server that coalesces races — see the rotation article).
2. `BroadcastChannel('auth-refresh')` so tab B waits for tab A’s new access token.
3. Stop holding refresh in the SPA: [BFF](/blog/bff-pattern-aspnet-core-angular-yarp).

I do not add BroadcastChannel on an internal admin with one user. I do add it when clinicians keep two dashboards open all day.

## How I prove it in DevTools

1. Set access token TTL to 60 seconds in a test environment.
2. Open Network, filter `refresh`.
3. Hard-expire the access token (or wait).
4. Trigger a screen with **four** parallel `forkJoin` / widget calls.
5. Expect **one** refresh row, then four retries with `X-Retry`.

If you see two refresh rows, the lock is not shared. If you see refresh looping, the refresh URL is not skipped. If the user is logged out with a 401 on refresh, check [family revoke](/blog/aspnet-core-jwt-refresh-token-rotation) — you may have already lost the race on the server.

## What this article is not

It is not a JWT tutorial. It is not cookie vs `localStorage`. It is not “how to write an interceptor.” Those pages exist. This page exists because **concurrent 401 + rotation** is the bug that looks like “Angular auth is flaky” on Monday morning.

---

If your SPA logs people out when several widgets load at once against an ASP.NET Core refresh endpoint, [contact me](/contact). Bring a HAR with two refresh calls if you have one — that is usually enough to see whether the race is the client or the API.

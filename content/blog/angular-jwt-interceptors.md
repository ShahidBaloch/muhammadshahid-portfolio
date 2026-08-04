---
title: "Angular JWT Interceptors: Bearer Tokens, Refresh, and 401 Handling That Survives Production"
description: "How I wire Angular HTTP interceptors for JWT access tokens, refresh rotation, and 401 recovery against ASP.NET Core and IdentityServer APIs — including memory vs localStorage tradeoffs."
date: "2026-02-22"
category: "architecture"
tags: ["Angular", "JWT", "ASP.NET Core", "Security"]
---

Every Angular app that talks to a secured ASP.NET Core API eventually needs the same plumbing: attach a bearer token, recover when it expires, and stop the user from seeing five login screens because five parallel requests all tried to refresh at once.

I have implemented this pattern on healthcare admin portals, CarBazaar-style marketplace backends, and catalog systems where the API issues short-lived JWTs — sometimes through custom token endpoints, sometimes through IdentityServer. The libraries change; the delivery problems do not.

This post is the interceptor setup I ship and the storage tradeoffs I explain to clients before go-live.

## The contract between SPA and API

Before writing interceptors, align on behavior with the backend:

- Access tokens are short-lived (I aim for 5–15 minutes on business SPAs)
- Refresh tokens rotate and can be revoked server-side
- `401 Unauthorized` means "not authenticated or token invalid/expired"
- `403 Forbidden` means "authenticated but not allowed" — **do not refresh on 403**

ASP.NET Core APIs that return 401 for policy failures train the SPA to refresh endlessly. Fix the status codes first.

## Token storage: memory vs localStorage (and what I recommend)

Clients ask where to store JWTs. The honest answer depends on threat model, hosting, and whether refresh tokens can live in httpOnly cookies.

**In-memory access token (my default for access tokens)**

- Pros: XSS cannot exfiltrate what is not in `localStorage`; tab close clears the session naturally
- Cons: full page refresh loses the access token unless you refresh silently on startup; multiple tabs do not share memory

**localStorage / sessionStorage**

- Pros: survives refresh; easy to implement; works when API and SPA are on awkward cross-domain setups
- Cons: any XSS can read tokens; developers tend to duplicate token state across services and NgRx stores

**httpOnly secure cookie for refresh token**

- Pros: JavaScript cannot read it; pairs well with SameSite and CSRF defenses on the API
- Cons: requires correct CORS credentials, cookie domains, and IdentityServer or custom refresh endpoints configured for cookies

On a provider registration portal I delivered, we kept the access token in a root-level `AuthTokenService` field and the refresh token in an httpOnly cookie set by the ASP.NET Core auth endpoint. Angular never touched the refresh token directly — the interceptor called `/auth/refresh` with `withCredentials: true`.

On a constrained eCommerce admin where cookies were painful across environments, both tokens lived in memory after login, with refresh-on-app-init reading from a sessionStorage backup only when the client explicitly accepted that tradeoff for internal staff tools behind VPN.

I document the choice in the README so the next developer does not "fix" auth by copying tokens into `localStorage` for convenience.

## AuthTokenService: one owner for token state

Interceptors should not scatter storage logic.

```typescript
@Injectable({ providedIn: 'root' })
export class AuthTokenService {
  private accessToken: string | null = null;

  getAccessToken(): string | null {
    return this.accessToken;
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  clear(): void {
    this.accessToken = null;
  }
}
```

Login sets the token. Logout clears it. Refresh updates it. Feature services never read `localStorage` directly.

## Interceptor 1: attach Authorization

```typescript
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokens = inject(AuthTokenService);
  const apiUrl = inject(API_URL);

  if (!req.url.startsWith(apiUrl)) {
    return next(req);
  }

  if (req.url.includes('/auth/login') || req.url.includes('/auth/refresh')) {
    return next(req);
  }

  const token = tokens.getAccessToken();
  if (!token) {
    return next(req);
  }

  return next(req.clone({
    setHeaders: { Authorization: `Bearer ${token}` }
  }));
};
```

Skip auth routes so you do not send an expired bearer token to the refresh endpoint.

## Interceptor 2: 401 handling with single-flight refresh

The production bug is refresh stampedes. User opens a dashboard; six widgets request data; access token expired; six refresh calls fire; some succeed, some fail, user lands on login with partial UI state.

Use one in-flight refresh observable shared by all waiters:

```typescript
@Injectable({ providedIn: 'root' })
export class AuthRefreshService {
  private refreshInFlight$: Observable<string> | null = null;

  constructor(
    private http: HttpClient,
    private tokens: AuthTokenService,
    private router: Router
  ) {}

  refreshAccessToken(): Observable<string> {
    if (!this.refreshInFlight$) {
      this.refreshInFlight$ = this.http.post<{ accessToken: string }>(
        `${environment.apiUrl}/auth/refresh`,
        {},
        { withCredentials: true }
      ).pipe(
        tap(res => this.tokens.setAccessToken(res.accessToken)),
        map(res => res.accessToken),
        catchError(err => {
          this.tokens.clear();
          this.router.navigate(['/login'], {
            queryParams: { reason: 'session-expired' }
          });
          return throwError(() => err);
        }),
        finalize(() => { this.refreshInFlight$ = null; }),
        shareReplay(1)
      );
    }
    return this.refreshInFlight$;
  }
}
```

Error interceptor sketch:

```typescript
export const refreshInterceptor: HttpInterceptorFn = (req, next) => {
  const refresh = inject(AuthRefreshService);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || req.headers.has('X-Retry')) {
        return throwError(() => err);
      }

      return refresh.refreshAccessToken().pipe(
        switchMap(token => {
          const retry = req.clone({
            setHeaders: {
              Authorization: `Bearer ${token}`,
              'X-Retry': '1'
            }
          });
          return next(retry);
        })
      );
    })
  );
};
```

Register both interceptors at app root with `provideHttpClient(withInterceptors([authInterceptor, refreshInterceptor]))`. Duplicate interceptors in lazy modules recreate the stampede.

## ASP.NET Core and IdentityServer coordination

The Angular side is only half the story. On the API I verify:

- Refresh tokens stored hashed with expiry, revocation, and rotation
- Reuse of an old refresh token revokes the whole family (stolen refresh detection)
- JWT validation checks issuer, audience, signing key, and lifetime
- Clock skew configured modestly on the server — not patched by ignoring expiry in Angular

IdentityServer setups need explicit CORS and cookie configuration when the SPA and authority sit on different hosts. I test refresh from the deployed origin, not only localhost.

For healthcare clients, refresh failure logs include session id and user id — never PHI in log messages.

## UX details that separate demo auth from production auth

Technically correct interceptors can still feel broken:

- Queue or defer error toasts while refresh runs so users do not see six "Unauthorized" popups
- On refresh failure, show "Session expired" instead of a generic server error
- For long forms — common in provider registration — persist draft state locally so re-login does not erase twenty minutes of input
- On app init, if access token is empty but refresh cookie may exist, attempt silent refresh before routing guards reject every page

Guards should align with interceptor state. A guard that only checks memory while refresh-on-init is async causes flicker redirects to login.

## What I test before handoff

1. Valid token: requests include `Authorization`, no refresh call
2. Expired access token, valid refresh: exactly one refresh, original requests succeed
3. Two parallel 401s: still one refresh network call
4. Invalid refresh: tokens cleared, single navigation to login, no infinite loop
5. 403 on a forbidden resource: no refresh attempt
6. Full page reload: session recovery behaves per the documented storage strategy

I also manually expire tokens in DevTools and walk through the client's highest-traffic screens — not only the login page demo.

## Mistakes I fix on inherited projects

- **Refreshing on every 401**, including permission failures
- **Multiple token copies** in NgRx, services, and interceptors that drift
- **Retrying POST** requests blindly without idempotency keys where duplicates hurt
- **localStorage for access tokens** on internet-facing apps without discussing XSS surface
- **No logout on refresh reuse** when the API detects token theft

## Closing

Solid JWT interceptors come down to a single token owner, bearer attachment on API routes only, single-flight refresh with one retry marked by a custom header, and storage choices documented rather than accidental. Pair that with an ASP.NET Core refresh endpoint that rotates and revokes honestly, and Angular apps stay usable while access tokens stay short-lived.

If your SPA is stuck in login loops or refresh storms against an IdentityServer or custom JWT API, [get in touch](/contact).

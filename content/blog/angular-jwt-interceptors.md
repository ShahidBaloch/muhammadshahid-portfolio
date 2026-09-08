---
title: "Angular JWT Interceptors for ASP.NET Core APIs"
description: "Angular HTTP interceptors for ASP.NET Core JWT — bearer attach, in-memory token storage, single-flight refresh, 401 vs 403 handling, and IdentityServer CORS coordination."
date: "2026-02-22"
category: "authentication"
tags: ["Angular", "JWT", "ASP.NET Core", "Security"]
faq:
  - q: "How do Angular JWT interceptors attach a bearer token?"
    a: "An HttpInterceptor clones each request to the API and sets Authorization: Bearer plus the access token from memory. Guards do not do this; they only block routes."
  - q: "Should I keep the access JWT in localStorage?"
    a: "Prefer memory for the access token. localStorage survives XSS. Refresh storage is a different decision — cookie, rotation, or BFF — not this interceptor overview."
  - q: "Do interceptors replace Angular auth guards?"
    a: "No. Guards decide whether a URL may open. Interceptors attach tokens and recover 401s. You need both, plus API authorization that does not trust the SPA."
---

**An Angular JWT interceptor** is an `HttpInterceptorFn` that clones outgoing API requests to attach `Authorization: Bearer`, and optionally catches 401s to refresh once and retry.

```text
HttpClient.get('/api/orders')
       │
       ▼
 authInterceptor ──► adds Bearer access token
       │
       ▼
   API call ──401──► refreshInterceptor ──► ONE refresh ──► retry with X-Retry
       │
      200
```

Interceptors are the **automatic toll transponder** on every highway on-ramp: you do not hand cash at each exit. Guards only decide whether you may enter the highway system; interceptors pay the toll on every API mile.

**New to this** → stay here. **Route blocking** → [auth guards](/blog/angular-auth-guard-aspnet-core). **Concurrent 401 stampede** → [401 refresh queue](/blog/angular-interceptor-401-refresh-queue). **API issuance** → [ASP.NET Core JWT checklist](/blog/aspnet-core-jwt-auth). **Interview prep** → [If an interviewer asks](#if-an-interviewer-asks).

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

## If an interviewer asks

**"Where should the access JWT live in Angular?"**

**Strong answer:** Memory in a root `AuthTokenService` by default. localStorage survives XSS. Refresh in httpOnly cookie or BFF is a separate decision. Document the tradeoff; do not let feature teams read `localStorage` directly.

**"Why two interceptors instead of one?"**

**Strong answer:** Separation of concerns — attach bearer on every API call; handle 401 only on failures. Skip auth routes in the attach interceptor so you do not send an expired token to `/auth/refresh`. Register both once at app root; duplicate interceptors in lazy modules recreate refresh stampedes.

**"What happens on 403 in the interceptor?"**

**Strong answer:** Nothing to tokens. Show "not allowed." Refreshing on 403 does not grant a missing role and may confuse users into thinking their session died.


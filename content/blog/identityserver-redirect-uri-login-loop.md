---
title: "IdentityServer Redirect URI Mismatch and Angular Login Loops"
description: "IdentityServer login loops and redirect_uri mismatch — Duende / OpenIddict client URIs, Angular redirectUrl, post_logout, and PathBase. Not the Identity vs SSO decision."
date: "2026-09-07"
category: "identity"
tags: ["IdentityServer", "OpenIddict", "OIDC", "Angular", "ASP.NET Core"]
faq:
  - q: "Why does IdentityServer loop Angular login?"
    a: "Most often redirect_uri is not an exact registered match: http vs https, www, PathBase, or a trailing slash. The authorize endpoint rejects the URI and the SPA retries."
  - q: "Is a login loop always a redirect URI mismatch?"
    a: "No. Cookie SameSite, silent renew, and a guard that redirects on every 401 also loop. Check the IdentityServer log for redirect_uri is not valid before rewriting Angular."
  - q: "Do post_logout_redirect_uri values need registering too?"
    a: "Yes. Logout loops are the same class of bug with a different client field. Register both login and logout URIs per environment."
---

People search **IdentityServer** when Angular bounces between `/connect/authorize` and the app origin and nobody is logged in. Logs say `redirect_uri is not valid`, or they say nothing. Swagger’s password flow still works.

Whether you should run an identity server at all is [IdentityServer vs ASP.NET Identity](/blog/identityserver-vs-aspnet-identity). Leaving IS4 is the [OpenIddict checklist](/blog/identityserver4-openiddict-migration-checklist). This URL is **client redirect URIs and the login loop** — not another SSO essay.

## Two failures that look the same in the SPA

| What you see | What actually failed |
| --- | --- |
| Authorize → error page / “invalid request” | `redirect_uri` not on the client (character-exact) |
| Authorize → app → authorize forever | URI was valid; SPA dropped code, state, or tokens |

Do not debug Angular interceptors until you know which row you are in.

## Mismatch is character-exact

I have failed reviews on trailing slashes, `http` vs `https`, `www` vs apex, and a silent-renew iframe on a path that was never registered.

```csharp
client.RedirectUris =
{
    "http://localhost:4200/auth-callback",
    "http://localhost:4200/silent-renew.html",
    "https://app.example.com/auth-callback",
    "https://app.example.com/silent-renew.html",
};
client.PostLogoutRedirectUris =
{
    "http://localhost:4200/",
    "https://app.example.com/",
};
```

`redirect_uri` (login) and `post_logout_redirect_uri` (logout) are **different lists**. Registering the callback does not register `/`. Slot hosts (`*.azurewebsites.net`) are extra rows, not optional.

Angular (`angular-auth-oidc-client` or similar) must send the same strings:

```typescript
redirectUrl: `${window.location.origin}/auth-callback`,
postLogoutRedirectUri: window.location.origin,
silentRenewUrl: `${window.location.origin}/silent-renew.html`,
authority: 'https://id.example.com', // must match discovery issuer
```

Log the requested `redirect_uri` next to the client’s allowed list. If you cannot see that pair, you are guessing.

## The login loop (URI was accepted)

The host issued a code. The SPA never “lands.” Causes I see that are **not** in the comparison article:

1. **`authority` ≠ discovery `issuer`** — trailing slash on one side
2. **`/connect/token` fails** — PKCE verifier lost, CORS on the token endpoint, or confidential client without a secret the SPA should not have
3. **CDN or PathBase stripped `?code=`** — gateway maps `/id` to the host but Angular returns to `/auth-callback` without the query
4. **Two tabs** — state/nonce consumed once; the second tab retries authorize
5. **Interceptor treats missing access token as logged-out** and sends the user back to authorize

The loop looks like “IdentityServer is broken.” Tokens never made it into memory. Interceptor plumbing is [Angular JWT interceptors](/blog/angular-jwt-interceptors), not this page.

## PathBase and the public origin

Behind a reverse proxy I set the public origin once:

```csharp
app.Use((context, next) =>
{
    context.Request.Scheme = "https";
    return next();
});
// plus UseForwardedHeaders — see middleware order
```

If IdentityServer issues `http://internal:5001` in the authorize redirect, Angular will not match `redirectUrl`. Pipeline order for forwarded headers is [middleware order](/blog/aspnet-core-middleware-order).

## What I check (this bug only)

1. IdentityServer log: was `redirect_uri` valid? If no, stop. Fix the client row.
2. Network: `/connect/authorize` 302 to the SPA **with `code=` still on the URL**
3. `/connect/token` 200 with `access_token`
4. Discovery `issuer` === Angular `authority`
5. `GET /api/me` sends `Authorization: Bearer`

If step 2 fails, registration or HTTPS/PathBase. If step 3 fails, PKCE/CORS/client type. If step 5 fails, interceptor — different article.

## Checklist

- [ ] Login callback, silent renew, and logout URIs are three concerns, all registered
- [ ] No trailing-slash / www / scheme drift vs Angular
- [ ] Staging slot URL is on the client if you test there
- [ ] Discovery issuer === Angular authority
- [ ] Token request succeeds (not only authorize)
- [ ] Query string survives the reverse proxy

If you are stuck in an IdentityServer / OpenIddict redirect loop with Angular, [contact me](/contact). Bring the client’s allowed URIs and one failing authorize URL — not a screenshot of the login page.

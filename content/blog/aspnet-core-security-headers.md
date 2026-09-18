---
title: "Security Headers in ASP.NET Core"
description: "Which security headers an ASP.NET Core app should send: nosniff, frame, referrer, and HSTS. What each one stops, and when HSTS on a first response is a mistake."
date: "2026-09-18"
updated: "2026-09-18"
category: "architecture"
tags: ["ASP.NET Core", "Security", "HTTPS", "HSTS"]
related:
  - aspnet-core-forwarded-headers
  - aspnet-core-middleware-order
  - azure-app-service-aspnet-core
faq:
  - q: "Which security headers should ASP.NET Core send?"
    a: "X-Content-Type-Options: nosniff, a frame policy (DENY unless you embed yourself), Referrer-Policy, and HSTS only after the site is permanently on HTTPS."
  - q: "Should I turn on HSTS on the first deploy?"
    a: "No. HSTS tells browsers to refuse HTTP for months. If the certificate or the proxy is wrong, you have locked users out. Confirm HTTPS, then add a short max-age and raise it."
  - q: "Does UseHttpsRedirection replace these headers?"
    a: "No. Redirection changes the scheme of one request. Headers tell the browser how to treat the response it already received."
---

The browser will sniff a file, allow a clickjacking frame, and leak the full URL to the next site unless the response says otherwise. Four headers cover the cases that show up in a normal review. A long copied list from a scanner is not a policy.

Hub: [Architecture](/learning/architecture). The HTTPS scheme has to be correct before HSTS means anything: [forwarded headers](/blog/aspnet-core-forwarded-headers). Order of middleware: [middleware order](/blog/aspnet-core-middleware-order).

## Real-world analogy

The header is a note on the parcel. "Do not guess what is inside" is nosniff. "Do not open this box inside someone else's shop window" is the frame header. "If you forward this, do not include the full packing slip" is referrer policy. HSTS is a sign on the street that says the shop will only unlock the front door, and the sign stays up for months. You do not hang that sign while the locksmith is still working.

## Worked example

A scan of the Angular host says `X-Content-Type-Options` is missing. A user uploads a file that is served back from the same origin with a generic content type. The browser sniffs it and runs it as script. `nosniff` makes the browser keep the content type you set, so a text file stays text. The same scan flags framing. The app is not embedded anywhere, so `DENY` is right. If a partner portal iframes a page, `DENY` breaks that page and the fix is a narrower frame policy on that route only, not removing the header from the API.

| Header | Value to start with | Stops |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Browser treating a file as script because of its bytes |
| `X-Frame-Options` | `DENY` | Another site framing your pages |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Full path leaking to other sites |
| `Strict-Transport-Security` | short `max-age`, HTTPS only | Downgrade to HTTP after the first good visit |

## Code

```csharp
app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers["X-Content-Type-Options"] = "nosniff";
    headers["X-Frame-Options"] = "DENY";
    headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    await next();
});
```

Add `UseHsts` only in production, and only after [App Service](/blog/azure-app-service-aspnet-core) is serving the right certificate. A local HTTP port with HSTS confuses the next week of debugging. Do not add a content-security-policy you copied from a blog until you have listed the scripts the Angular build actually loads. A policy that blocks your own bundle is a blank page, not a harder site.

Identity-heavy boundaries where headers are part of the review: [Healthcare SaaS](/work/healthcare-saas).

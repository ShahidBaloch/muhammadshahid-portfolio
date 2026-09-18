---
title: "ASP.NET Core Forwarded Headers Behind Azure and YARP"
description: "Fix ASP.NET Core redirecting to http, dropping the real client IP, or looping on HTTPS when it sits behind Azure App Service or YARP. The proxy is untrusted until you say so."
date: "2026-09-18"
updated: "2026-09-18"
category: "architecture"
tags: ["ASP.NET Core", "Azure", "YARP", "HTTPS"]
related:
  - azure-app-service-aspnet-core
  - bff-pattern-aspnet-core-angular-yarp
  - aspnet-core-middleware-order
  - docker-dotnet-angular-local
faq:
  - q: "Why does ASP.NET Core redirect to http behind a reverse proxy?"
    a: "The proxy terminates TLS and calls the app on http. Without forwarded headers, UseHttpsRedirection sees http and redirects the browser again. Trust X-Forwarded-Proto before the HTTPS redirect middleware, or the loop never stops."
  - q: "Why is the client IP always the proxy?"
    a: "RemoteIpAddress is the immediate TCP peer. The original client is in X-Forwarded-For only after UseForwardedHeaders accepts that proxy. The default known networks are loopback, so a cloud proxy is ignored."
  - q: "Is it safe to clear KnownNetworks?"
    a: "Only if clients cannot reach the app except through a proxy that strips incoming forwarded headers. Azure App Service does that. An app with a public port plus cleared networks lets any caller spoof their IP and scheme."
---

The symptom is a redirect loop, a cookie set for the wrong host, or logs full of the load balancer's IP. The request the browser made is HTTPS. The request Kestrel saw is HTTP, from a proxy, and the app believed Kestrel.

Deploy context: [Azure App Service](/blog/azure-app-service-aspnet-core). If YARP is the proxy you run yourself: [BFF and YARP](/blog/bff-pattern-aspnet-core-angular-yarp). Middleware order in general: [middleware order](/blog/aspnet-core-middleware-order).

## Real-world analogy

The app is a clerk in a back office. The load balancer is the receptionist who actually met the visitor. The clerk only sees the receptionist. A note on the folder says "this visitor came in the front door, over HTTPS." If the clerk refuses notes from anyone except people sitting in the same room, the note is ignored. The clerk then insists the visitor walked in the service entrance, on plain HTTP, and sends them back outside. That loop is the redirect.

## Worked example

The browser requests `https://shop.example/api/orders`. App Service terminates TLS and calls Kestrel at `http://10.0.0.4`. `X-Forwarded-Proto` is `https`. The default known networks are loopback, so the header is dropped, `Request.Scheme` stays `http`, and `UseHttpsRedirection` answers 307 to the HTTPS URL. The browser repeats. CPU climbs, cookies get set for the wrong scheme, and logs show the proxy IP for every user. Put `UseForwardedHeaders` first, and only trust every proxy if the platform overwrites those headers before they reach you. A container that is also open on a public port should name the proxy instead of clearing the lists.

## What the app sees

Azure, a container ingress, or YARP connects to your process with plain HTTP on the private network. It copies the browser's scheme and address into headers:

- `X-Forwarded-Proto: https`
- `X-Forwarded-For: <client ip>`

`ForwardedHeadersOptions` trusts those headers only from `KnownProxies` and `KnownNetworks`. The default is loopback. A proxy at `10.x` or `172.x` does not qualify, so the headers are ignored, `Request.Scheme` stays `http`, and `UseHttpsRedirection` sends the user back to an HTTPS URL that hits the proxy again.

## The order

```csharp
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders =
        ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    // App Service is the only path to this process, and it overwrites these headers.
    o.KnownNetworks.Clear();
    o.KnownProxies.Clear();
});

var app = builder.Build();

app.UseForwardedHeaders();
app.UseHttpsRedirection();
```

`UseForwardedHeaders` has to run first. After it, `Request.Scheme` is `https` and the redirect middleware stays quiet. If you insert it after authentication, the auth middleware already built URLs from `http`.

## When not to clear the lists

Clearing both collections means "trust this header from anyone." That is acceptable on App Service, because the front end replaces client-supplied `X-Forwarded-*` headers before they reach you. It is not acceptable if Kestrel is also bound to a public port. In that case set `KnownProxies` to the YARP or ingress address and leave the clear out.

Do not read `X-Forwarded-For` yourself with `Headers["X-Forwarded-For"]` and also call `UseForwardedHeaders`. Pick one. The middleware is the one that updates `RemoteIpAddress` and `Request.Scheme`, which is what redirection, cookies, and rate limiting already use.

## How to confirm

Hit the health or any API URL through the public host. Log `Request.Scheme` and `Connection.RemoteIpAddress` for one request. Scheme must be `https`. The IP must not be the proxy. If both are still the internal values, the middleware is not first, or the proxy is not sending the headers.

Container networking makes the same bug local: [Docker with Angular](/blog/docker-dotnet-angular-local).

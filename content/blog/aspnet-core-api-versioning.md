---
title: "ASP.NET Core API Versioning for Angular Clients"
description: "How to version an ASP.NET Core API that an Angular app calls: URL versus header, what to do with old clients, and how generated clients stay in sync."
date: "2026-09-18"
updated: "2026-09-18"
category: "api-design"
tags: ["ASP.NET Core", "API Design", "Angular", "OpenAPI"]
related:
  - aspnet-core-minimal-apis
  - swagger-openapi-aspnet-core
  - angular-dotnet-integration
  - aspnet-core-api-validation
faq:
  - q: "How should I version an ASP.NET Core API used by Angular?"
    a: "Pick one signal and document it. URL versioning (/api/v1) is the easiest for an Angular app and for generated clients. Header versioning is fine if every client, including the SPA, always sends it."
  - q: "Do I need Microsoft.AspNetCore.Mvc.Versioning?"
    a: "For Minimal APIs, a route prefix or an explicit group is enough. For controllers, the versioning package (or the newer Asp.Versioning.Http) keeps several versions on one route. Do not invent a custom header if a prefix already works."
  - q: "How do I stop old Angular builds from breaking?"
    a: "Keep the previous version deployed until the SPA is forced to update. Sunset it with a response header and a date, not a silent shape change on v1."
---

Angular and the API ship on different cadences. Versioning is how a response shape can change without breaking a tab that has not refreshed.

Hub: [API design](/learning/api-design). Related: [Minimal APIs](/blog/aspnet-core-minimal-apis), [OpenAPI](/blog/swagger-openapi-aspnet-core), [Angular integration](/blog/angular-dotnet-integration).

## Real-world analogy

A restaurant reprints the menu. Tables that already have the old card still order the old dish. You do not walk over and scratch a line off their card. You leave v1 in their hands until those tables leave, and the new card is v2. A silent edit to v1 is a customer getting a different meal than the one they ordered.

## Worked example

The Angular app on production was built yesterday and calls `GET /api/v1/orders`. This morning the API renames `total` to `amount` on that same route. Anyone who has not refreshed gets a blank total and a console error. The fix is a new route group, `/api/v2/orders`, that returns `amount`. v1 keeps `total` until you have shipped the new bundle and watched the v1 calls drop. Then v1 returns 410, not a quietly different JSON.

## Pick one signal

| Style | Angular call | When to use it |
|---|---|---|
| URL `/api/v1/orders` | Obvious in the generated client | Default for SPAs |
| Header `api-version: 1.0` | Easy to forget in one interceptor | Several versions on one path |
| Query `?api-version=1.0` | Cache keys get noisy | Avoid unless a client cannot set headers |

Use the URL unless a gateway already requires a header. One signal. Not both.

## URL groups

```csharp
var v1 = app.MapGroup("/api/v1/orders");
v1.MapGet("/", ListOrdersV1);
v1.MapGet("/{id:guid}", GetOrderV1);

var v2 = app.MapGroup("/api/v2/orders");
v2.MapGet("/", ListOrdersV2);
```

V2 can return `customerId` as a string and drop a field V1 still sends. Do not change V1 "because the Angular code on main already expects V2." Production still has yesterday's bundle.

## What belongs in a version

Version a breaking change: removed field, renamed field, different enum, required body property. Do not version a new optional field. Old clients ignore it.

## Angular

Point the OpenAPI generator at `/openapi/v1.json` and `/openapi/v2.json` if both exist. One generated folder per version. The interceptor should not guess the version from the URL if the generated client already embeds it.

A refresh-token interceptor must still run for every version. Versioning is not auth. See [JWT refresh](/blog/aspnet-core-jwt-refresh-token-rotation).

## Sunset

When V1 dies, return `Sunset` and `Deprecation` on V1 responses for a release, then 410. Do not 404 a route the SPA still calls. 410 tells the client the contract ended. Log the user-agent so you know which build is left.

Ecom case that uses this kind of API boundary: [Ecom_NET10](/work/ecom-net10).

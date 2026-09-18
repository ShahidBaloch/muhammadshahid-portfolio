---
title: "ASP.NET Core Health Checks: Liveness vs Readiness"
description: "ASP.NET Core health checks that Azure and Kubernetes can trust: split liveness from readiness, check SQL only on ready, and do not let a slow dependency restart the process."
date: "2026-09-18"
updated: "2026-09-18"
category: "architecture"
tags: ["ASP.NET Core", "Health Checks", "Azure", "DevOps"]
related:
  - azure-app-service-aspnet-core
  - docker-dotnet-angular-local
  - ihttpclientfactory-aspnet-core
  - aspnet-core-global-exception-handling
faq:
  - q: "What is the difference between liveness and readiness in ASP.NET Core?"
    a: "Liveness answers: is the process up? Readiness answers: can it serve traffic? SQL, Redis, and downstream HTTP belong on readiness. A failed readiness check pulls the instance out of rotation. A failed liveness check restarts it."
  - q: "Should AddDbContextCheck run on the liveness endpoint?"
    a: "No. A database blip would restart every instance. Put the EF Core check on the readiness endpoint only."
  - q: "What path should Azure App Service ping?"
    a: "A dedicated path such as /health/ready, not the Angular index and not Swagger. Configure that path in App Service health check and return 200 only when dependencies the request needs are up."
---

A health check that always returns 200 hides outages. A health check that calls SQL and fails the process restarts a healthy app because the database sneezed. Split the two questions.

Deploy notes: [Azure App Service](/blog/azure-app-service-aspnet-core). Local containers: [Docker with Angular](/blog/docker-dotnet-angular-local).

## Real-world analogy

A lighthouse tells ships the tower is standing. That is liveness. The harbour master tells ships whether a berth is free. That is readiness. If you put the harbour master on the lighthouse, a full harbour makes every tower look dead, and someone sends a crew to rebuild a tower that was fine.

## Worked example

The live path calls `AddDbContextCheck`. SQL Server fails over for 40 seconds. Every instance returns 503 on liveness. The platform restarts all of them. They come back, hit the same failing check, and restart again. Move the database check to `/health/ready` and leave `/health/live` as "the process answered." During the failover, instances stay up and the load balancer stops sending traffic until SQL returns. No restart loop.

## Two endpoints

| Endpoint | Question | Failure means | Put here |
|---|---|---|---|
| `/health/live` | Is the process running? | Restart the container | A trivial check, or no checks |
| `/health/ready` | Should the load balancer send traffic? | Remove this instance | SQL, Redis, required HTTP |

Do not expose stack traces or connection strings on either path. Health JSON is often unauthenticated.

## Registration

```csharp
builder.Services.AddHealthChecks()
    .AddDbContextCheck<AppDbContext>(
        name: "sql",
        tags: ["ready"]);

app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("live")
});

app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready")
});
```

`AddDbContextCheck` opens a connection. That is readiness. Tag it `ready` and keep it off `/health/live`.

If you have no `live` tags, the predicate above makes `/health/live` report healthy with zero checks. That is what you want: the process answered.

## What not to check

- Do not HTTP-call another service on the liveness path. Use `IHttpClientFactory` on readiness, with a short timeout, and only if this API cannot work without that service. See [IHttpClientFactory](/blog/ihttpclientfactory-aspnet-core).
- Do not check a cache that the app can skip. Redis down should not kill traffic if requests still succeed against SQL.
- Do not run a migration or a heavy query inside the check. `SELECT 1` is enough.

## Azure and Kubernetes

App Service health check expects HTTP 200 on the path you set. Point it at `/health/ready`. Unhealthy instances stop receiving requests. They do not restart unless you also wire liveness that way.

In Kubernetes, `livenessProbe` hits `/health/live`. `readinessProbe` hits `/health/ready`. Mixing them is the bug people google after a SQL failover restarts every pod at once.

## Angular

The SPA does not call these endpoints. A browser poll of `/health/ready` adds load and leaks dependency names. Let the platform probe. The UI handles request failures through the same error envelope as every other call.

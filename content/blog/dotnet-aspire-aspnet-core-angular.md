---
title: "Getting Started with .NET Aspire: AppHost, API, and Angular"
description: "Getting started with .NET Aspire: the AppHost, service defaults, and adding the ASP.NET Core API and the Angular app. That is the whole scope of this page."
date: "2026-10-01"
category: "architecture"
tags: [".NET Aspire", "ASP.NET Core", "Angular", "Docker", "Cloud Native"]
related:
  - docker-dotnet-angular-local
  - angular-dotnet-integration
  - aspnet-core-health-checks
  - ihttpclientfactory-aspnet-core
faq:
  - q: "What is .NET Aspire for ASP.NET Core?"
    a: "Aspire is an opinionated stack for cloud-native .NET apps: an AppHost orchestrates projects and resources locally, service defaults add health checks, resilience, and telemetry, and a dashboard shows logs/traces/metrics during development."
  - q: "How is Aspire different from Docker Compose for Angular + ASP.NET Core?"
    a: "Compose describes containers. Aspire AppHost describes .NET projects, executable frontends, and resources with code-centric wiring, service discovery, and a first-party dashboard. You can still use containers underneath."
  - q: "Does Aspire replace my production Kubernetes setup?"
    a: "No. Aspire improves inner-loop orchestration and cloud-ready defaults. Production deployment targets vary; treat Aspire as the local/cloud-native developer story unless you deliberately adopt its deployment patterns."
---

**.NET Aspire for ASP.NET Core and Angular** on this page is the AppHost, service defaults, and adding the API and the Angular app. The dashboard is [Aspire dashboard](/blog/dotnet-aspire-dashboard). Versus Compose is [Aspire vs Docker Compose](/blog/dotnet-aspire-vs-docker-compose).

```text
AppHost (orchestrator)
  |- API project (service defaults)
  |- Angular app (npm / endpoint)
  |- Redis / SQL resources
  v
Aspire dashboard (logs, traces, endpoints)
```

Metaphor: Docker Compose is a **spreadsheet of containers**. Aspire AppHost is a **program that boots your solution** with discovery and telemetry baked in.

**New to this** stay here for AppHost getting started. **Compose local** see [Docker .NET Angular local](/blog/docker-dotnet-angular-local). **API/Angular contracts** see [integration](/blog/angular-dotnet-integration). **Health checks** see [health checks](/blog/aspnet-core-health-checks). **HttpClient** see [IHttpClientFactory](/blog/ihttpclientfactory-aspnet-core).

Search intent for **dotnet aspire asp.net core** is how-to: AppHost basics with an Angular frontend in the loop.

## What Aspire adds over Docker Compose local

| Concern | Typical Compose | Aspire AppHost |
|---|---|---|
| Define API project | Dockerfile + service | `AddProject("api")` |
| Connection strings | env var spaghetti | Resources inject endpoints |
| Dashboard | DIY / none | First-party dashboard |
| Telemetry | Manual OTLP wiring | Service defaults |
| Angular | Separate npm terminal | `AddNpmApp` / executable patterns |
| Polyglot | Strong | Strong via containers/executables |

Compose remains excellent for pure infrastructure parity. Aspire shines when the center of gravity is .NET projects and you want inner-loop speed. Distinct from rewriting your entire [Docker local](/blog/docker-dotnet-angular-local) guide — link there for Compose-first teams.

## Create AppHost and service defaults

Workloads evolve; use current `dotnet new` Aspire templates for your SDK:

```bash
dotnet new aspire-starter -n ClinicApp
# or add AppHost + ServiceDefaults projects to an existing solution
```

Typical solution pieces:

- **AppHost** — orchestration entry point you F5.
- **ServiceDefaults** — extension methods: `AddServiceDefaults()`, `MapDefaultEndpoints()`.
- **API** — your ASP.NET Core app references ServiceDefaults.
- **Angular** — existing SPA wired into AppHost.

Service defaults usually register:

- OpenTelemetry tracing/metrics/logging exporters for local dashboard
- Health checks endpoints
- HttpClient resilience handlers (retries/timeouts) when configured
- Service discovery for named endpoints

Your API `Program.cs` sketch:

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.Services.AddControllers();
// AddDbContext, auth, etc.

var app = builder.Build();
app.MapDefaultEndpoints(); // health in Dev carefully — lock down in prod
app.MapControllers();
app.Run();
```

Health endpoint exposure habits still matter ([health checks](/blog/aspnet-core-health-checks)) — do not publicly advertise detailed health on the open internet.

## Add an ASP.NET Core API project

In AppHost `Program.cs`:

```csharp
var builder = DistributedApplication.CreateBuilder(args);

var redis = builder.AddRedis("redis");
var sql = builder.AddSqlServer("sql")
                 .AddDatabase("clinicdb");

var api = builder.AddProject<Projects.ClinicApp_Api>("api")
    .WithReference(redis)
    .WithReference(sql);

builder.Build().Run();
```

Project reference names and generic `Projects.*` types come from the AppHost MSBuild integration — follow the template your SDK generated. The idea: **declare resources once**, inject connection information into the API without copying ports into appsettings for every developer.

Inside the API, read configuration normally — Aspire sets env vars / connection strings for referenced resources. Pair with [IHttpClientFactory](/blog/ihttpclientfactory-aspnet-core) for outbound calls to other Aspire services by name.

## Add Angular frontend to the AppHost

Patterns vary by Aspire version; common approaches:

1. **`AddNpmApp`** (or equivalent) pointing at the Angular workspace — AppHost runs `npm start` / `ng serve` with the API URL injected.
2. **Executable** resource running the Angular CLI.
3. **YARP / SPA proxy** hosted by ASP.NET in some templates — still valid; Aspire orchestrates the host.

Sketch:

```csharp
var web = builder.AddNpmApp("angular", "../clinic-web")
    .WithReference(api)
    .WithHttpEndpoint(env: "PORT")
    .WithExternalHttpEndpoints();
```

Inject the API base URL into Angular via environment file generation or a runtime `window.__env` pattern — keep [integration habits](/blog/angular-dotnet-integration): typed DTOs, ProblemDetails parsing, no hardcoded localhost ports in source if Aspire assigns them.

For production builds, Angular still emits static files; Aspire local orchestration does not replace your CI `ng build` pipeline.

## Dashboard: what to watch in local Dev

When you F5 AppHost, the Aspire dashboard typically shows:

- Resource list (API, Redis, SQL, Angular) and running state
- Endpoints/URLs to click
- Structured logs per resource
- Distributed traces across HTTP calls
- Basic metrics

Use it to diagnose: API cannot reach Redis, Angular calling wrong port, slow EF queries appearing as long spans. This is an overview — deep OpenTelemetry configuration can be a sibling post.

## Resilience and telemetry defaults preview

Service defaults often add standard HttpClient resilience. That is helpful and can surprise you (retries on non-idempotent POSTs). Know what the template enables; override per client for payment calls. Telemetry defaults export to the local dashboard collector — in production point exporters at your real backend (App Insights, Grafana stack, etc.) deliberately.

## Aspire vs Compose decision (pointer)

Choose Aspire when:

- Multiple .NET projects + resources need one F5
- You want dashboard + defaults without DIY
- Angular should start with the same orchestration

Choose Compose when:

- Infra-first parity with prod containers is the main goal
- Little .NET-centric wiring is needed
- Team standard is Compose everywhere

Many teams use Aspire for inner loop and still publish container images for prod. Do not invent Azure production traffic claims here.

## Next steps checklist

1. Install matching .NET SDK / Aspire workload for your version.
2. Add AppHost + ServiceDefaults to the solution.
3. Reference API; add Redis/SQL resources you actually need.
4. Wire Angular via NpmApp or your chosen pattern; inject API URL.
5. MapDefaultEndpoints; verify health and dashboard traces for one request.
6. Keep appsettings secrets out of git; use user secrets / Key Vault for non-local.
7. Document for the team: "F5 AppHost" as the supported local path.
8. Decide prod story separately (App Service, containers, K8s) — Aspire local success ≠ prod topology.

## Pitfalls

- Exposing detailed health checks publicly in production because MapDefaultEndpoints was copied blindly.
- Hardcoding ports in Angular environment files while Aspire assigns dynamic ports.
- Assuming Aspire replaces CI build/test pipelines.
- Turning on aggressive HTTP retries for non-idempotent APIs.
- Mixing this guide with a full Azure production Aspire marketing pitch — keep local orchestration honest.

## Verification

1. F5 AppHost — API, Redis, Angular show running in dashboard.
2. Browser hits Angular; Network tab shows API calls succeeding with injected base URL.
3. Kill Redis resource; API health or logs show failure clearly; restart recovers.
4. Trace a single GET in the dashboard across Angular→API→SQL if instrumented.
5. `dotnet run` on API alone still works for quick unit work (optional path).

## If an interviewer asks

**What is .NET Aspire?** An opinionated cloud-native application model for .NET with AppHost orchestration, service defaults, and a local dashboard.

**Do we need it to run Angular with ASP.NET Core?** No — Compose or multiple terminals work. Aspire reduces glue for multi-resource solutions.


## Existing solution retrofit steps

If you already have `Clinic.Api` and `clinic-web` (Angular):

1. `dotnet new aspire-apphost -n Clinic.AppHost` (template name may vary — use `dotnet new list aspire`).
2. Add ServiceDefaults class library from template; reference it from the API.
3. Add project reference from AppHost to API; call `AddProject`.
4. Move Redis/SQL from ad-hoc Docker run commands into AppHost resources.
5. Point Angular proxy `proxy.conf.js` target at the Aspire-injected API URL or use environment replacement at start.
6. Delete stale README steps that say "open three terminals."

Keep the API runnable without AppHost for focused debugging — Aspire should be the default, not a prison.

## Configuration and secrets in the Aspire loop

AppHost can pass parameters and store references. For secrets:

- Local: user secrets / env parameters — never commit.
- Cloud Dev: Key Vault + Managed Identity patterns from the companion posts.
- Do not put production connection strings in AppHost source.

`builder.Configuration` in the API still layers appsettings + environment. Aspire resource injection is another configuration source, not a replacement for good [appsettings discipline](/blog/aspnet-core-appsettings-localappsettings).

## Service discovery between .NET services

When you add a second API (for example `Clinic.Worker` or `Clinic.Bff`):

```csharp
var api = builder.AddProject<Projects.Clinic_Api>("api")
    .WithReference(redis);

var bff = builder.AddProject<Projects.Clinic_Bff>("bff")
    .WithReference(api);
```

HttpClient in BFF uses the named endpoint via service discovery rather than hardcoded `https://localhost:7123`. That alone removes a class of onboarding bugs for new developers.

## Angular environment strategy

Recommended approach for Aspire ports:

1. AppHost sets env var `API_BASE_URL` for the npm app.
2. A small `prestart` script writes `src/environments/environment.development.ts` or a `assets/config.json` fetched at runtime.
3. Angular `API_BASE` reads that value once in an APP_INITIALIZER.

Avoid checking in `environment.development.ts` with a personal port. Runtime config JSON is usually less merge-conflict-prone for teams.

## When not to adopt Aspire yet

- Solo spike on a single Web API with no dependencies — overkill.
- Team has zero Docker and cannot install the prerequisites Aspire resources need.
- Production deadline this week and nobody can own the AppHost — finish the feature; adopt next sprint.

Aspire is leverage, not a badge.



## Practitioner day-one script

1. Clone repo; install .NET SDK matching global.json; install Node LTS for Angular.
2. Start Docker engine (required for Redis/SQL resources).
3. `dotnet run --project src/Clinic.AppHost`.
4. Open dashboard URL from console; click Angular endpoint; sign in against local API.
5. Confirm one authenticated GET shows a trace spanning Angular to API.

If step 3 fails on resource pull, fix Docker first — it is not an Aspire mystery.

With AppHost as the supported entry point, .NET Aspire becomes the calm default for ASP.NET Core + Angular local cloud-native work without pretending it is your entire production platform.



## Team onboarding paragraph for README

Add this near the top of the repo README: "Local default is F5 on the AppHost project. That starts API, Redis, SQL, and Angular. Do not commit personal ports. Use the Aspire dashboard URL printed at startup. For API-only debugging, you may run the API project directly with user secrets."

That paragraph prevents three Slack threads a week.


## Related

**Related:** [Docker .NET Angular local](/blog/docker-dotnet-angular-local) · [Angular +.NET integration](/blog/angular-dotnet-integration) · [Health checks](/blog/aspnet-core-health-checks) · [IHttpClientFactory](/blog/ihttpclientfactory-aspnet-core)

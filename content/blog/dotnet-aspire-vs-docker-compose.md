---
title: ".NET Aspire vs Docker Compose for Local .NET and Angular"
description: "Decide .NET Aspire vs Docker Compose for local ASP.NET Core and Angular work. One laptop source of truth, not a second tutorial for the team."
date: "2026-10-03"
category: "architecture"
tags: [".NET Aspire", "Docker Compose", "ASP.NET Core", "Angular", "Local Development"]
related:
  - dotnet-aspire-aspnet-core-angular
  - docker-dotnet-angular-local
  - aspnet-core-health-checks
  - ihttpclientfactory-aspnet-core
faq:
  - q: "Should a .NET and Angular team use Aspire or Docker Compose locally?"
    a: "Use Aspire when the center of the inner loop is .NET projects and you want one AppHost, service discovery, and the dashboard. Use Compose when the inner loop is already containers, several languages, or a compose file that CI also runs. Many teams use Aspire on the laptop and Compose in CI."
  - q: "Does Aspire replace production Kubernetes?"
    a: "No. AppHost orchestrates the developer machine. Production is still App Service, Container Apps, Kubernetes, or whatever you operate. Choosing Aspire locally does not choose AKS."
  - q: "Can Aspire and Docker Compose both be the source of truth?"
    a: "No. Keep the AppHost for the laptop or Compose for CI, and do not hand-edit both. Two boot files drift, and a connection-string bug becomes a coin flip."
---

**.NET Aspire versus Docker Compose** for local ASP.NET Core and Angular is a choice about what boots the inner loop: a .NET AppHost that knows your projects, or a Compose file that knows your containers. Both can start an API, a SPA, and SQL. They fail different teams in different ways.

```text
Aspire inner loop          Compose inner loop
  F5 AppHost                 docker compose up
    -> API project             -> api image
    -> npm Angular             -> web image or host npm
    -> Redis / SQL resources   -> redis / sql images
    -> dashboard               -> you bring logs
```

Metaphor: Compose is a dock roster of ships. Aspire is a .NET program that phones each ship and also the harbor master (the dashboard). If your harbor is mostly not .NET, the roster is the better document. If your harbor is a solution file, the program is the better one.


**New to this** stay here for the decision. **How to build the AppHost** see [Aspire getting started](/blog/dotnet-aspire-aspnet-core-angular). **How to write the Compose file** see [Docker for .NET and Angular](/blog/docker-dotnet-angular-local). **Health endpoints either side should expose** see [health checks](/blog/aspnet-core-health-checks). **Typed clients once discovery gives you a URL** see [IHttpClientFactory](/blog/ihttpclientfactory-aspnet-core).

The reader can already imagine both tools and needs a rule for the repo in front of them, not a second tutorial.

## .NET Aspire vs Docker Compose for the local loop

| Question | Aspire AppHost | Docker Compose |
|---|---|---|
| Unit of composition | .NET projects, executables, containers | Services built from images |
| Angular | `AddNpmApp` or an executable, often on the host | A Node image, or Angular left on the host outside Compose |
| Connection strings | Resources inject them | You write environment variables |
| Dashboard | Built in: logs, traces, endpoints | Not included |
| Service discovery | AppHost names and endpoints | Docker DNS names on the compose network |
| Laptop requirement | .NET SDK and the Aspire workload; Docker if you use container resources | Docker |
| CI reuse | Not the usual CI contract | The same file can run integration tests |
| Production likeness | Inner loop, not a cluster | Closer to "these containers", still not Kubernetes |

Aspire can start containers. Compose can start a container whose process is `dotnet`. The overlap is why teams argue. The split is the **source of truth**. If the file a new hire edits to add Redis is `AppHost.cs`, you are on Aspire. If it is `compose.yaml`, you are on Compose. Maintaining both as equal sources of truth doubles every port change.

> **Watch:** Editing AppHost and Compose for the same Redis container feels thorough and doubles every port bug. The next connection-string fix lands in the file the on-call did not open.

## The same three processes, written both ways

The table above is the comparison. These two files are what a new hire would edit. Both describe an API, an Angular dev server, and SQL Server. Only one of them should be the file you maintain. The criteria in the next sections are how you pick which one.

Aspire AppHost. `AddNpmApp` is on `Aspire.Hosting.JavaScript` in current Aspire 9 workloads. If the AppHost package you pinned only exposes `AddJavaScriptApp` or `AddExecutable`, use that method and keep the same references. Verify the method against the package version, not against a rename a blog guessed.

```csharp
var builder = DistributedApplication.CreateBuilder(args);

var sql = builder.AddSqlServer("sql");
var clinicDb = sql.AddDatabase("clinic");

var api = builder.AddProject<Projects.Clinic_Api>("api")
    .WithReference(clinicDb)
    .WaitFor(clinicDb);

builder.AddNpmApp("web", "../web", "start")
    .WithReference(api)
    .WaitFor(api)
    .WithHttpEndpoint(port: 4200, env: "PORT")
    .WithExternalHttpEndpoints();

builder.Build().Run();
```

`WithReference(clinicDb)` is what injects `ConnectionStrings__clinic` into the .NET API. Angular's proxy should read the service-discovery URL Aspire injects for the `api` HTTP endpoint. On the resource page that value is an environment variable in the shape `services__api__http__0` or `services__api__https__0`. Use the name the dashboard shows for this run. Do not also hard-code `https://localhost:5001`.

Compose, for the same shape. The SA password comes from an uncommitted `.env` or the shell, never from this file. `sqlcmd` is not on every `mcr.microsoft.com/mssql/server` tag. If the healthcheck fails immediately because the binary is missing, pin a tag that includes the tools or replace the test with one you have verified. Do not delete the health gate and start the API on an open port alone.

```yaml
services:
  sql:
    image: mcr.microsoft.com/mssql/server:2022-latest
    environment:
      ACCEPT_EULA: "Y"
      MSSQL_SA_PASSWORD: "${MSSQL_SA_PASSWORD}"
    ports:
      - "1433:1433"
    healthcheck:
      test:
        - CMD-SHELL
        - /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$$MSSQL_SA_PASSWORD" -C -Q "SELECT 1" -b
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 25s

  api:
    build:
      context: .
      dockerfile: src/Clinic.Api/Dockerfile
    environment:
      ASPNETCORE_URLS: http://+:8080
      ConnectionStrings__clinic: Server=sql,1433;Database=clinic;User Id=sa;Password=${MSSQL_SA_PASSWORD};TrustServerCertificate=True
    ports:
      - "8080:8080"
    depends_on:
      sql:
        condition: service_healthy

  web:
    image: node:22-bookworm
    working_dir: /app
    volumes:
      - ./web:/app
    command: ["npm", "run", "start", "--", "--host", "0.0.0.0", "--port", "4200"]
    environment:
      API_PROXY_TARGET: http://api:8080
    ports:
      - "4200:4200"
    depends_on:
      - api
```

The `web` service is here so the compose file matches the AppHost. If the bind mount breaks Angular file watching on Windows, delete `web` and run `ng serve` on the host with the proxy aimed at `localhost:8080`. That is the same tradeoff as the Angular section below, not a second architecture.

If CI must boot this definition, the yaml is the source of truth and the AppHost should not invent different ports. If the team debugs the API from the IDE and only needs SQL in a container, the AppHost is the source of truth and this yaml should not sit in the repo as a second copy.

> **Watch:** A compose file checked in so CI matches, while the laptop still boots a different AppHost, is two boot paths. The integration test then fails in only one of those places.

## Choose Aspire when

- The solution is mostly C# projects: API, workers, maybe a second service. Angular is one npm app beside them.
- You want F5 in the IDE to start API plus dependencies, and you are tired of a script that opens three terminals.
- You want OpenTelemetry in a local dashboard without hand-wiring an OTLP collector. Service defaults do that. The getting-started post shows the wiring.
- Developers already have the .NET SDK. Asking them to install the Aspire workload is cheaper than asking a C#-only team to become Compose maintainers.
- Local URLs keep drifting (`launchSettings.json` versus Angular `environment.ts`). AppHost endpoints are one place to read the API URL from.

Aspire is a poor fit if half the stack is Python, Java, and a pinned database image that operators already ship in Compose. You can containerize those from AppHost, but you are then writing a .NET dialect of Compose. That is worth it only if the .NET side is still the majority of daily changes.

## Choose Compose when

- CI already runs `docker compose up` and then integration tests. One definition for laptop and pipeline matters more than a dashboard.
- The team is polyglot. A compose service does not care that the process is not .NET.
- You are debugging the Dockerfiles themselves. Aspire hiding the build makes Dockerfile bugs show up later.
- Corporate laptops allow Docker but the .NET SDK is locked to a version that does not match the Aspire workload you want. Do not fight that with a local-only orchestration stack.
- Production is Kubernetes and you want local YAML to look faintly like the deployment. It will not be the same YAML. It is still easier to review for some platform teams.

Compose is a poor fit if every developer forgets a `--profile`, the Angular app is bind-mounted until file watching breaks on Windows, and the only reason for Compose was "we should use Docker". An API plus `ng serve` plus a SQL container is allowed. You do not have to orchestrate the SPA.

## Angular specifically

Both tools get Angular wrong in the same way: they containerize `ng serve` and then fight hot reload, or they `ng build` on every API change.

A practical split that works with either orchestrator:

- Run `ng serve` on the host, proxy `/api` to the port the orchestrator published.
- Let Aspire or Compose own the API, SQL, Redis, and workers.
- Do not rebuild the SPA image to change a TypeScript file.

Aspire's npm integration is convenient when you want the dashboard to show the Angular process and to restart it with the AppHost. Use it if the team actually looks at that dashboard. If Angular developers never open AppHost, leave npm in their terminal and stop pretending one button starts their day.

Environment files must not hard-code `https://localhost:5001` in three configs. The proxy target should be the only port. How you inject that port differs (Aspire env versus compose env). The decision post's rule is: one port mapping, read by the proxy, not a tutorial on `proxy.conf.json`.

## Use both without lying to yourselves

A clean split:

- **Laptop:** AppHost starts projects and container resources for SQL and Redis.
- **CI:** a short Compose file (or Testcontainers) starts only SQL and Redis, then `dotnet test` runs the API on the host. See [Testcontainers](/blog/testcontainers-aspnet-core-sql-redis) if you do not want Compose in CI either.
- **Production:** neither file. Deploy with the pipeline you already have.

The lie is generating Compose from AppHost and also hand-editing it, or hand-editing AppHost and also a compose file, and hoping they match. Pick the laptop source of truth. Generate or rewrite the other only in CI if a tool does it deterministically.

## When neither is worth it

One ASP.NET Core project, Angular via the SPA proxy, SQLite or a local SQL instance you already run. Adding Aspire or Compose before the second process exists is ceremony. Revisit when you add Redis, a worker, or a second API.

Health checks still matter the day you do add an orchestrator. Compose `depends_on` with a healthcheck and Aspire `WaitFor` both need an endpoint that means "can take traffic", not "process started". That endpoint is [health checks](/blog/aspnet-core-health-checks), shared by both choices.

## Cost and lock-in, without fake precision

Neither tool has a meaningful license fee for local use. The cost is time and drift. Aspire lock-in is the AppHost and service defaults: leaving later means turning resource references back into configuration. Compose lock-in is Dockerfiles and env-var contracts: leaving later means teaching AppHost the same ports. Both are reversible in a few days for a small solution, and painful for a 30-service repo. Decide before the repo is 30 services.

Do not pick Aspire because a slide said it is the future, or Compose because a slide said it is production-like. Local Compose is not production. Local Aspire is not production.

> **Watch:** Picking either tool because it looks like production chooses an inner loop, not a host. Local Compose is not a cluster, and local Aspire is not one either.

## A short workshop to decide

Write down, for the next six months:

1. How many non-.NET processes must boot locally?
2. Does CI need the same boot definition as the laptop?
3. Will developers run the IDE debugger against the API process, or against a container?
4. Who is on call when the boot file breaks: the API team or a platform channel?

If (1) is near zero, (3) is the IDE, and (4) is the API team, choose Aspire and follow the getting-started post. If (1) is many or (2) is yes, choose Compose and follow the Docker post. If (3) is "debugger inside a container" you are optimizing for a pain both tools can provide; prefer the one CI already runs.

## Pitfalls

- **Two sources of truth** within a month. Every connection string bug becomes a coin flip.
- **Judging Aspire by a Compose tutorial** or the reverse. You will blame the tool for steps you never needed on this path.
- **Putting secrets in `compose.yaml` or AppHost source.** User-secrets and local env files stay out of git either way.
- **Expecting the Aspire dashboard in CI logs.** CI should print test output. The dashboard is for a human at a laptop.
- **Forcing Angular into a container** to make the diagram look complete.

## Verification

You chose well if a new hire, with the README only, boots API, database, and Angular proxy in one documented command and hits a health endpoint within the time you agreed (an afternoon, not a week). You chose badly if they need a second unpublished script, or if CI integration tests use a different port map than the laptop and fail only on the agent.

Review checklist for the PR that "adds local orchestration": one source of truth, secrets out of git, health gate before the API is called, Angular proxy pointed at the published API port, and a link to the tutorial that matches the tool. Not both tutorials as required reading.

**Related:** [Aspire getting started](/blog/dotnet-aspire-aspnet-core-angular) | [Docker Compose local](/blog/docker-dotnet-angular-local) | [Health checks](/blog/aspnet-core-health-checks) | [IHttpClientFactory](/blog/ihttpclientfactory-aspnet-core)

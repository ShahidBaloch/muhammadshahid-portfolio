---
title: "Azure Functions Isolated Worker for .NET API Workloads"
description: "Run Azure Functions isolated worker for .NET beside an ASP.NET Core API — Program.cs DI, HTTP triggers, shared contracts, local Core Tools, and when Functions should not replace App Service."
date: "2026-10-01"
category: "azure"
tags: ["Azure Functions", "ASP.NET Core", ".NET", "C#", "Serverless"]
related:
  - azure-app-service-aspnet-core
  - csharp-backgroundservice-hosted-service-async
  - aspnet-core-dependency-injection
faq:
  - q: "What is the Azure Functions isolated worker model for .NET?"
    a: "Isolated worker runs your function code in a separate worker process from the Functions host. You get a normal Program.cs, full DI control, and current .NET versions — unlike the older in-process model that shared the host’s runtime."
  - q: "Should I replace my ASP.NET Core API with Azure Functions HTTP triggers?"
    a: "Usually no. Keep App Service (or containers) for the main Angular-facing API. Use isolated Functions for timers, queue/event handlers, glue HTTP webhooks, and bursty side workloads."
  - q: "How is this different from hosting ASP.NET Core on App Service?"
    a: "App Service hosts your continuous Web API with middleware, auth, and OpenAPI as a product surface. Isolated Functions host event-driven units with bindings. Different scaling and cold-start tradeoffs."
---

**Azure Functions isolated worker for .NET** runs your functions in a dedicated worker process with `Program.cs` and standard DI — so API-adjacent workloads (timers, queues, thin HTTP glue) can share contracts with an ASP.NET Core app without living inside the old in-process host.

```text
Angular SPA ──► ASP.NET Core API (App Service / container)
                      │
         events / schedules / webhooks
                      ▼
            Azure Functions (isolated worker)
```

**New to this** → stay here. **Main API hosting** → [App Service ASP.NET Core](/blog/azure-app-service-aspnet-core). **In-process background work inside the API** → [BackgroundService](/blog/csharp-backgroundservice-hosted-service-async).

Search intent for **azure functions isolated worker .net** is how-to: project shape, DI, HTTP triggers, and an honest decision against replacing your Angular API.

## Isolated worker vs in-process: what changed and why it matters

**In-process (.NET):** function classes loaded into the Functions host. Fast to start historically, but you were coupled to the host’s .NET version and a narrower DI story.

**Isolated worker:** your app is a console-style worker. The host talks to it over gRPC. You choose the .NET version, compose `Host.CreateDefaultBuilder` / `Host.CreateApplicationBuilder`, and register services the way you already do in ASP.NET Core.

Why teams move:

- Stay on current .NET without waiting on host alignment  
- Predictable DI lifetimes (still learn the scope differences — below)  
- Easier share of libraries with the main API project  
- Middleware-like patterns via worker extensions where needed  

Cold start and packaging still matter. Do not promise “same latency as a warm App Service API” for every HTTP trigger.

## Project layout and Program.cs with dependency injection

Typical solution layout next to an existing API:

```text
src/
  Clinic.Api/                 # ASP.NET Core — Angular-facing
  Clinic.Contracts/           # DTOs / messages shared
  Clinic.Functions/           # Isolated worker
```

`Clinic.Functions/Program.cs`:

```csharp
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .ConfigureServices((ctx, services) =>
    {
        services.AddApplicationInsightsTelemetryWorkerService();
        services.ConfigureFunctionsApplicationInsights();

        services.AddSingleton<IClock, SystemClock>();
        services.AddScoped<IEligibilityService, EligibilityService>();
        // Prefer options + typed config like the API
        services.Configure<EligibilityOptions>(
            ctx.Configuration.GetSection("Eligibility"));
    })
    .Build();

host.Run();
```

Packages typically include `Microsoft.Azure.Functions.Worker`, `Microsoft.Azure.Functions.Worker.Sdk`, HTTP/storage extensions you need, and Application Insights worker packages.

**DI vs ASP.NET Core request pipeline:** there is no ASP.NET middleware pipeline unless you add specific integrations. A function invocation gets a scope for that call when you use scoped services correctly through the worker — but do not copy-paste `AddDbContext` assumptions without verifying how you create scopes in helpers. For DbContext, prefer scoped per invocation and avoid singleton stores that capture it ([DI lifetimes](/blog/aspnet-core-dependency-injection)).

Configuration still uses `local.settings.json` locally (Values map to env vars) and App Settings in Azure — same mental model as [appsettings guidance](/blog/aspnet-core-appsettings-localappsettings), different file name locally.

## HTTP trigger returning typed results (and when not to replace your API)

```csharp
public sealed class EligibilityFunctions
{
    private readonly IEligibilityService _eligibility;

    public EligibilityFunctions(IEligibilityService eligibility)
        => _eligibility = eligibility;

    [Function(nameof(CheckEligibility))]
    public async Task<IActionResult> CheckEligibility(
        [HttpTrigger(AuthorizationLevel.Function, "post", Route = "eligibility/check")]
        HttpRequestData req,
        CancellationToken ct)
    {
        var body = await req.ReadFromJsonAsync<EligibilityRequest>(ct)
            ?? throw new ArgumentException("Body required");

        var result = await _eligibility.CheckAsync(body, ct);
        return new OkObjectResult(result);
    }
}
```

On newer worker versions you can return `HttpResponseData` or ASP.NET Core-style results depending on the ASP.NET Core integration package you chose. Pick one style per function app and stick to it.

**When not to replace the API:**

| Keep on ASP.NET Core App Service | Put on isolated Functions |
|---|---|
| Angular SPA primary REST surface | Timer cleanup / nightly jobs |
| Complex auth policies, OpenAPI product | Queue/blob triggered processors |
| Long middleware pipelines, YARP/BFF | Thin partner webhooks |
| Steady low-latency UX APIs | Spiky, event-driven work |

If every Angular screen calls Functions HTTP triggers with JWT, CORS, ProblemDetails, versioning, and Swagger, you are rebuilding App Service with more cold starts. Don’t.

## Binding JSON DTOs and sharing contracts with an ASP.NET Core API

Put request/response records in `Clinic.Contracts` and reference from both projects:

```csharp
namespace Clinic.Contracts.Eligibility;

public sealed record EligibilityRequest(string MemberId, DateOnly ServiceDate);
public sealed record EligibilityResponse(bool IsCovered, string PlanCode);
```

Pitfalls:

- **Two JSON settings:** Functions and API must agree on camelCase, enums-as-strings, date formats  
- **Version drift:** publish contracts as a package or project reference; do not copy-paste DTOs  
- **Binding vs manual read:** for HTTP, explicit `ReadFromJsonAsync` with `JsonSerializerOptions` beats surprise binder defaults  

For queue triggers, deserialize defensively — poison messages belong in a DLQ strategy, not an unhandled exception loop.

## Local debug with Core Tools and configuration

1. Install Azure Functions Core Tools compatible with your worker major version  
2. `local.settings.json` (never commit secrets):

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "dotnet-isolated",
    "Eligibility__BaseUrl": "https://localhost:7101/"
  }
}
```

3. Run the API and Functions together when the function calls the API — or replace with fakes in local settings  
4. F5 from Visual Studio / `func start` from the Functions project directory  

Use user secrets or env vars for anything sensitive. Connection strings in source control fail audits in healthcare work.

## When Functions sit beside App Service vs replace it

**Beside (recommended default for SaaS/healthcare APIs):**

- App Service (or container) hosts Angular + API or API-only behind a static web host  
- Functions handle Service Bus / queue / timer / Event Grid  
- Shared contracts + shared application libraries  

**Replace:**

- Truly function-shaped product (webhooks + light JSON) with no heavy SPA API surface  
- Teams already standardized on Functions Premium for auth/VNET needs  

**BackgroundService inside the API** remains valid for in-process work tightly coupled to the API’s DbContext and deployment. Prefer Functions when you need independent scale, a different failure domain, or triggers the API host should not eat. See [BackgroundService patterns](/blog/csharp-backgroundservice-hosted-service-async).

## Cold start and packaging notes (no fake benchmarks)

Honest expectations:

- Consumption plans can cold-start; Premium/Dedicated reduce that with pre-warmed instances  
- Large deployment packages and eager DI that connects to SQL on startup hurt  
- Prefer lazy clients; avoid sync-over-async in constructors  
- Publish `dotnet publish -c Release` output the Functions tooling expects; keep the worker SDK version aligned with Core Tools  

Measure *your* P95 under production-like load. Do not paste vendor marketing numbers into architecture reviews.

## Checklist: ship an isolated worker next to an existing API

1. Create isolated worker project on the same .NET major as the API when possible  
2. Move shared DTOs/messages into a contracts project  
3. Register services in `Program.cs`; avoid static service locators  
4. Choose triggers intentionally (queue/timer first; HTTP only for glue)  
5. Align JSON options with the API  
6. Configure Application Insights for the worker  
7. Gate secrets via App Settings / Key Vault references  
8. Document: “Angular calls App Service; Functions are not the SPA API”  
9. Load-test cold vs warm paths for any HTTP trigger you expose publicly  
10. Add health/ops runbook: poison messages, retry counts, dashboard queries  

## Common mistakes I still see

1. **Moving the entire Angular API to Functions** for “serverless” without product need  
2. **Singleton DbContext** or captive dependencies copied from bad samples  
3. **Different DTO shapes** in API vs Functions for the same event  
4. **AuthorizationLevel.Anonymous** left on production HTTP triggers  
5. **Assuming middleware order knowledge transfers** — there is no full ASP.NET pipeline by default  
6. **Ignoring local.settings vs Azure App Settings** naming (`__` for nested)  

## Verification

- `func start` shows the function discovered; POST with function key succeeds locally  
- Scoped service receives a new instance per invocation under concurrent calls (log a Guid in ctor)  
- Deployed app settings override local values; no secrets in repo  
- Timer/queue function completes and telemetry appears in Application Insights  
- Angular smoke test still hits App Service base URL, not the Functions host, for product APIs  

## If an interviewer asks

Isolated vs in-process? When Functions vs App Service?

**Strong answer:** Isolated worker is a separate process with Program.cs and normal DI on modern .NET. Use it beside an ASP.NET Core API for event-driven work. Keep the Angular-facing API on App Service/containers unless the product is genuinely function-shaped. Watch scopes, JSON parity, and cold start — not marketing charts.

**Related:** [Azure App Service ASP.NET Core](/blog/azure-app-service-aspnet-core) · [BackgroundService](/blog/csharp-backgroundservice-hosted-service-async) · [DI lifetimes](/blog/aspnet-core-dependency-injection) · [appsettings](/blog/aspnet-core-appsettings-localappsettings)


## Sharing application services without dragging ASP.NET Core into Functions

A common mistake is referencing the API web project from Functions and pulling MVC, Swagger, and authentication middleware into the worker. Prefer:

1. `Clinic.Application` — use cases, interfaces, validators  
2. `Clinic.Infrastructure` — EF, HttpClients, Service Bus  
3. `Clinic.Api` — HTTP endpoints only  
4. `Clinic.Functions` — triggers that call application services  

```csharp
// Functions Program.cs
services.AddInfrastructure(ctx.Configuration);
services.AddApplication();
```

That keeps isolated worker DI honest: you register what the trigger needs, not the entire web host.

### Scoped work inside a singleton-looking function class

Function classes are often created as singletons by the worker. **Do not** inject scoped `DbContext` directly into fields and reuse across invocations.

Safer patterns:

```csharp
public sealed class NightlyCloseFunctions
{
    private readonly IServiceScopeFactory _scopeFactory;

    public NightlyCloseFunctions(IServiceScopeFactory scopeFactory)
        => _scopeFactory = scopeFactory;

    [Function(nameof(CloseClinics))]
    public async Task CloseClinics([TimerTrigger("0 0 2 * * *")] TimerInfo timer, CancellationToken ct)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var closer = scope.ServiceProvider.GetRequiredService<IClinicCloseService>();
        await closer.RunAsync(ct);
    }
}
```

This mirrors ASP.NET Core request scopes and prevents cross-invocation context bugs.

## HTTP trigger auth for glue endpoints

`AuthorizationLevel.Function` requires a function/host key. That is not a substitute for JWT user auth. For partner webhooks:

- Validate signatures (HMAC headers) inside the function  
- Or put Functions behind APIM with mutual TLS / JWT validation  
- Never expose `AuthorizationLevel.Anonymous` admin operations  

For browser users, keep calling the App Service API with your normal JWT/BFF flow.

## Packaging and deployment habits

1. Use `dotnet publish` with the Functions Worker SDK targets  
2. Pin extension bundle / worker package versions in CI  
3. Separate staging slots or separate function apps per environment  
4. Apply the same Key Vault / Managed Identity story you use for App Service  
5. Document runbooks for poison queues and failed timer runs  

### Configuration naming across hosts

Nested config in Azure App Settings uses `__`:

```text
Eligibility__BaseUrl=https://api.internal/
Eligibility__ApiKey=@Microsoft.KeyVault(...)
```

Locally, `local.settings.json` Values mirror those env vars. Keep a single options class shared via Infrastructure.

## Extended when-not-to-use scenarios

**Skip isolated Functions when:**

- You need a stable WebSocket/SignalR product surface (use App Service + SignalR)  
- Every feature needs the full ASP.NET middleware pipeline and OpenAPI as a product  
- The team cannot operate a second deployable  

**Prefer Functions when:**

- Work is naturally event-driven (blob created, message received)  
- Load spikes independently from interactive API traffic  
- A failure should not recycle your Angular API process  

## Extra verification steps

- Concurrent timer + HTTP invocations do not share DbContext instances (log context hash/code)  
- Function key rotated; old key denied  
- Application Insights shows `cloud_RoleName` distinct from the API role name  
- Contract package version matches between API publishers and function consumers  

## Production anecdote (SaaS shape)

On multi-clinic products I keep eligibility callbacks and nightly reconciliation on isolated Functions, while the Angular app continues to talk to App Service. The day someone “simplified” by pointing Angular at Functions HTTP for patient CRUD, cold starts and inconsistent ProblemDetails showed up in support tickets within a week. Put glue on Functions; put the product API on a web host.

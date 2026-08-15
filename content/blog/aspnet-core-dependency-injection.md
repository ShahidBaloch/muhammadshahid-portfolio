---
title: "Dependency Injection in ASP.NET Core: Lifetimes Done Right"
description: "ASP.NET Core dependency injection explained for real apps — Singleton vs Scoped vs Transient, captive dependencies, factory registration, and habits that keep .NET APIs testable."
date: "2026-07-31"
category: "dependency-injection"
tags: ["Dependency Injection", "ASP.NET Core", "C#", ".NET", "IoC"]
---

**Dependency injection in ASP.NET Core** is built into the framework — which means every team uses it, and many teams misuse lifetimes until a subtle production bug appears. Captive dependencies, accidental singletons holding `DbContext`, and "just inject `IServiceProvider` everywhere" are still common in otherwise solid codebases.

This is my working guide for DI on ASP.NET Core APIs that serve Angular SPAs — the rules I apply in healthcare, SaaS, and eCommerce delivery.

## What DI is for (in one paragraph)

You register abstractions and implementations once. The container constructs objects and injects dependencies. You gain testability (swap fakes), clearer constructors, and centralized lifetime control. DI is not a religion — it is plumbing that should disappear into good module boundaries.

## The three lifetimes you must know

| Lifetime | Instance sharing | Typical use | Common mistake |
|---|---|---|---|
| **Transient** | New every time | Lightweight, stateless helpers | Registering heavy objects that open connections per resolve |
| **Scoped** | One per request (HTTP scope) | `DbContext`, unit-of-work style services | Assuming scope exists in background threads |
| **Singleton** | One per app | Caches, factories with no scoped deps, immutable config wrappers | Injecting scoped services into constructor |

Wrong lifetime is the #1 DI bug I still review.

### Captive dependency (the classic trap)

A **Singleton** that depends on a **Scoped** service (like `DbContext`) holds that scoped instance forever. You get cross-request data leaks or disposed-object exceptions.

```csharp
// Dangerous pattern
services.AddSingleton<ReportCache>(); // constructor takes AppDbContext
services.AddDbContext<AppDbContext>(...); // scoped by default
```

Fix options:

1. Make `ReportCache` scoped
2. Or inject `IServiceScopeFactory` and create a scope when you need DbContext
3. Or redesign so the singleton only holds thread-safe state, not EF

## A real failure story: the dashboard that showed yesterday's data

An eCommerce client had intermittent reports of "stale" order counts on their admin dashboard. The Angular app polled every 30 seconds; sometimes the count jumped by hundreds of orders, sometimes it froze for minutes.

The root cause was a **singleton** `DashboardAggregator` injected with a **scoped** `AppDbContext`. Under low traffic, the bug was invisible — one request, one context, correct data. Under concurrent load, the singleton reused a context instance across requests. EF's change tracker held entities from prior requests; counts were wrong or throws surfaced as 500s.

The fix took one afternoon: make the aggregator scoped, or inject `IServiceScopeFactory` and create a scope per aggregation run. The Angular team did not change a line of code. That is the point — **lifetime bugs look like frontend bugs** until you trace the server graph.

## Constructor injection is the default

```csharp
public sealed class ProviderService
{
    private readonly AppDbContext _db;
    private readonly IClock _clock;

    public ProviderService(AppDbContext db, IClock clock)
    {
        _db = db;
        _clock = clock;
    }
}
```

Prefer constructor injection over property injection. Keep constructors honest: if a class needs twelve services, it probably needs splitting — DI is showing you a design smell.

## Registration habits that scale

```csharp
services.AddScoped<IProviderService, ProviderService>();
services.AddSingleton<IClock, SystemClock>();
services.Configure<JwtOptions>(configuration.GetSection("Jwt"));
```

Group registrations by feature modules when `Program.cs` grows:

```csharp
services.AddHealthcareProviders();
services.AddBilling();
```

Extension methods beat a 400-line `Program.cs`.

## Options pattern beats config fishing

Do not inject `IConfiguration` into every service to read `"Jwt:Key"`. Bind options:

```csharp
services.Configure<SmtpOptions>(configuration.GetSection("Smtp"));

public sealed class EmailSender(IOptions<SmtpOptions> options)
{
    private readonly SmtpOptions _opts = options.Value;
}
```

Use `IOptionsMonitor<T>` when values can reload; `IOptions<T>` for simple snapshots.

## Factory delegates and runtime parameters

DI resolves types well. It does not magically know a runtime merchant id. For that, use:

- A factory interface (`IProcessorFactory.Create(merchantId)`)
- Or a factory delegate registration
- Or keyed services for closed sets of implementations

I cover the design-pattern angle in [Factory Pattern in C# with DI](/blog/csharp-factory-pattern). Keyed registrations (`AddKeyedScoped`, `[FromKeyedServices]`) with an EDI vs FHIR example: [keyed services in ASP.NET Core](/blog/keyed-services-aspnet-core-fromkeyedservices).

## Background services and scope: the second classic trap

`IHostedService` and `BackgroundService` run outside the HTTP request pipeline. There is **no scoped lifetime** unless you create one.

I see this pattern fail monthly:

```csharp
public sealed class NightlyReportWorker : BackgroundService
{
    private readonly AppDbContext _db; // scoped, but worker is singleton

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // ObjectDisposedException or stale data — pick your poison
        var rows = await _db.Orders.ToListAsync(stoppingToken);
    }
}
```

Correct approach: inject `IServiceScopeFactory`, create a scope inside `ExecuteAsync`, resolve scoped services from that scope, dispose when done. Same rule applies to fire-and-forget `Task.Run` inside controllers — never capture scoped services in a thread that outlives the request.

## What not to do

1. **Service locator everywhere** — `sp.GetRequiredService<T>()` scattered in business logic  
2. **Static service access** — kills testability  
3. **Huge God services** registered as scoped to "make DI work"  
4. **Singleton EF contexts**  
5. **Hiding new() of infrastructure types** in domain code while pretending you use DI  
6. **Injecting IServiceProvider** into domain services instead of the abstractions they actually need
7. **Registering concrete types "just in case"** — every registration is a lifetime commitment

## When I skip DI ceremony

Not everything needs an interface and container registration:

- Pure static helpers with no I/O (`string` formatting, simple math)
- DTOs and record types passed through layers
- One-off console tools with no test requirement
- Performance-critical hot paths where benchmark proves container resolve cost matters (rare)

Do not register `new StringBuilder()` behind an interface. Do register anything that touches network, disk, database, or clock.

## Angular developers: why you should care

Your ASP.NET Core API's DI graph determines whether endpoints are testable and stable. When lifetimes are wrong, Angular sees intermittent 500s, stuck connections, or inconsistent data between requests — especially under load. Fixing DI is often cheaper than adding Redis to hide the bug.

Concrete Angular symptoms that often trace back to DI:

| Symptom in Angular | Possible DI cause on API |
|---|---|
| Random 500 on refresh | Disposed scoped service in singleton |
| Data "flashes" wrong then correct | Race on shared mutable singleton state |
| First request works, second fails | Captive DbContext across requests |
| Slow page after idle | Connection pool exhaustion from transient heavy services |

When debugging with an Angular team, I ask for **correlation ids** and check whether failures cluster under concurrency. Lifetime bugs rarely reproduce in a single Postman call.

Also: keep API response shapes stable. DI fixes should not require Angular model changes — if they do, the API layer was leaking infrastructure concerns into DTOs.

## Practical registration checklist for a new API

1. `DbContext` → scoped  
2. Application services that use DbContext → scoped  
3. Stateless pure helpers → transient or static functions (if truly pure)  
4. Memory caches / connection multiplexers → singleton with thread-safety  
5. HTTP clients → `IHttpClientFactory` (typed clients)  
6. Validate on startup: `BuildServiceProvider` validation in Development (`ValidateScopes`, `ValidateOnBuild`)
7. Background workers → `IServiceScopeFactory`, never direct scoped injection
8. Feature modules → extension methods (`AddBilling()`, not 300 lines in `Program.cs`)
9. Options → `IOptions<T>` / `IOptionsMonitor<T>`, not raw `IConfiguration` in services
10. Log registration summary at startup in Development (which modules loaded)

```csharp
builder.Host.UseDefaultServiceProvider(options =>
{
    options.ValidateScopes = builder.Environment.IsDevelopment();
    options.ValidateOnBuild = builder.Environment.IsDevelopment();
});
```

This catches many captive dependencies before they reach production.

## HttpClientFactory: DI's best friend for outbound calls

Before typed clients, teams registered `HttpClient` as singleton (socket exhaustion) or transient (handler churn). Use typed clients:

```csharp
services.AddHttpClient<IExternalApiClient, ExternalApiClient>(client =>
{
    client.BaseAddress = new Uri("https://api.example.com");
});
```

The factory manages handler lifetime. Inject `IExternalApiClient` normally. This is DI done right — lifetime complexity hidden in framework code, not your business services.

## Testing with DI in mind

- Unit tests: `new` the class with fakes — no container required  
- Integration tests: `WebApplicationFactory` with test doubles replaced via `ConfigureTestServices`  
- Do not unit-test the container wiring for every class; test behavior
- One smoke test that resolves key services from a built container catches registration typos

When replacing services in tests, match **lifetime intent**. Replacing a scoped service with a singleton fake in `ConfigureTestServices` can hide the very bug you are trying to prevent.

## Bottom line

**ASP.NET Core dependency injection** is simple until lifetimes meet real infrastructure. Master Singleton/Scoped/Transient, avoid captive dependencies, prefer constructor injection, and use factories only when runtime creation needs a decision.

Related: [Factory Pattern in C#](/blog/csharp-factory-pattern), [Clean Architecture in ASP.NET Core](/blog/clean-architecture-aspnet-core).

Need a DI/architecture review on your .NET API? [Contact me](/contact).

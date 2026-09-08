---
title: "Unable to Resolve Service for Type in ASP.NET Core DI"
description: "How to read ASP.NET Core’s Unable to resolve service for type exception — missing registration, IOptions vs T, hosted services, keyed services, and WebApplicationFactory — not a lifetimes essay."
date: "2026-09-07"
category: "dependency-injection"
tags: ["Dependency Injection", "ASP.NET Core", ".NET", "IoC", "C#"]
related:
  - aspnet-core-dependency-injection
  - keyed-services-aspnet-core-fromkeyedservices
  - aspnet-core-ioptions-snapshot-monitor
faq:
  - q: "What does Unable to resolve service for type mean?"
    a: "The constructor asked for a type that was never registered, or was registered with a different generic or keyed identity. The container never had a match."
  - q: "Is Unable to resolve a captive dependency?"
    a: "No. Captive dependencies resolve, then leak or throw disposed. This exception is a registration miss. Lifetimes stay on the DI guide."
  - q: "Why does a test host fail to resolve a service that works in Program?"
    a: "WebApplicationFactory often skips a registration the real host adds. Register it in the test host or the constructor will fail only in tests."
---

**Unable to resolve service for type** means the DI container has no registration matching what a constructor asked for — wrong interface, missing `AddDbContext`, `IOptions<T>` vs `T`, or keyed vs unkeyed. It is not a lifetime bug; captive dependencies resolve and then misbehave.

```text
EncounterController needs IEncounterStore
        │
        ▼
Container lookup → no IEncounterStore registered
        │
        ▼
Unable to resolve service for type 'IEncounterStore'
```

**New to this** → stay here. **Merging a PR** → [read the exception](#read-the-exception-before-you-add-another-addscoped). **On-call / interview** → [IOptions vs T](#cause-2-you-asked-for-t-but-registered-ioptionst) · [hosted service scope](#cause-3-hosted-service-constructor-has-no-http-scope) · [if an interviewer asks](#if-an-interviewer-asks).

**Unable to resolve service for type** is the exception people paste into Google when `Program.cs` and a constructor disagree. It is not a captive-dependency bug. Captive dependencies *resolve* and then leak tenant data or throw **disposed**. This URL is the **registration miss**: the container never had a matching service.

Lifetimes, Singleton-holds-DbContext, and `IServiceScopeFactory` stay in [DI lifetimes](/blog/aspnet-core-dependency-injection). Keyed `FromKeyedServices` design stays in [keyed services](/blog/keyed-services-aspnet-core-fromkeyedservices). Here I only decode the exception and the misses I still see on healthcare and SaaS APIs.

## Read the exception before you add another `AddScoped`

The message is two types:

```text
Unable to resolve service for type 'IEncounterStore'
while attempting to activate 'EncounterController'.
```

- **`IEncounterStore`** — what the constructor asked for
- **`EncounterController`** — who asked

Do not “register the controller.” Controllers are activated by MVC. Register **`IEncounterStore`**. If the inner type is `AppDbContext`, you forgot `AddDbContext`. If it is `IOptions<SmtpOptions>`, you registered the POCO and asked for options.

Walk the constructor chain. The first unregistered abstraction is the one to fix. Adding `AddScoped<EncounterController>()` is cargo cult.

## Cause 1: Interface registered, implementation asked (or the reverse)

```csharp
builder.Services.AddScoped<SqlEncounterStore>();
```

```csharp
public sealed class EncounterController(IEncounterStore store) { }
```

The container has `SqlEncounterStore`. The constructor wants `IEncounterStore`. Those are different service types.

```csharp
builder.Services.AddScoped<IEncounterStore, SqlEncounterStore>();
```

The same bug inverted: you register the interface and `new SqlEncounterStore()` somewhere else. Pick one composition root.

## Cause 2: You asked for `T` but registered `IOptions<T>`

```csharp
builder.Services.Configure<BlobOptions>(builder.Configuration.GetSection("Blob"));
```

```csharp
public sealed class UploadService(BlobOptions options) { } // fails
```

`Configure<T>` registers **`IOptions<T>`** / `IOptionsSnapshot<T>` / `IOptionsMonitor<T>`, not `T`. Inject `IOptions<BlobOptions>` or bind with `AddOptions<T>().Bind().ValidateOnStart()` and still inject `IOptions<T>`. When the question is which options interface to use, that is [IOptions vs Snapshot vs Monitor](/blog/aspnet-core-ioptions-snapshot-monitor) — not this exception.

`Get<BlobOptions>()` at startup and `AddSingleton(options)` works for immutable settings. Do not mix that with `IOptionsMonitor` and expect reloads.

## Cause 3: Hosted service constructor has no HTTP scope

```csharp
builder.Services.AddHostedService<NightlyExportWorker>();
```

```csharp
public sealed class NightlyExportWorker(AppDbContext db) : BackgroundService { }
```

`AddHostedService` registers the worker as a **singleton**. `AppDbContext` is scoped. You may get *unable to resolve* when there is no scope, or a captive context if someone “fixed” it by making the context singleton.

Open a scope inside `ExecuteAsync`:

```csharp
protected override async Task ExecuteAsync(CancellationToken stoppingToken)
{
    using var scope = _scopes.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await ExportAsync(db, stoppingToken);
}
```

Inject `IServiceScopeFactory`, not `AppDbContext`. That is the same rule as the lifetimes article; I mention it here because the **first** symptom is often this exception at host start, not a leak three weeks later.

## Cause 4: Open generic you never closed

```csharp
public sealed class Validator<T> { }
```

```csharp
public sealed class CreateEncounterHandler(Validator<Encounter> validator) { }
```

`AddScoped(typeof(Validator<>), typeof(Validator<>))` (or a closed `AddScoped<Validator<Encounter>>()`) is required. Registering `Validator<object>` does not satisfy `Validator<Encounter>`. MediatR-style pipeline behaviors have the same trap: the closed handler type is what the container must know.

## Cause 5: Keyed registration, unkeyed injection

```csharp
builder.Services.AddKeyedScoped<IOutboundClient, X12OutboundClient>("x12");
```

```csharp
public sealed class PartnerDispatch(IOutboundClient client) { } // fails
```

A keyed service is **not** the unkeyed `IOutboundClient`. Inject `[FromKeyedServices("x12")] IOutboundClient` **or** also `AddScoped<IOutboundClient, X12OutboundClient>()` if one default exists. If you meant a factory over a closed set, use the keyed article instead of registering a fake default.

## Cause 6: It works in the API and fails in `WebApplicationFactory`

The test host is a **different** container. `ConfigureTestServices` replaced `IEncounterStore` and accidentally removed `IOptions<BlobOptions>` by swapping the whole options stack. Or the test uses `new WebApplicationFactory<Program>()` while `Program` only registers SQL when `ConnectionStrings:Default` is set — CI has no string, so `AddDbContext` never ran.

```csharp
builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseSqlServer(builder.Configuration.GetConnectionString("Default")
        ?? throw new InvalidOperationException("Default connection string missing.")));
```

Fail **loud** at startup. Silent `if (cs is not null) AddDbContext` is how tests 500 with this exception and production “works on my machine.”

## Cause 7: Two constructors, the container picked the wrong one

```csharp
public sealed class PdfRenderer
{
    public PdfRenderer() { }
    public PdfRenderer(IOptions<PdfOptions> options) { }
}
```

The container prefers the greediest constructor it can satisfy. If `IOptions<PdfOptions>` is missing, it may bind the empty ctor and you get a **null options** bug instead of this exception — or the reverse if you marked the parameterized ctor `[ActivatorUtilitiesConstructor]` and options are unregistered.

One public constructor. Tests `new PdfRenderer(Options.Create(testOptions))`.

## Checklist I run in five minutes

1. Copy the **inner** type from the exception
2. Search `AddScoped` / `AddSingleton` / `AddDbContext` / `Configure<` for that type
3. Confirm the **service type** matches the constructor parameter (interface vs class, keyed vs not, `IOptions<T>` vs `T`)
4. Confirm the registration runs on this host (API vs worker vs test)
5. Only then look at lifetimes — if it resolved, you are on the other article

## Related reading

- [Dependency injection lifetimes](/blog/aspnet-core-dependency-injection)
- [IOptions vs IOptionsSnapshot vs IOptionsMonitor](/blog/aspnet-core-ioptions-snapshot-monitor)
- [Keyed services](/blog/keyed-services-aspnet-core-fromkeyedservices)
- [Factory pattern in C#](/blog/csharp-factory-pattern)
- [DI topic hub](/learning/dependency-injection)

## If an interviewer asks

How to read the exception message; `Configure<T>` vs injecting `T`; why keyed services fail unkeyed injection.

**Strong answer:** Copy the inner type from the exception — register that abstraction, not the controller. `Configure<BlobOptions>` registers `IOptions<BlobOptions>`, not `BlobOptions`. Keyed `AddKeyedScoped` does not satisfy unkeyed `IOutboundClient` — use `[FromKeyedServices("x12")]` or register a default.


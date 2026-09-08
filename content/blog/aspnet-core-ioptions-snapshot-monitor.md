---
title: "IOptions vs IOptionsSnapshot vs IOptionsMonitor in ASP.NET Core"
description: "When to inject IOptions, IOptionsSnapshot, or IOptionsMonitor — lifetimes, reload, named options, and the production bugs I see when teams pick the wrong one."
date: "2026-09-05"
category: "dependency-injection"
tags: ["ASP.NET Core", "Configuration", "Dependency Injection", "IOptions", ".NET"]
related:
  - aspnet-core-appsettings-localappsettings
  - aspnet-core-dependency-injection
  - azure-app-service-aspnet-core
faq:
  - q: "When should I use IOptions vs IOptionsSnapshot vs IOptionsMonitor?"
    a: "IOptions is a singleton snapshot at first resolve. IOptionsSnapshot is per request. IOptionsMonitor notifies on reload. Pick the lifetime, not the tutorial default."
  - q: "Why did an Azure App Setting change do nothing?"
    a: "A Singleton holding IOptions never sees reloads. Use IOptionsMonitor or restart. Which JSON files exist is the config-file article, not this page."
  - q: "Can I inject IOptions into a Singleton?"
    a: "Yes, but you will not see runtime reloads. That is fine for JWT signing keys you rotate with a restart, and wrong for a clinic feature flag."
---

**IOptions** snapshots config at first resolve; **IOptionsSnapshot** rebinds per request; **IOptionsMonitor** notifies singletons when settings reload. Pick the interface to match **how long the consumer lives**, not which name you memorized.

```text
Azure App Setting changes
        │
   ┌────┴────────────────┐
   ▼                     ▼
IOptions<T>         IOptionsMonitor<T>
(frozen)            (OnChange → cache resize)
        │
IOptionsSnapshot<T> (per HTTP request)
```

**New to this** → stay here. **Merging a PR** → [one-line difference table](#the-one-line-difference). **On-call / interview** → [snapshot in singleton trap](#ioptionssnapshott--once-per-request) · [validate on start](#validate-on-start) · [if an interviewer asks](#if-an-interviewer-asks).

Teams search **IOptions vs IOptionsSnapshot vs IOptionsMonitor** after a setting change in Azure does nothing, or after a singleton starts serving the wrong clinic's feature flag.

This sits next to the [config file guide](/blog/aspnet-core-appsettings-localappsettings). That page is which JSON files exist. This page is **how you consume them in C#** without lying about lifetime.

## The one-line difference

| Type | Lifetime of the wrapper | Sees file / Azure reloads? | Typical inject site |
| --- | --- | --- | --- |
| `IOptions<T>` | Singleton | **No** — value from first bind | Singletons that must not change mid-process |
| `IOptionsSnapshot<T>` | **Scoped** | Yes, per request | Controllers, handlers, request services |
| `IOptionsMonitor<T>` | Singleton | Yes, immediately | Background services, caches, long-lived workers |

`T` is your options class. Bind it once:

```csharp
builder.Services.Configure<IdentityServerOptions>(
    builder.Configuration.GetSection("IdentityServer"));
```

Then pick the interface to match **who lives how long**, not which name you memorized.

## `IOptions<T>` — snapshot at startup

`IOptions<T>.Value` is resolved once and cached. Change `IdentityServer__Authority` in App Service and recycle-less reload will **not** update a singleton that captured `IOptions`.

I use it when the value is a process constant: signing algorithm name, a feature that requires a restart anyway, or a library that only accepts a POCO at construction.

Do **not** inject `IOptions<T>` into a singleton and then wonder why portal edits did nothing. That is not a config bug. That is the contract.

## `IOptionsSnapshot<T>` — once per request

Scoped. Each HTTP request gets a fresh bind if the configuration provider reloaded. Controllers and MediatR handlers can read the current Azure setting without holding it for the life of the process.

```csharp
public sealed class FeeScheduleHandler
{
    private readonly FeeOptions _options;

    public FeeScheduleHandler(IOptionsSnapshot<FeeOptions> options)
    {
        _options = options.Value;
    }
}
```

**Do not inject `IOptionsSnapshot<T>` into a Singleton.** That is a captive dependency — the same class of bug as a singleton `DbContext`. The container will refuse it in recent .NET, or worse, give you one scoped snapshot forever.

## `IOptionsMonitor<T>` — live updates in a singleton

BackgroundService, a hosted refresh worker, a singleton cache: they cannot take `IOptionsSnapshot`. They take `IOptionsMonitor<T>`.

```csharp
public sealed class ReportCache : IDisposable
{
    private readonly IDisposable? _onChange;

    public ReportCache(IOptionsMonitor<CacheOptions> monitor)
    {
        Apply(monitor.CurrentValue);
        _onChange = monitor.OnChange(Apply);
    }

    private void Apply(CacheOptions options) { /* resize, bump version */ }

    public void Dispose() => _onChange?.Dispose();
}
```

`CurrentValue` is the latest. `OnChange` fires when JSON or environment reload. Unsubscribe in `Dispose` or you leak.

On healthcare fee-schedule publishes I still prefer an **explicit version stamp** in the cache key over hoping `OnChange` ran. Monitor is for “ops flipped a flag.” Product data still needs a publish event.

## Named options

`IOptionsSnapshot<T>.Get("SellerPortal")` and `IOptionsMonitor<T>.Get("SellerPortal")` are how you bind two sections to one type. `IOptions<T>` is the default (unnamed) instance only. If you have buyer vs seller JWT settings, use named options — not two nearly identical classes.

## Validate on start

A missing `IdentityServer:Authority` should fail the process at boot, not on the first Angular login. I add:

```csharp
builder.Services.AddOptions<IdentityServerOptions>()
    .BindConfiguration("IdentityServer")
    .ValidateDataAnnotations()
    .ValidateOnStart();
```

That is not a substitute for Key Vault. It is a substitute for “200 on `/health` and 500 on `/connect`.” File names and Azure overlays stay in the [config file guide](/blog/aspnet-core-appsettings-localappsettings). DI lifetimes stay in [DI lifetimes](/blog/aspnet-core-dependency-injection). This page is which **options interface** you inject.

## Checklist

- [ ] Options class has a parameterless constructor and settable properties (bind requirement)
- [ ] Section name matches Azure `__` keys
- [ ] Request code uses `IOptionsSnapshot<T>`
- [ ] Singletons / hosted services use `IOptionsMonitor<T>` or startup-only `IOptions<T>`
- [ ] No `IOptionsSnapshot<T>` in a Singleton
- [ ] `OnChange` is disposed

If a setting works after recycle and fails after a portal edit, you almost always injected `IOptions<T>` into a long-lived service. Swap to monitor, or accept that this setting requires a restart and document it.

## If an interviewer asks

When to use each options interface; why Azure portal edits do not reach a singleton with `IOptions`; can you inject `IOptionsSnapshot` into a singleton.

**Strong answer:** `IOptions<T>` caches at first resolve — fine for startup constants. `IOptionsSnapshot<T>` is scoped — use in controllers/handlers. `IOptionsMonitor<T>` gives `CurrentValue` and `OnChange` for singletons and workers. Never inject snapshot into a singleton — captive dependency.


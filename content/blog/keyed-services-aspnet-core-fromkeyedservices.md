---
title: "Keyed Services in ASP.NET Core (FromKeyedServices) — When Keys Beat a Factory"
description: "How I use AddKeyedScoped and FromKeyedServices in ASP.NET Core for closed sets of implementations — EDI vs FHIR clients, tenant notifiers — and when a factory is still the honest design."
date: "2026-08-16"
category: "dependency-injection"
tags: ["Dependency Injection", "ASP.NET Core", ".NET", "IoC"]
---

.NET 8 keyed services let you register **several implementations of the same interface** and inject **one of them by key**. That is useful. It is also a way to hide a service locator in constructor syntax.

This article is the **keyed DI** tutorial I wish teams read before they replace every factory with `[FromKeyedServices("sms")]`. Lifetimes and captive dependencies stay in [the DI guide](/blog/aspnet-core-dependency-injection). Factory vs keyed vs strategy is sketched in [Factory pattern](/blog/csharp-factory-pattern); here the examples are **healthcare multi-implementation**, not checkout payments.

## What keyed services are for

Closed set. Compile-time keys. Container-owned lifetime.

```csharp
builder.Services.AddKeyedScoped<IOutboundClient, X12OutboundClient>("x12");
builder.Services.AddKeyedScoped<IOutboundClient, FhirOutboundClient>("fhir");
```

```csharp
public sealed class PartnerDispatchService(
    [FromKeyedServices("x12")] IOutboundClient x12,
    [FromKeyedServices("fhir")] IOutboundClient fhir)
{
    public Task SendAsync(PartnerChannel channel, OutboundMessage message, CancellationToken ct) =>
        channel switch
        {
            PartnerChannel.X12 => x12.SendAsync(message, ct),
            PartnerChannel.Fhir => fhir.SendAsync(message, ct),
            _ => throw new InvalidOperationException($"Unknown channel {channel}"),
        };
}
```

The switch is still there. Keyed DI did not remove the decision. It removed `new X12OutboundClient(...)` and gave each client a **scoped** lifetime next to `DbContext`.

That is the win on a healthcare intake API: X12 and FHIR clients each hold `HttpClient` / typed clients, credentials, and timeouts. They must not be `new`ed inside a handler.

## FromKeyedServices vs GetKeyedService

**Constructor `[FromKeyedServices("x12")]`** — use when the key is **fixed** for that class. The dispatch service above always needs both clients, or a processor always needs `"sms"`.

**`IServiceProvider.GetRequiredKeyedService<IOutboundClient>(key)`** — use when the key arrives **at runtime** (query string, tenant setting, partner record). This is a locator. Keep it in **one** application service, not in domain entities.

```csharp
public sealed class PartnerClientResolver(IServiceProvider services)
{
    public IOutboundClient Resolve(string key) =>
        services.GetRequiredKeyedService<IOutboundClient>(key);
}
```

Do not inject `IServiceProvider` into every handler. Inject `PartnerClientResolver` (or a factory interface) so tests fake one type.

If the key is invalid, return **400/422** from the API edge with a stable message. Do not leak `InvalidOperationException` from the container to Angular.

## Keys I actually use

Strings like `"x12"` and `"fhir"` match partner configuration in SQL. I keep them **lowercase, documented, enum-backed** on the HTTP contract:

```csharp
public enum PartnerChannel
{
    X12 = 0,
    Fhir = 1,
}
```

Map enum → key in one place. Angular sends the enum name or a documented literal. If you let the SPA send arbitrary strings into `GetRequiredKeyedService`, you have turned DI into a plugin host you did not intend to build.

Other closed sets that fit:

- `"smtp"` vs `"sendgrid"` for `IEmailSender` when the tenant has a flag (still: validate tenant allows SendGrid **before** resolve)
- `"primary"` vs `"archive"` SQL connection factories — only if both are registered and the key cannot be a user-controlled string without an allowlist

## Lifetimes still apply (this is where keyed DI bites)

Keyed does not create a new lifetime. `AddKeyedSingleton<IOutboundClient, X12OutboundClient>("x12")` plus a **scoped** `DbContext` inside that client is still a [captive dependency](/blog/aspnet-core-dependency-injection).

Rules I use:

- Prefer **`AddKeyedScoped`** for anything that uses `DbContext`, `HttpClient` typed clients, or user/tenant ambient state
- **`AddKeyedSingleton`** only for stateless, thread-safe implementations
- **`AddKeyedTransient`** for lightweight strategies with no I/O

A keyed singleton that captures the first request’s tenant is a cross-tenant bug. Those are the incidents that get lawyers involved in healthcare. Do not “make it singleton because HttpClient should be long-lived” — use `IHttpClientFactory` / typed clients registered normally, and keep the keyed wrapper scoped.

## What keyed DI is worse at than a factory class

A factory can:

- Log which implementation was chosen
- Fall back (`fhir` missing → skip, not throw)
- Apply per-call credentials from the partner row
- Run a feature flag

`FromKeyedServices` cannot do those without you wrapping it anyway. When the wrapper grows, **delete the keys** and keep the factory. I have reverted keyed registrations on a marketplace notifications module for that reason: every merchant had setup, not just a name.

## Testing

```csharp
services.AddKeyedScoped<IOutboundClient, FakeX12Client>("x12");
services.AddKeyedScoped<IOutboundClient, FakeFhirClient>("fhir");
```

Same keys as production. If a test host forgets a key, fail at startup — that is a gift. Do not catch resolve exceptions in the factory and return null; you will debug “why didn’t EDI send” for a day.

## Angular-facing contract

The SPA should not know that ASP.NET Core uses keyed DI. It should know **allowed channels**. Document them. Return 400 for unknown. That is the same rule as factory keys in the Factory article — because keyed DI is still a mapping from a string to a behavior.

---

If you are choosing keyed services vs a factory on an ASP.NET Core API with more than one outbound integration (EDI, FHIR, email), [contact me](/contact). The registration graph is usually a one-hour review; the tenant-isolation mistakes are not.

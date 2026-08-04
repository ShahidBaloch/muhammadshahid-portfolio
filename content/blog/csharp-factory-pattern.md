---
title: "Factory Pattern in C# with ASP.NET Core Dependency Injection"
description: "How to use the Factory Pattern in C# with ASP.NET Core DI — replace brittle switch statements, use factory delegates and keyed services, and know when a real factory class is worth it."
date: "2026-07-30"
category: "design-patterns"
tags: ["Factory Pattern", "C#", "Design Patterns", "Dependency Injection", "ASP.NET Core"]
---

The **Factory Pattern in C#** is one of the most searched design-pattern topics for .NET developers — usually right after someone pastes a growing `switch (providerType)` into a service constructor. In ASP.NET Core products, the useful version of Factory is rarely a textbook UML diagram. It is a clear way to **create the right implementation at runtime** while still playing nicely with **dependency injection**.

I use factories in payment adapters, notification channels, file storage backends, and auction-style workflows (similar boundaries to marketplace work like CarBazaar). This article is the practical playbook I follow on client codebases.

## What problem Factory actually solves

Factory is about **deferring and centralizing creation**:

- The caller needs an `IPaymentProcessor`, not `StripeProcessor` hard-coded
- The choice depends on runtime data (tenant config, request header, payment method)
- Construction needs more than `new` — logging, options, or other injected services

If the implementation is fixed for the whole app lifetime, you usually want plain DI registration — not a factory. If selection changes per request, Factory (or keyed DI) earns its place.

## Anti-pattern: switch in every feature

```csharp
INotificationSender sender = channel switch
{
    "email" => new EmailSender(_smtp),
    "sms" => new SmsSender(_twilio),
    _ => throw new NotSupportedException(channel),
};
```

Problems:

1. Every new channel edits this method
2. `new` bypasses DI lifetimes and makes testing harder
3. The same switch appears in two or three features within a month

## Pattern 1: Factory delegate in Program.cs

For simple cases, register a factory delegate:

```csharp
services.AddScoped<IEmailSender, SmtpEmailSender>();
services.AddScoped<ISmsSender, TwilioSmsSender>();

services.AddScoped<Func<string, INotificationSender>>(sp => key =>
{
    return key switch
    {
        "email" => sp.GetRequiredService<IEmailSender>(),
        "sms" => sp.GetRequiredService<ISmsSender>(),
        _ => throw new NotSupportedException($"Unknown channel: {key}"),
    };
});
```

Consume:

```csharp
public sealed class NotifyUserHandler
{
    private readonly Func<string, INotificationSender> _factory;

    public NotifyUserHandler(Func<string, INotificationSender> factory)
        => _factory = factory;

    public Task Handle(string channel, Message msg)
        => _factory(channel).SendAsync(msg);
}
```

This keeps creation in one place and lets each sender receive its own dependencies from the container.

## Pattern 2: Explicit factory class (when logic grows)

Use a real class when you need validation, fallbacks, metrics, or per-call parameters:

```csharp
public interface IPaymentProcessorFactory
{
    IPaymentProcessor Create(string method, string merchantId);
}

public sealed class PaymentProcessorFactory : IPaymentProcessorFactory
{
    private readonly IServiceProvider _services;
    private readonly ILogger<PaymentProcessorFactory> _logger;

    public PaymentProcessorFactory(
        IServiceProvider services,
        ILogger<PaymentProcessorFactory> logger)
    {
        _services = services;
        _logger = logger;
    }

    public IPaymentProcessor Create(string method, string merchantId)
    {
        _logger.LogInformation("Resolving processor {Method} for merchant {MerchantId}", method, merchantId);

        IPaymentProcessor processor = method.ToLowerInvariant() switch
        {
            "card" => _services.GetRequiredService<CardProcessor>(),
            "wallet" => _services.GetRequiredService<WalletProcessor>(),
            _ => throw new NotSupportedException(method),
        };

        processor.ConfigureMerchant(merchantId);
        return processor;
    }
}
```

Register the factory as scoped/singleton based on what it holds. Prefer **scoped** if it depends on request services.

Avoid turning the factory into a service locator that resolves everything in the app. Factories should create a **narrow family** of related types.

## Pattern 3: Keyed DI in modern .NET

Since .NET 8, keyed services often replace small factories:

```csharp
services.AddKeyedScoped<IPaymentProcessor, CardProcessor>("card");
services.AddKeyedScoped<IPaymentProcessor, WalletProcessor>("wallet");
```

Injection:

```csharp
public CheckoutService([FromKeyedServices("card")] IPaymentProcessor card)
{
}
```

Or resolve by key at runtime through `IServiceProvider` / keyed APIs when the key arrives with the request.

**Rule of thumb:** if selection is a closed set of keys with no extra logic, keyed DI is enough. If you need merchant configuration, fallbacks, or auditing on selection, keep a factory class.

## Factory vs Strategy vs Keyed DI vs Service Locator

People confuse these constantly. Here is the comparison I use in code reviews:

| Approach | Best when | Watch out for |
|---|---|---|
| **Factory delegate** | Small closed set, no extra logic | Delegate grows into 40-line switch |
| **Factory class** | Validation, fallbacks, per-call config | Becomes a god-object resolving everything |
| **Keyed DI** | Fixed keys, container owns lifetime | No place for merchant-specific setup |
| **Strategy** | Behavior swap on existing object | Wrong tool if you need construction |
| **Service locator** | Almost never in app code | Hidden dependencies, untestable handlers |

Often Factory creates a Strategy. Keep the names straight so code reviews stay short. I cover Strategy in [Strategy Pattern in C#](/blog/csharp-strategy-pattern).

## A real failure story: the notification channel that leaked

On a healthcare SaaS project, a junior dev added SMS notifications by extending an existing `switch` inside a handler. They used `new TwilioSmsSender(...)` because "DI was too slow to figure out." It worked in dev.

In production under load, two problems surfaced within a week. First, the Twilio client was recreated on every notification — connection churn and rate-limit spikes. Second, a scoped audit service was captured inside the manually constructed sender, so audit records from one tenant occasionally appeared attached to another tenant's notification batch. We traced it for two days before finding the `new` in a feature folder three levels deep.

The fix was boring and correct: register senders in DI, register a factory delegate, delete every `new` in feature code. Total diff was about 80 lines. The incident cost more than a week of on-call attention.

Lesson I repeat in reviews: **factories exist so creation stays in one audited place**. Scatter `new` and you scatter lifetime bugs.

## Angular contract notes

When an Angular SPA sends a channel or provider key, the factory boundary is also an API contract boundary. I treat it that way:

- Publish valid keys in OpenAPI enums or documented string literals — not buried in a wiki
- Return **400 Bad Request** with a clear message for unknown keys, not 500 from `NotSupportedException` leaking to the client
- Keep keys **lowercase and stable** (`"email"`, not `"Email"` or `"EMAIL"`) — Angular teams will send what the dropdown shows
- If keys are tenant-specific (only some merchants get `"wallet"`), validate against tenant config **before** calling the factory, and return 403 or 422 with a business message

The Angular app should not know which concrete C# class handles `"sms"`. It sends a mode string; the API owns the mapping. That separation is what lets you add push notifications six months later without an Angular release.

## When I refuse to add a factory

- Only one implementation exists and will for the foreseeable future
- The "factory" would wrap a single `GetRequiredService<T>()` with no logic
- The team is about to invent an abstract factory hierarchy for two classes
- The selection is compile-time fixed — just inject the interface directly
- Someone wants a factory "for flexibility" when the product roadmap shows no second implementation in the next two quarters

Ceremony without change-rate is how design patterns get a bad reputation. I have rejected factory PRs where the entire "family" was `PdfExporter` and a hypothetical `ExcelExporter` that no stakeholder had requested.

If you are unsure, ask: **will a third variant arrive within two release cycles?** No → plain DI. Yes → factory or keyed DI.

## Testing without pain

- Unit-test the factory's selection table with fake processors
- Unit-test handlers by injecting a `Func<...>` or fake `IPaymentProcessorFactory`
- Integration-test only the registration wiring in `Program.cs`
- Add a test that unknown keys throw or return the expected error type — this catches registration drift

Do not require a full web host to verify `card` maps to `CardProcessor`. A small test that builds a `ServiceCollection`, registers your modules, resolves the factory, and asserts the runtime type is enough.

For factory classes that call `ConfigureMerchant(merchantId)`, test that the configuration actually runs. I once shipped a factory that returned the right processor but forgot to call configure — payments succeeded for the platform default merchant but failed silently for everyone else.

## Lifetime gotchas factories inherit from DI

Factories do not escape DI lifetime rules. Common mistakes I still catch:

- **Singleton factory** holding a reference to a scoped `DbContext` because a processor needed it at construction time
- **Transient processors** registered behind a factory when they should be scoped (one per request)
- Resolving keyed services inside a **singleton** factory without creating a scope

If your factory depends on request-scoped services, the factory itself should almost always be **scoped**. See [Dependency Injection in ASP.NET Core](/blog/aspnet-core-dependency-injection) for the captive dependency trap — factories make it easier to hide, not harder.

## Production checklist

1. Name the family (`INotificationSender`, not `IService`)
2. Keep selection in one module (delegate, keyed DI, or factory class)
3. Register implementations in DI — avoid `new` inside features
4. Log unknown keys as warnings/errors with context (tenant id, request id)
5. Document valid keys next to registration in code comments or OpenAPI
6. Prefer keyed DI for simple maps; factory class for rich creation
7. Return 400 for unknown keys at the API boundary before the factory throws
8. Integration-test that each registered key resolves without building the full web host
9. Review factory lifetime whenever a scoped service enters the graph

## SEO note and originality

Searches like **factory pattern C#**, **factory pattern dependency injection**, and **ASP.NET Core factory pattern** are crowded with copy-paste GoF summaries. This post is original guidance from shipping .NET APIs — focused on DI-friendly factories that survive code review.

Related reading: [Dependency Injection in ASP.NET Core](/blog/aspnet-core-dependency-injection) and [Strategy Pattern in C#](/blog/csharp-strategy-pattern).

If you want these patterns applied cleanly in your codebase, [contact me](/contact).

---
title: "Strategy Pattern in C#: Replace If-Else With Clean Behavior Swaps"
description: "Strategy Pattern in C# for ASP.NET Core — swap pricing, validation, or export algorithms without giant if-else blocks, and register strategies with dependency injection."
date: "2026-08-01"
category: "design-patterns"
tags: ["Strategy Pattern", "C#", "Design Patterns", "ASP.NET Core", "SOLID"]
---

The **Strategy Pattern in C#** shows up in search results whenever a pricing, validation, or export feature becomes an `if/else` tower. Unlike Factory (which focuses on **creating** objects), Strategy focuses on **selecting a behavior** you already have and running it through a common interface.

I apply Strategy in fee calculations, eligibility checks, and document export pipelines on .NET backends that Angular UIs call. Here is how I implement it so it stays readable under DI.

## The smell Strategy removes

```csharp
public decimal Calculate(Order order, string mode)
{
    if (mode == "retail") return order.Subtotal * 1.0m;
    if (mode == "wholesale") return order.Subtotal * 0.85m;
    if (mode == "partner") return ApplyPartnerRules(order);
    throw new NotSupportedException(mode);
}
```

Every new commercial rule edits this method. Tests grow brittle. Angular adds a new pricing mode and the API becomes a merge conflict magnet.

## Core idea

1. Define a strategy interface
2. Implement one class per algorithm
3. Inject a selector (or all strategies) and pick one
4. Keep the caller ignorant of the concrete algorithms

```csharp
public interface IPricingStrategy
{
    string Key { get; }
    decimal Calculate(Order order);
}

public sealed class RetailPricingStrategy : IPricingStrategy
{
    public string Key => "retail";
    public decimal Calculate(Order order) => order.Subtotal;
}

public sealed class WholesalePricingStrategy : IPricingStrategy
{
    public string Key => "wholesale";
    public decimal Calculate(Order order) => order.Subtotal * 0.85m;
}
```

## Wire strategies with ASP.NET Core DI

```csharp
services.AddSingleton<IPricingStrategy, RetailPricingStrategy>();
services.AddSingleton<IPricingStrategy, WholesalePricingStrategy>();
services.AddSingleton<IPricingStrategy, PartnerPricingStrategy>();

services.AddScoped<IPricingService, PricingService>();
```

```csharp
public sealed class PricingService
{
    private readonly IReadOnlyDictionary<string, IPricingStrategy> _strategies;

    public PricingService(IEnumerable<IPricingStrategy> strategies)
    {
        _strategies = strategies.ToDictionary(s => s.Key, StringComparer.OrdinalIgnoreCase);
    }

    public decimal Calculate(Order order, string mode)
    {
        if (!_strategies.TryGetValue(mode, out var strategy))
            throw new NotSupportedException($"Unknown pricing mode: {mode}");

        return strategy.Calculate(order);
    }
}
```

Registering multiple implementations of the same interface and injecting `IEnumerable<T>` is an idiomatic ASP.NET Core approach. No service locator required.

## Strategy vs Factory vs plain DI

| Need | Prefer | Avoid |
|---|---|---|
| Swap algorithm for an already-built object graph | **Strategy** | Factory that only wraps `new` |
| Construct different types with heavy dependencies | **Factory** / keyed DI | Strategy with fat constructors |
| One implementation forever | Plain DI, no pattern name | Interface + single class "for future" |
| Async I/O inside algorithm | Strategy with `Task<T>` method | Sync method that blocks on `.Result` |
| Compose multiple rules (discount + tax + fee) | Pipeline or chain of strategies | One God strategy with nested if |

Often Factory creates a Strategy. Keep the names straight so code reviews stay short. See [Factory Pattern in C#](/blog/csharp-factory-pattern).

## Real product examples

**Healthcare / ops:** eligibility or fee-schedule calculation modes (standard vs contracted rates).  
**eCommerce:** shipping estimators or discount engines.  
**Exports:** CSV vs Excel vs PDF generators behind `IExportStrategy`.

Angular usually sends a mode string or enum; the API maps it to a strategy key. Validate unknown keys with 400, not 500.

## A real failure story: the partner pricing key mismatch

On a B2B portal, wholesale and retail pricing worked flawlessly. Partner pricing was added — new `PartnerPricingStrategy`, registered in DI, unit tests green. Production rollout day: every partner checkout returned 500.

The Angular team had added `"Partner"` to their pricing dropdown (PascalCase, matching their TypeScript enum naming). Our strategy key was `"partner"`. We used case-insensitive dictionary lookup in `PricingService`, so that part was fine. The bug was upstream: middleware validated the pricing mode against a **case-sensitive** allow-list before the request reached our service. `"Partner"` failed validation; `"partner"` never arrived.

We fixed the allow-list and documented keys in OpenAPI. Total code change was small; the outage window was not. Since then I insist strategy keys appear in **OpenAPI enums**, Angular models are generated from spec, and both teams share the same string literals.

Another lesson from the same project: the partner strategy needed async database lookups for contracted rates. We started with a sync `Calculate` method and hid `.GetAwaiter().GetResult()` inside. Under load, that caused thread-pool starvation and timeouts the Angular app reported as "network errors." We refactored to `Task<decimal> CalculateAsync(Order order)` across the interface. Boring async-all-the-way fix; zero frontend changes.

## Angular contract notes

Strategy selection is an API contract, not an implementation detail:

- Expose valid mode values in OpenAPI (`enum: [retail, wholesale, partner]`)
- Use **lowercase kebab or snake** consistently if your API style guide prefers it — just be consistent everywhere
- Return structured 400 bodies: `{ "error": "unknown_pricing_mode", "validModes": ["retail", "wholesale"] }` — Angular can show a useful message without parsing exception text
- Never leak strategy class names in error responses (`PartnerPricingStrategy not found` tells clients nothing useful)
- Version carefully when removing a mode — deprecate in docs first, log usage, then remove

If Angular sends a mode the user is not allowed to use (e.g., wholesale pricing without a wholesale account), return **403 Forbidden** or **422 Unprocessable Entity** with a business message — not a strategy `NotSupportedException` that looks like a bug.

## Open/Closed without premature abstraction

Strategy helps you follow Open/Closed: add a class, register it, done. Do **not** create fifteen strategies for a rule that will never vary. Patterns are tools for change rate — not decorations.

If only two modes exist and the logic is five lines each, a private method may be enough. Promote to Strategy when the third mode arrives or when tests become painful.

## When I refuse to use Strategy

- Two branches, five lines each, no roadmap for a third — use private methods
- The "algorithms" differ only by a constant multiplier — a configuration table may suffice
- Every strategy would duplicate 90% of the same code — extract shared logic first, or you are decorating duplication
- Selection happens once at startup and never changes — inject the one implementation
- The team wants a strategy per `if` branch in a 200-line method without understanding the domain vocabulary

I have seen `ExportStrategy`, `ExportStrategyV2`, and `LegacyExportStrategy` coexist because nobody deleted the old path. That is not Strategy — that is fear of removing code.

## Async strategies and I/O boundaries

If a strategy hits the database or calls an external API, make that explicit in the interface:

```csharp
public interface IPricingStrategy
{
    string Key { get; }
    Task<decimal> CalculateAsync(Order order, CancellationToken cancellationToken);
}
```

Keep strategies **stateless** when registered as singleton. If a strategy needs scoped data (current tenant's rate card), register strategies as **scoped** or pass context into `CalculateAsync` rather than storing mutable state on the instance.

Document in the interface whether implementations may cache, may call DB, or must be pure. Hidden I/O inside "calculation" strategies is how unit tests become integration tests by accident.

## Composite and pipeline strategies

Sometimes one mode is not enough — an order might need base pricing, then a discount strategy, then a tax strategy. Options:

1. **Pipeline:** run ordered `IOrderAdjustment` steps — each step is small, testable
2. **Composite key:** `"wholesale+promo"` maps to a dedicated strategy (works for few combos, explodes if combos multiply)
3. **Context object:** pass `PricingContext` with flags instead of multiplying strategy classes

I prefer pipeline for tax/discount/fee stacking. Reserve named strategies for genuinely different business models (retail vs wholesale vs partner contract).

## Testing strategies

- Test each strategy class in isolation with table-driven cases  
- Test `PricingService` selection with a fake dictionary or two stub strategies  
- Avoid coupling tests to DI container details  
- Test unknown-key handling returns the exception or result type your API layer expects
- For async strategies, use `CancellationToken` in tests to verify cooperative cancellation

One integration test that resolves all registered `IPricingStrategy` implementations and asserts unique keys catches duplicate registration — a mistake that causes `ToDictionary` to throw at first request.

## Common mistakes

1. Strategies that secretly call the database in unpredictable ways without stating I/O in the interface  
2. Mutable shared state inside singleton strategies (race conditions)  
3. Keys that drift from what Angular sends (`Retail` vs `retail`)  
4. One "God strategy" that still contains a switch  
5. Registering strategies as transient when they are stateless — unnecessary allocation per resolve
6. Throwing `NotSupportedException` at the strategy layer instead of returning a result type the API maps to 400

## Checklist

1. Name strategies by business language (`WholesalePricing`, not `Strategy2`)  
2. Make keys explicit and case-safe  
3. Register via DI; inject `IEnumerable<IStrategy>`  
4. Keep strategies small and side-effect aware  
5. Return clear errors for unknown modes  
6. Document keys in OpenAPI enums shared with Angular  
7. Use async interfaces when I/O is involved  
8. Delete deprecated strategies — do not accumulate "legacy" variants

## Why this ranks

Queries like **strategy pattern C#**, **strategy pattern in C# with example**, and **strategy pattern ASP.NET Core** stay popular because teams hit branching pain constantly. An original, DI-first explanation beats another copy of the Wikipedia diagram.

Continue with [Factory Pattern in C#](/blog/csharp-factory-pattern) and [Dependency Injection lifetimes](/blog/aspnet-core-dependency-injection).

Want help refactoring a pricing or rules engine in your API? [Get in touch](/contact).

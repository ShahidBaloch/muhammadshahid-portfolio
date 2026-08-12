---
title: "SOLID Principles in C# and ASP.NET Core (With Real API Examples)"
description: "SOLID principles in C# for ASP.NET Core — detailed SRP, OCP, LSP, ISP, DIP examples with DI, Angular-facing APIs, anti-patterns, and refactor checklists from production systems."
date: "2026-08-11"
category: "design-patterns"
tags: ["SOLID", "C#", "ASP.NET Core", "Design Patterns", ".NET", "Architecture"]
---

**SOLID principles in C#** remain one of the most searched software-design topics for .NET developers — and one of the easiest to get wrong in ASP.NET Core. Teams paste the five letters into Confluence, then ship god controllers, 30-method interfaces, and “DIP” that still news up `SqlConnection` in a Razor-adjacent service.

This guide is a **practical SOLID walkthrough for ASP.NET Core APIs** that serve Angular SPAs. Examples are drawn from healthcare, SaaS, and marketplace work (including patterns used around CarBazaar and Ecom_NET10-style systems). It is original commentary and code — not a recycled Wikipedia paraphrase.

If you are preparing interviews, pair this with [ASP.NET Core scenario questions](/blog/aspnet-core-interview-questions-scenarios).

## The five principles (working definitions)

| Letter | Name | Meaning on a real API |
|---|---|---|
| **S** | Single Responsibility | A class has one reason to change |
| **O** | Open/Closed | Add behavior by extension, not endless edits to the same method |
| **L** | Liskov Substitution | Implementations honor the abstraction’s contract |
| **I** | Interface Segregation | Clients should not depend on methods they do not use |
| **D** | Dependency Inversion | High-level policy depends on abstractions; details plug in via DI |

SOLID is a **compass**, not a mandate to create an interface for every line of code.

---

## S — Single Responsibility

### The smell

`OrdersController` validates input, calculates discounts, writes EF entities, sends email, and formats Angular DTOs. Every commercial change risks breaking HTTP concerns.

### The shape that scales

```csharp
[ApiController]
[Route("api/orders")]
public class OrdersController : ControllerBase
{
    private readonly ICreateOrderHandler _create;

    public OrdersController(ICreateOrderHandler create) => _create = create;

    [HttpPost]
    public async Task<ActionResult<OrderDto>> Create(
        CreateOrderRequest request,
        CancellationToken ct)
    {
        var result = await _create.HandleAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = result.Id }, result);
    }
}
```

- **Controller** — auth challenges, status codes, ProblemDetails
- **Handler/service** — orchestration
- **Domain/pricing** — rules that change with the business
- **Infrastructure** — EF, email, blob

On auction-style flows, keeping bid rules out of controllers stopped cross-team merge wars.

### SRP test question

“What is the one sentence that describes why this class exists?” If you need three sentences joined by “and,” split it.

---

## O — Open/Closed

### The smell

```csharp
decimal Price(Order o) =>
    o.Partner switch
    {
        "A" => /* 40 lines */,
        "B" => /* 40 lines */,
        _ => o.ListPrice
    };
```

Every new partner edits the same method — regressions guaranteed.

### The fix: strategies + DI

```csharp
public interface IPricingStrategy
{
    string Key { get; }
    Task<decimal> CalculateAsync(PricingContext ctx, CancellationToken ct);
}

public sealed class PartnerAPricingStrategy : IPricingStrategy
{
    public string Key => "A";
    public Task<decimal> CalculateAsync(PricingContext ctx, CancellationToken ct) { /* ... */ }
}
```

Register all strategies; select by key. Adding partner C is a **new type**, not a rewrite of A/B. See [Strategy Pattern in C#](/blog/csharp-strategy-pattern).

### OCP without ceremony

You do not need a plugin system on day one. You need a seam **before** the third variant lands.

---

## L — Liskov Substitution

### The smell

Base contract: `GetAsync` returns `null` when missing. A “smart” subclass throws `NotFoundException` instead. Callers that check for null now blow up. Mocks in tests disagree with production.

### The rule

Whatever your abstraction promises — null, Result type, or typed errors — **every implementation and fake must honor it**.

```csharp
public interface IOrderReadRepository
{
    /// <summary>Returns null when the order does not exist.</summary>
    Task<Order?> GetAsync(Guid id, CancellationToken ct);
}
```

Prefer explicit `Result<T>` / `OneOf` styles on teams that constantly fight null vs exception wars — but pick one contract and keep it.

### LSP interview angle

“Would substituting this implementation break callers that only know the interface?” If yes, you violated L.

---

## I — Interface Segregation

### The smell

```csharp
public interface IOrderService
{
    Task CreateAsync(...);
    Task RefundAsync(...);
    Task ExportCsvAsync(...);
    Task SyncErpAsync(...);
    Task RecalculateLoyaltyAsync(...);
}
```

An Angular-facing refund screen’s test host now stubs ERP sync and loyalty.

### The fix

```csharp
public interface IOrderWriter
{
    Task<Order> CreateAsync(CreateOrderCommand cmd, CancellationToken ct);
}

public interface IOrderRefunds
{
    Task RefundAsync(RefundCommand cmd, CancellationToken ct);
}

public interface IOrderExports
{
    Task<Stream> ExportCsvAsync(ExportQuery query, CancellationToken ct);
}
```

Split by **actor** or **use case**, not by “everything about orders.”

### ISP practical heuristic

If a class implements an interface and leaves methods as `throw new NotSupportedException()`, the interface is too wide.

---

## D — Dependency Inversion

### The smell

```csharp
public sealed class CreateOrderHandler
{
    public Task HandleAsync(...) 
    {
        using var db = new AppDbContext(/* ... */); // detail in policy
        var smtp = new SmtpClient();
        // ...
    }
}
```

### The fix

```csharp
public sealed class CreateOrderHandler : ICreateOrderHandler
{
    private readonly IOrderWriter _orders;
    private readonly IPricingStrategyResolver _pricing;
    private readonly IClock _clock;

    public CreateOrderHandler(
        IOrderWriter orders,
        IPricingStrategyResolver pricing,
        IClock clock)
    {
        _orders = orders;
        _pricing = pricing;
        _clock = clock;
    }
}
```

Compose in `Program.cs` / composition root. Understand lifetimes — Singleton capturing Scoped is a DIP footgun. See [DI lifetimes](/blog/aspnet-core-dependency-injection).

### DIP myth

“DIP means interface for every class.” No. DIP means **policy doesn’t own infrastructure details**. One implementation with no test seam yet can stay concrete until a second path appears.

---

## SOLID anti-patterns I still review

| Anti-pattern | What it looks like | Better move |
|---|---|---|
| Interface mania | `IOrder` / `Order` 1:1 forever | Wait for a second implementation or test need |
| Folder Clean Architecture, fat controllers | Ceremony without SRP | Thin controllers first |
| God `IApplicationService` | ISP violation | Feature-sliced interfaces |
| Inheritance for reuse | LSP breaks | Composition / strategy |
| Abstractions leaking EF types | DIP theater | DTOs/domain types at boundaries |

---

## Mini case study: partner pricing outage

A SaaS catalog used a switch on partner codes inside the controller. Partner B’s key format changed; the default branch silently applied list price. Revenue dropped for a weekend.

Refactor:

1. Extract `IPricingStrategy` per partner
2. Fail loudly on unknown keys (400 to Angular, alert to ops)
3. Contract tests per strategy
4. Controller untouched when partner D arrived

That is OCP + SRP paying rent.

---

## SOLID + Angular: who owns what

| Concern | ASP.NET Core | Angular |
|---|---|---|
| Authorization decisions | Policies / resource checks | Hide UI only |
| Price calculation | Server strategies | Display results |
| Validation rules that protect data | Server | UX validation optional |
| DTO shaping | API contracts | Strongly typed clients |

SOLID on the server does not replace SPA structure — but leaky APIs force Angular to compensate with hacks.

---

## Refactor checklist (use on a real PR)

1. Controllers/Minimal API endpoints do not contain commercial rules
2. New variants added as types (OCP) when a third `if` appears
3. Interface contracts documented and honored by fakes (LSP)
4. No NotSupported methods on wide interfaces (ISP)
5. No `new` infrastructure inside application handlers (DIP)
6. DI lifetimes reviewed for captive dependencies
7. Tests cover the seam you claim exists

---

## Related reading

- [Strategy Pattern in C#](/blog/csharp-strategy-pattern)
- [Factory Pattern in C#](/blog/csharp-factory-pattern)
- [Clean Architecture in ASP.NET Core](/blog/clean-architecture-aspnet-core)
- [ASP.NET Core interview scenarios](/blog/aspnet-core-interview-questions-scenarios)

If your .NET + Angular codebase treats SOLID as wallpaper while every feature edits the same controller, [contact me](/contact) — we can carve seams around the hottest change rates first.

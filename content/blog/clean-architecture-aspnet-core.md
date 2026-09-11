---
title: "Clean Architecture in C# and ASP.NET Core Without Over-Engineering"
description: "Pragmatic Clean Architecture in C# / ASP.NET Core — Onion vs Clean, domain boundaries, three-project layout, and when to skip ceremony on SaaS and eCommerce APIs."
date: "2026-05-28"
updated: "2026-09-12"
category: "architecture"
tags: ["Clean Architecture", ".NET", "EF Core", "Architecture", "C#"]
related:
  - modular-monolith-vs-microservices-dotnet
  - repository-pattern-dotnet
  - mediatr-cqrs-aspnet-core
faq:
  - q: "How do I apply Clean Architecture in ASP.NET Core without over-engineering?"
    a: "Keep domain rules independent of EF and Angular. Add a project only when a boundary saves change cost. Folders are not the architecture."
  - q: "Is Clean Architecture the same as Onion Architecture in .NET?"
    a: "Same idea: dependencies point inward. Onion names the concentric rings; Clean names the same rule in Uncle Bob’s vocabulary. I ship a three-project layout (Api, Core, Infrastructure) either way."
  - q: "Must every API have a Domain layer on day one?"
    a: "No. A clinic admin with two screens can wait. Ecom_NET10-style catalogs earn the split sooner. Ceremony vs delivery is the point."
  - q: "Is Clean Architecture the same as microservices?"
    a: "No. You can have clean modules in one host. Splitting processes is the modular monolith vs microservices article."
---

## Definition

**Clean Architecture** in ASP.NET Core means business rules live in an inner core that knows nothing about HTTP, SQL, or Angular. Outer layers (API, Infrastructure) depend inward. The goal is not folder purity — it is keeping domain rules stable while UI frameworks, ORM details, and hosting choices change around them.

## Onion diagram

Onion Architecture is named for this shape — peel from outside in, dependencies point inward:

```text
        ┌─────────────────────────────┐
        │  API (HTTP, DTOs, auth)     │  ← outer: knows about HTTP
        ├─────────────────────────────┤
        │  Infrastructure (EF, email) │  ← implements Core interfaces
        ├─────────────────────────────┤
        │  Core (entities, rules)     │  ← inner: knows nothing external
        └─────────────────────────────┘

Cart discount logic lives in Core.
Include() graph tuning lives in Infrastructure.
Controllers stay thin translators.
```

If you can swap EF Core tuning without reopening checkout policy, the onion is working.

## Clean Architecture vs Onion Architecture in .NET

**Onion Architecture** (Palermo) and **Clean Architecture** (Uncle Bob) are the same dependency rule with different diagrams. Dependencies point **inward**. The domain/core knows nothing about EF, HTTP, or Angular. Adapters (API, Infrastructure) implement core interfaces.

I do not pick a camp. Search **onion architecture c** or **clean architecture c#** and you should land on this URL: a three-project layout — Api, Core, Infrastructure — not seven projects named after a blog template.

| Name | What people picture | What I actually ship |
|---|---|---|
| Onion | Concentric rings, domain in the middle | Core project + infra implementing ports |
| Clean | Use cases / entities / interface adapters | Same Core; handlers as use cases |
| Ports and adapters | Hexagonal | Same rule, hexagonal drawing |

If the cart discount lives in a controller, none of the names are true yet. Fix the dependency direction; do not rename folders.

**When to use this split:** more than one UI or job needs the same rule (checkout, admin import, nightly repricer).

**When not to:** a two-screen clinic admin. Three empty projects are not architecture — they are a template.

The rule in code — Core defines a port, Infrastructure implements it, API never new's EF:

```csharp
// Core — no Microsoft.EntityFrameworkCore reference
public interface IOrderWriter
{
    Task<Guid> PlaceAsync(PlaceOrderCommand cmd, CancellationToken ct);
}

public sealed class PlaceOrderHandler(IOrderWriter orders)
{
    public Task<Guid> Handle(PlaceOrderCommand cmd, CancellationToken ct)
        => orders.PlaceAsync(cmd, ct);
}

// Infrastructure
public sealed class EfOrderWriter(AppDbContext db) : IOrderWriter
{
    public async Task<Guid> PlaceAsync(PlaceOrderCommand cmd, CancellationToken ct)
    {
        var order = Order.Create(cmd);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);
        return order.Id;
    }
}
```

If `PlaceOrderHandler` takes `AppDbContext`, you are in a layered ASP.NET app, not Clean/Onion — which is fine until the second consumer appears.

## Routing

**Clean Architecture without over-engineering** → stay here.

**When to split into services** → [Modular monolith vs microservices](/blog/modular-monolith-vs-microservices-dotnet).

**Repository pattern — when it earns its keep** → [Repository pattern in .NET](/blog/repository-pattern-dotnet).

**MediatR / CQRS-lite** → [MediatR and CQRS](/blog/mediatr-cqrs-aspnet-core).

**Minimal APIs vs controllers** → [ASP.NET Core Minimal APIs](/blog/aspnet-core-minimal-apis).

**Architecture topic map** → [architecture hub](/learning/architecture).

## Details

Clean Architecture is one of those ideas that sounds obvious in a conference talk and feels heavy on a Tuesday when a product owner asks for a small pricing tweak. I have been building .NET backends for healthcare portals, SaaS dashboards, and eCommerce platforms long enough to know both sides of that story.

This is the mindset I applied when structuring [Ecom_NET10](https://github.com/ShahidBaloch/Ecom_NET10), my Clean Architecture eCommerce reference on .NET 10.

### What Clean Architecture is actually protecting

The question I ask: **where do business rules live when Angular screens get redesigned and EF Core queries get tuned?**

If your cart discount logic sits inside a controller because that was fastest on day one, you will eventually copy it into a background job, then into an admin import script, then into a mobile API — and each copy will drift.

That inward dependency rule is the whole game:

- **Core** knows nothing about HTTP, SQL, or Angular.
- **Infrastructure** implements Core interfaces with EF Core, email providers, blob storage, and identity adapters.
- **API** translates HTTP into application commands and maps results back out.

### A pragmatic three-project layout

On Ecom_NET10 I use a layout that teams can navigate without a map taped to the monitor:

| Layer | Responsibility | Example from eCommerce |
|-------|----------------|------------------------|
| **API** | HTTP, auth, validation, mapping | `POST /api/orders`, JWT policies, request DTOs |
| **Core** | Entities, domain rules, interfaces | Cart totals, stock reservation rules, `IOrderRepository` |
| **Infrastructure** | EF Core, external services | `OrderRepository`, SQL indexes, email sender |

Your cart rules belong in Core. Your `Include()` graph tuning belongs in Infrastructure. Controllers stay thin enough that a new teammate can read one endpoint and know where the real work happens.

I do not start with seven projects and an abstract "SharedKernel" unless the domain is already large. Three projects — Api, Core, Infrastructure — cover most SaaS and storefront backends I touch.

### Patterns that pay rent on real products

#### Repository + Specification

Repositories hide persistence mechanics. Specifications compose query logic — filters, paging, sorting, includes — in one testable place.

```csharp
public class ActiveProductsSpec : Specification<Product>
{
    public ActiveProductsSpec(string? category, int page, int size)
    {
        Query.Where(p => p.IsActive)
             .Include(p => p.Category)
             .OrderBy(p => p.Name)
             .Skip(page * size)
             .Take(size);

        if (!string.IsNullOrWhiteSpace(category))
            Query.Where(p => p.Category!.Slug == category);
    }
}
```

On catalog screens this stops the "query soup in every handler" problem.

#### MediatR / CQRS-lite

I reach for MediatR when command and query paths diverge in behavior, not just in SQL. Placing an order validates stock, applies promotions, and writes audit rows. Listing orders projects a read model with different fields and no tracking.

I do not MediatR-wrap every CRUD endpoint on week one. If a resource is truly symmetric read/write, a focused service class is fine.

#### Result objects instead of exception-driven flow

"Coupon expired" is not exceptional in eCommerce. It is an expected outcome:

```csharp
public record OrderResult(bool Success, Guid? OrderId, string? ErrorCode);

public async Task<OrderResult> PlaceOrderAsync(PlaceOrderCommand cmd, CancellationToken ct)
{
    if (!await _promotions.IsValidAsync(cmd.CouponCode, ct))
        return new OrderResult(false, null, "coupon_expired");

    var orderId = await _orders.CreateAsync(cmd, ct);
    return new OrderResult(true, orderId, null);
}
```

Controllers map `ErrorCode` to consistent HTTP responses. Angular clients show friendly messages without parsing stack traces.

### What I deliberately skip early

On greenfield work I postpone:

- **Microservices on day one** — CarBazaar splits services because auction, identity, and search have different scaling and release cadences. A ten-user B2B SaaS admin portal does not need that split yet.
- **Perfect ubiquitous language documents** — I capture glossary terms as we discover real confusion.
- **Abstractions with one implementation and no test benefit** — `IEmailSender` helps when you test without SMTP. `IProductService` that only wraps one class often does not.

The test I use: *if I delete this interface, do tests get harder or just file count drop?*

### How this showed up in my portfolio work

**Ecom_NET10** is my reference for "Clean Architecture without cosplay." Catalog, cart, and order flows share Core rules while Infrastructure owns EF Core mappings and JWT-backed API policies.

**CarBazaar** pushed boundaries outward into microservices because identity and auction workloads do not belong in one deployable unit. The same inward dependency idea applies inside each service's Core layer.

**Healthcare SaaS delivery** taught me where rigor matters most: provider enrollment rules, fee schedule calculations, and audit-sensitive mutations stay in application services with explicit authorization checks.

Different shapes, same principle: **domain decisions survive UI and infrastructure churn.**

### Kickoff checklist

- [ ] Can you name three business rules that must stay consistent across web, admin, and future API consumers?
- [ ] Which integrations change often (payments, email, storage) and should sit behind interfaces?
- [ ] Do reads and writes already diverge in validation or side effects?
- [ ] Is the team size and release cadence big enough to justify MediatR or service splits?
- [ ] What is the thinnest vertical slice we can ship to prove the boundaries?

If the answers are thin, we keep the structure simple and tighten it after the first production lesson — not before the first demo.

### The client value in plain terms

Clean Architecture done pragmatically buys you three things stakeholders actually feel:

1. **Faster feature work after month two** — because new endpoints plug into known patterns
2. **Safer refactors** — because SQL tuning and Angular redesigns do not threaten checkout or compliance rules
3. **Easier onboarding** — because "where does X live?" has a consistent answer

The opposite is also true: over-engineered Clean Architecture buys you slower demos and frustrated teams.

## If an interviewer asks

**"How do you apply Clean Architecture in ASP.NET Core without over-engineering?"**

**Strong answer:** Keep domain rules in a Core project that knows nothing about HTTP or EF. Infrastructure implements interfaces; API translates HTTP to commands. Start with three projects — Api, Core, Infrastructure — not seven. Onion Architecture is the same inward-dependency rule with a different diagram. Add MediatR or repositories only when command/query paths diverge or query composition gets messy. Skip abstractions with one implementation and no test benefit. Clean Architecture is about changeability, not folder count — a clinic admin with two screens can wait; an eCommerce catalog earns the split sooner.

**Weak answer:** "Create a Domain, Application, Infrastructure, and API project on day one."

## Related reading

- [Modular monolith vs microservices in .NET](/blog/modular-monolith-vs-microservices-dotnet)
- [Repository pattern in .NET](/blog/repository-pattern-dotnet)
- [MediatR and CQRS-lite](/blog/mediatr-cqrs-aspnet-core)
- [Architecture hub](/learning/architecture)

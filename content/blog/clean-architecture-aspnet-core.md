---
title: "Clean Architecture in ASP.NET Core Without Over-Engineering"
description: "A senior engineer's guide to pragmatic Clean Architecture in ASP.NET Core — useful boundaries for eCommerce and SaaS without ceremony that slows delivery."
date: "2026-05-28"
category: "architecture"
tags: ["Clean Architecture", ".NET", "EF Core", "Architecture"]
---

Clean Architecture is one of those ideas that sounds obvious in a conference talk and feels heavy on a Tuesday when a product owner asks for a small pricing tweak. I have been building .NET backends for healthcare portals, SaaS dashboards, and eCommerce platforms long enough to know both sides of that story. The goal is not to win an architecture trophy. The goal is to keep domain rules stable while everything else — UI frameworks, ORM details, hosting choices — changes around them.

This is the mindset I applied when structuring [Ecom_NET10](https://github.com/ShahidBaloch/Ecom_NET10), my Clean Architecture eCommerce reference on .NET 10. It is also how I decide, on client work, whether a boundary earns its keep or should wait until the product proves it needs one.

## What Clean Architecture is actually protecting

Uncle Bob's diagrams can look intimidating. In practice, I think about one question: **where do business rules live when Angular screens get redesigned and EF Core queries get tuned?**

If your cart discount logic sits inside a controller because that was fastest on day one, you will eventually copy it into a background job, then into an admin import script, then into a mobile API — and each copy will drift. Clean Architecture pushes those rules inward, behind interfaces the outer layers depend on.

That inward dependency rule is the whole game:

- **Core** knows nothing about HTTP, SQL, or Angular.
- **Infrastructure** implements Core interfaces with EF Core, email providers, blob storage, and identity adapters.
- **API** translates HTTP into application commands and maps results back out.

When that direction is respected, swapping SQL Server tuning strategies or adding a Redis cache does not require reopening checkout policy. That is the changeability clients pay for, even if they never use the phrase "Clean Architecture."

## A pragmatic three-project layout

On Ecom_NET10 I use a layout that teams can navigate without a map taped to the monitor:

| Layer | Responsibility | Example from eCommerce |
|-------|----------------|------------------------|
| **API** | HTTP, auth, validation, mapping | `POST /api/orders`, JWT policies, request DTOs |
| **Core** | Entities, domain rules, interfaces | Cart totals, stock reservation rules, `IOrderRepository` |
| **Infrastructure** | EF Core, external services | `OrderRepository`, SQL indexes, email sender |

Your cart rules belong in Core. Your `Include()` graph tuning belongs in Infrastructure. Controllers stay thin enough that a new teammate can read one endpoint and know where the real work happens.

I do not start with seven projects and an abstract "SharedKernel" unless the domain is already large. Three projects — Api, Core, Infrastructure — cover most SaaS and storefront backends I touch. CarBazaar went further because marketplace identity, search, and bidding genuinely needed separate deployable services. That is a scale decision, not a moral one.

## Patterns that pay rent on real products

### Repository + Specification

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

On catalog screens this stops the "query soup in every handler" problem. On healthcare admin lists, the same pattern keeps provider search readable when product adds three new filters mid-sprint.

### MediatR / CQRS-lite

I reach for MediatR when command and query paths diverge in behavior, not just in SQL. Placing an order validates stock, applies promotions, and writes audit rows. Listing orders projects a read model with different fields and no tracking. Separate handlers make that explicit.

I do not MediatR-wrap every CRUD endpoint on week one. If a resource is truly symmetric read/write, a focused service class is fine. Ceremony without payoff is how Clean Architecture gets a bad reputation.

### Result objects instead of exception-driven flow

"Coupon expired" is not exceptional in eCommerce. It is an expected outcome. I return typed results from application services:

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

## What I deliberately skip early

Clean Architecture is not a license to front-load every pattern in the book. On greenfield work I postpone:

- **Microservices on day one** — CarBazaar splits services because auction, identity, and search have different scaling and release cadences. A ten-user B2B SaaS admin portal does not need that split yet.
- **Perfect ubiquitous language documents** — I capture glossary terms as we discover real confusion, not before the first user story ships.
- **Abstractions with one implementation and no test benefit** — `IEmailSender` helps when you test without SMTP. `IProductService` that only wraps one class often does not.

The test I use: *if I delete this interface, do tests get harder or just file count drop?* If it is only file count, I inline until a second implementation or a testing seam actually appears.

## How this showed up in my portfolio work

**Ecom_NET10** is my reference for "Clean Architecture without cosplay." Catalog, cart, and order flows share Core rules while Infrastructure owns EF Core mappings and JWT-backed API policies. The point is not folder purity — it is that I can extend checkout or RBAC without spelunking through controllers.

**CarBazaar** pushed boundaries outward into microservices because identity and auction workloads do not belong in one deployable unit. IdentityServer, OAuth, and JWT show up there — but the same inward dependency idea applies inside each service's Core layer.

**Healthcare SaaS delivery** taught me where rigor matters most: provider enrollment rules, fee schedule calculations, and audit-sensitive mutations stay in application services with explicit authorization checks — not buried in Razor pages or one-off SQL scripts.

Different shapes, same principle: **domain decisions survive UI and infrastructure churn.**

## Kickoff checklist I use with clients

Before we commit to layers and patterns, I walk through this with the stakeholder:

- [ ] Can you name three business rules that must stay consistent across web, admin, and future API consumers?
- [ ] Which integrations change often (payments, email, storage) and should sit behind interfaces?
- [ ] Do reads and writes already diverge in validation or side effects?
- [ ] Is the team size and release cadence big enough to justify MediatR or service splits?
- [ ] What is the thinnest vertical slice we can ship to prove the boundaries?

If the answers are thin, we keep the structure simple and tighten it after the first production lesson — not before the first demo.

## The client value in plain terms

Clean Architecture done pragmatically buys you three things stakeholders actually feel:

1. **Faster feature work after month two** — because new endpoints plug into known patterns instead of inventing persistence access each time.
2. **Safer refactors** — because SQL tuning and Angular redesigns do not threaten checkout or compliance rules.
3. **Easier onboarding** — because "where does X live?" has a consistent answer.

The opposite is also true: over-engineered Clean Architecture buys you slower demos and frustrated teams. The skill is telling the difference early.

If you are standing up or untangling an ASP.NET Core backend — eCommerce, SaaS, or regulated workflows — and want boundaries that help rather than hinder, [get in touch](/contact). I am happy to review what you have and propose a pragmatic path forward.

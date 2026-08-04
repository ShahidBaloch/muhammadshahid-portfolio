---
title: "Repository Pattern in .NET — Useful vs Overkill"
description: "When the repository pattern earns its place in .NET with EF Core, when it becomes ceremony, and how I structure data access on healthcare SaaS and eCommerce products without lying about LINQ."
date: "2026-07-05"
category: "design-patterns"
tags: ["Repository Pattern", "EF Core", ".NET", "Architecture", "Data Access"]
---

Early in my career, every data access class had an interface named `IRepository<T>`. Generic methods for `GetAll`, `GetById`, `Add`, `Update`, `Delete`. It felt clean until I watched a junior developer fight `IQueryable` leakage, duplicate EF Core includes across three repositories, and write `GetByIdWithDetails` variants until the interface was a mini ORM.

EF Core **is** already a repository and unit of work. `DbContext` tracks changes; `DbSet<T>` is a collection gateway. The question is not "repository yes or no." It is **what boundary you are drawing** and **whether that boundary reduces coordination cost** for your team.

This post is how I use repositories on real products — healthcare claim workflows, marketplace catalog and orders, multi-tenant SaaS — and where I leave EF Core exposed in application services.

## What people mean by "repository"

Usually one of three things:

1. **Generic CRUD wrapper** — `IRepository<T>` with LINQ exposed or hidden
2. **Feature-specific repository** — `IOrderRepository` with `GetOrderDetailForInvoiceAsync`
3. **Persistence port** — an interface that hides EF entirely behind domain-friendly methods

Only the second and third consistently help mature codebases. The generic wrapper often adds files without adding clarity.

## When repositories help

### Complex queries reused across handlers

On a healthcare SaaS project, "active cases for clinician dashboard" involved tenant filter, assignment rules, status exclusions, and a projection with six related entities. Three MediatR query handlers needed the same shape with small variations.

A dedicated `ICaseReadRepository` with methods like `GetBoardItemsAsync(ClinicianBoardFilter filter)` centralized the EF Core query, indexes, and `AsNoTracking` behavior. Handlers stayed thin; performance tuning had one home.

That is a repository worth having: **named read operations** that encode business language, not `GetAll`.

### Testing application logic without SQL

When a service must orchestrate "reserve inventory, create order, emit event," I mock `IOrderRepository` and `IInventoryRepository` at meaningful method boundaries — not mock `DbSet<Order>`.

Integration tests still hit SQL Server (or Testcontainers). Unit tests for orchestration stay fast when repositories represent **use-case-shaped operations**.

### Swapping persistence (rare but real)

I have replaced blob metadata storage and read models backed by Dapper while keeping handler signatures stable. The port was `IReportExportStore`, not `IRepository<ExportJob>`. Abstraction followed a proven need, not a template.

### Multi-tenant guardrails

Repositories can enforce `TenantId` filters in one place so individual queries do not forget `.Where(x => x.TenantId == _tenant.Id)`. In marketplace seller tools, that prevented a class of cross-tenant data leaks during rapid feature work — provided the repository methods were the encouraged path for reads.

## When repositories hurt

### Generic `IRepository<T>` on every entity

You end up with:

```csharp
public interface IRepository<T> where T : class
{
    Task<T?> GetByIdAsync(Guid id, CancellationToken ct);
    Task AddAsync(T entity, CancellationToken ct);
    // ... Update, Delete, Find, Count
}
```

Handlers either call `_repo.GetById` and still need ten includes, or they reach for specifications, or they bypass the repository with a raw `DbContext` injection "just this once." The abstraction leaked the moment queries became interesting.

If every method is CRUD, inject `DbContext` (or a thin `IApplicationDbContext` interface) into handlers and use EF Core directly. Be honest about LINQ.

### Hiding `IQueryable` poorly

Returning `IQueryable<T>` from a repository pushes composition upstack and makes unit tests meaningless. Hiding it completely but offering twenty specialized methods recreates the database in C#. The balance is **methods that return concrete DTOs or domain results** for each use case worth naming.

### Unit of work duplication

EF Core's `SaveChangesAsync` already batches transactions. Wrapping it in `IUnitOfWork` that merely forwards to the same context is boilerplate unless you coordinate multiple contexts or non-EF resources in one transaction.

I use `IUnitOfWork` when a single application operation touches EF and an outbox table, or multiple bounded contexts. I skip it when one `DbContext` suffices.

## How I structure data access today

For a typical mid-size ASP.NET Core API:

```text
Application/
  Orders/
    Queries/
      GetOrderDetailHandler.cs   // may call IOrderReadRepository
    Commands/
      PlaceOrderHandler.cs       // uses IOrderRepository + domain services
Infrastructure/
  Persistence/
    ApplicationDbContext.cs
    Repositories/
      OrderReadRepository.cs
      OrderWriteRepository.cs
```

Sometimes read and write repositories split because read models use projections and writes load aggregates. That is CQRS-lite, not mandatory repository religion.

Example read repository method:

```csharp
public async Task<OrderDetailDto?> GetDetailAsync(Guid orderId, Guid tenantId, CancellationToken ct)
{
    return await _db.Orders
        .AsNoTracking()
        .Where(o => o.Id == orderId && o.TenantId == tenantId)
        .Select(o => new OrderDetailDto(
            o.Id,
            o.Status,
            o.Lines.Select(l => new OrderLineDto(l.Sku, l.Qty)).ToList()))
        .FirstOrDefaultAsync(ct);
}
```

The handler does not know about `Include`. The repository name documents intent.

## EF Core features I do not hide

**Migrations, configurations, and indexes** live in Infrastructure. **Global filters** for soft delete and tenant id sit on the `DbContext`. **Transactions** wrap commands at the handler or behavior layer.

I do not wrap every `DbSet` call in a repository file "for consistency." Consistency that slows delivery without reducing bugs is not architecture — it is habit.

## Specification pattern as a middle ground

When queries compose dynamically (marketplace catalog filters: category, price range, seller rating, in-stock only), pure one-method-per-query repositories explode. I use **specifications** or query objects:

```csharp
public record ProductSearchSpec(ProductFilter Filter, Guid TenantId);

public static class ProductQueries
{
    public static IQueryable<ProductListItemDto> Apply(
        this IQueryable<Product> query,
        ProductSearchSpec spec) => /* filtered projection */;
}
```

Invoked from a handler with `_db.Products.Apply(spec)`. Still testable, still one LINQ pipeline, without pretend generic repositories.

## Decision guide I use in code reviews

| Signal | Approach |
| --- | --- |
| Simple CRUD, few queries | `DbContext` in handlers |
| Repeated complex reads | Feature read repository |
| Write aggregate with invariants | Repository or domain service + context |
| Dynamic filter grids | Specification / query object |
| Generic `IRepository<T>` everywhere | Stop and justify each interface |

## Real product examples

**Healthcare intake:** Write side loads `PatientCase` aggregate roots with explicit methods; read side uses `ICaseReadRepository` projections for boards. PHI access logging hooks live on the read repository methods that power export and bulk views.

**eCommerce checkout:** `PlaceOrderHandler` coordinates inventory reservation and payment initiation. Repositories expose `ReserveStockAsync` and `CreateOrderAsync` — verbs, not entities. Refund flows reuse the same order repository with different authorization.

**Marketplace seller portal:** Seller-scoped repositories always take `SellerId` from the current user context, not from request body parameters. That convention blocked an entire category of IDOR mistakes.

## Bottom line

The repository pattern is useful when it **names meaningful persistence operations**, **centralizes complex EF Core**, and **supports testing at real boundaries**. It is overkill when it **duplicates DbSet**, **pretends LINQ is hidden**, or **multiplies files without isolating change**.

On .NET products with EF Core, I default to direct context access for simple paths and introduce feature-specific repositories when query complexity, reuse, or tenant safety demands a single home. Generic repositories for every entity are a smell I push back on in every review.

If you want help untangling data access in an ASP.NET Core codebase — without a rewrite for pattern's sake — [reach out](/contact).

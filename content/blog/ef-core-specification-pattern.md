---
title: "EF Core Specification Pattern for Catalog Queries"
description: "EF Core specification pattern for catalog queries: reusable filters, paging, and counts that stay aligned across API lists and export jobs."
date: "2026-02-05"
category: "design-patterns"
tags: ["EF Core", "ASP.NET Core", "Clean Architecture", "eCommerce"]
related:
  - repository-pattern-dotnet
  - clean-architecture-aspnet-core
  - ef-core-sql-performance
faq:
  - q: "When should I use the Specification pattern with EF Core?"
    a: "When catalog filters, sort, and paging must stay identical for the Angular grid and an export job. A 200-line controller query is the smell."
  - q: "Does a specification replace paging?"
    a: "No. It names the filter. Skip/Take and a total count still live at the query edge. N+1 and cartesian are other URLs."
  - q: "Is this the same as a generic IRepository?"
    a: "No. Specifications compose queries. Generic GetAll/GetById is the repository article — and often overkill on DbContext."
---

**The specification pattern** with EF Core names a query intention — which rows match, what to include, how to sort, how to page — in a reusable class instead of a 200-line LINQ block in the controller. The API list, the total count, and the export job share the same spec so filters cannot drift.

```text
Without spec                          With VendorCatalogProductsSpec

  Controller: 200 lines LINQ          API list  → same spec → same WHERE
  Export job: copy-paste,             Count     → same spec → footer matches
    forgot in-stock filter            Export    → same spec, paging off
  Page 3 total ≠ footer count         QA stops filing mismatches
```

**New to this** → stay here. **Merging a PR** → [catalog spec](#a-catalog-spec-that-matches-real-angular-filters). **On-call / interview** → [when I do not use specifications](#when-i-do-not-use-specifications) · [if an interviewer asks](#if-an-interviewer-asks).

**Terms used here:** **`ISpecification<T>`** = interface with criteria, includes, ordering, and paging expressions. **Evaluator** = infrastructure class that applies a spec to `IQueryable<T>`. **Criteria composition** = combining multiple `Where` predicates with `Expression.AndAlso`.

The first version of a product catalog API is deceptively simple. `GET /products?category=shoes&minPrice=50` maps to a LINQ query in the controller. Ship it, move on.

Six months later on a marketplace or eCommerce backend, the same endpoint has twelve optional filters, three sort modes, paging, a total count for the Angular grid, and an export job that must return the same rows the UI shows. The controller is 200 lines. Two developers added slightly different price filters. QA reports that page 3 totals do not match the footer count.

That is when I introduce the Specification pattern with EF Core. Not as DDD theater. As a way to name query intentions and reuse them across API lists, background jobs, and tests.

## What problem specifications actually solve

A specification answers: **which rows match this screen's rules, what do we include, how do we sort, and how do we page?**

The repository stops growing methods like `GetProductsByCategoryAndPriceForVendorPage2`. Instead, the application layer builds a spec object and passes it to a generic `ListAsync` or `CountAsync`.

Core interface I use:

```csharp
public interface ISpecification<T>
{
    Expression<Func<T, bool>>? Criteria { get; }
    List<Expression<Func<T, object>>> Includes { get; }
    Expression<Func<T, object>>? OrderBy { get; }
    Expression<Func<T, object>>? OrderByDescending { get; }
    int Skip { get; }
    int Take { get; }
    bool IsPagingEnabled { get; }
}
```

Infrastructure owns an evaluator that applies criteria, includes, ordering, and paging to `IQueryable<T>`. The API maps HTTP query strings into constructor arguments — never into raw LINQ in the controller.

## A catalog spec that matches real Angular filters

Imagine a vendor catalog grid: category, price range, in-stock only, text search, sort by price or name, page size capped at 50.

```csharp
public sealed class VendorCatalogProductsSpec : BaseSpecification<Product>
{
    public VendorCatalogProductsSpec(
        Guid vendorId,
        CatalogFilter filter)
    {
        AddCriteria(p => p.VendorId == vendorId);
        AddCriteria(p => !p.IsDeleted);

        if (filter.CategoryId is Guid categoryId)
            AddCriteria(p => p.CategoryId == categoryId);

        if (filter.MinPrice is decimal min)
            AddCriteria(p => p.UnitPrice >= min);

        if (filter.MaxPrice is decimal max)
            AddCriteria(p => p.UnitPrice <= max);

        if (filter.InStockOnly)
            AddCriteria(p => p.StockQuantity > 0);

        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var term = filter.Search.Trim();
            AddCriteria(p =>
                p.Name.Contains(term) ||
                p.Sku.Contains(term));
        }

        AddInclude(p => p.Category);

        switch (filter.Sort)
        {
            case CatalogSort.PriceAsc:
                ApplyOrderBy(p => p.UnitPrice);
                break;
            case CatalogSort.PriceDesc:
                ApplyOrderByDescending(p => p.UnitPrice);
                break;
            default:
                ApplyOrderBy(p => p.Name);
                break;
        }

        var page = Math.Max(filter.Page, 1);
        var size = Math.Clamp(filter.PageSize, 1, 50);
        ApplyPaging((page - 1) * size, size);
    }
}
```

The Angular team sends query params. The API validates them into a `CatalogFilter` record. The spec encodes business rules once.

## Repository + specification in practice

```csharp
public async Task<IReadOnlyList<Product>> ListAsync(
    ISpecification<Product> spec,
    CancellationToken ct)
{
    var query = SpecificationEvaluator.GetQuery(_db.Products.AsNoTracking(), spec);
    return await query.ToListAsync(ct);
}

public async Task<int> CountAsync(
    ISpecification<Product> spec,
    CancellationToken ct)
{
    var query = SpecificationEvaluator.GetQuery(_db.Products.AsNoTracking(), spec);
    return await query.CountAsync(ct);
}
```

The list endpoint and count endpoint share the same spec instance. That alignment matters: nothing erodes trust in an admin UI faster than "Showing 1–25 of 412" when the query behind the count omitted the in-stock filter.

For exports, I reuse the spec without paging — either a separate `ExportVendorCatalogProductsSpec` that copies criteria or a flag on the base class to disable paging for the same rules.

## Mapping from HTTP without leaking EF into Angular concerns

I keep a thin translation at the application boundary:

```csharp
public VendorCatalogProductsSpec ToSpec(Guid vendorId, ProductListQuery query)
{
    return new VendorCatalogProductsSpec(vendorId, new CatalogFilter
    {
        CategoryId = query.CategoryId,
        MinPrice = query.MinPrice,
        MaxPrice = query.MaxPrice,
        InStockOnly = query.InStockOnly,
        Search = query.Search,
        Sort = ParseSort(query.Sort), // allowlist, not raw strings
        Page = query.Page ?? 1,
        PageSize = query.PageSize ?? 25
    });
}
```

This is where I clamp page sizes, reject unknown sort columns, and normalize empty search strings. Letting Angular pass arbitrary `orderBy=DiscountPercent` into dynamic expressions has caused SQL translation surprises more than once.

## EF Core specifics I still watch

Specifications do not absolve you from understanding the database:

- **Includes cost money.** Catalog grids that `Include` images, variants, and reviews for every row need split queries or projections — not blind `Include` chains.
- **Criteria must translate.** Custom methods in expressions fail at runtime. Test against SQL Server, not only in-memory providers.
- **Multiple criteria need composition.** My base class combines predicates with `Expression.AndAlso` rather than chaining `.Where` in the evaluator — both work if you are consistent.
- **Projections for read models.** If the grid shows five columns, consider `Select` to a DTO in the spec or a dedicated read query. Loading full aggregates for list screens is how catalog APIs get slow quietly.

On Azure-hosted APIs backed by EF Core, I capture the generated SQL for the worst-case filter combination before launch. Specification reuse makes it easier to regression-test those paths when a new filter arrives.

## When I do not use specifications

I skip the pattern deliberately in these cases:

**Tiny CRUD APIs.** Three endpoints, no shared filters, no exports — a generic repository plus specs is overhead without reuse.

**One-off analytics and reporting.** Complex joins, window functions, and reporting shapes often belong in raw SQL, a view, or a dedicated read model — not a specification hierarchy nobody will maintain.

**Teams that treat specs as a NuGet package religion.** Copying Ardalis.Specification without understanding expression trees produces magic strings and debugging pain. If the team will not own query types, keep explicit LINQ in application services where they can read it.

**Hot paths already solved with compiled queries.** A single high-traffic lookup by SKU may be better as a compiled query or cache-backed read — wrapping it in a spec adds indirection without benefit.

**Prototypes meant to be thrown away.** Speed matters. Inline LINQ in a spike is fine. Introduce specs when duplicate filter logic appears — usually sprint three or four on catalog work, not day one.

The test I use: *Will this query shape appear in more than one place within two months?* If yes, specification. If no, YAGNI.

## How this fits Clean Architecture without ceremony

In projects I deliver:

- **Domain/Core** — entity rules and specification classes named after use cases (`OpenOrdersForTenantSpec`, not `OrderSpec2`)
- **Application** — maps DTOs to specs, orchestrates handlers
- **Infrastructure** — EF Core DbContext, evaluator, repository implementations
- **API** — HTTP only; no LINQ

Healthcare list screens and marketplace catalog grids benefit from the same structure. The vocabulary changes; the problem — combinatorial filters with paging — does not.

## Freelance delivery habits that stick

Clients do not ask for specifications. They ask for grids that load fast and filters that do not break each other. What I leave behind:

- Named spec classes tied to screens in the wiki or README
- Integration tests for the heaviest filter combination
- A note on which specs power exports vs UI lists

That inventory prevents two developers from inventing parallel price filters during the same sprint — the exact drift that made me adopt this pattern on eCommerce backends in the first place.

## Closing

The EF Core Specification pattern earns its keep on catalog-style queries where filters, paging, counts, and exports must stay aligned. Pair it with a thin repository, an evaluator in Infrastructure, and strict HTTP-to-spec mapping at the edge. Skip it when the API is small, the query is a one-off report, or the team will not maintain named query types.

## If an interviewer asks

*When would you use the specification pattern with EF Core — and when would you skip it?*

**30-second answer:** Use it when the same filter shape appears in the API list, count, and export — and a 200-line controller LINQ block is the smell. Skip it for three-endpoint CRUD, one-off reports, or teams that will not maintain named query types.

**Strong answer:** I'd name specs after screens (`VendorCatalogProductsSpec`), share one instance between `ListAsync` and `CountAsync` so the footer total matches the grid, and map HTTP query strings to a validated `CatalogFilter` at the boundary — never raw `orderBy` from Angular. Specs do not absolve you from EF performance: I'd still project to DTOs on list screens and watch `Include` chains for cartesian explosion. The YAGNI test: will this query shape appear in more than one place within two months? If yes, specification. If no, inline LINQ in the application service.

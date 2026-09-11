---
title: "EF Core and SQL Server"
---

## Introduction

**Entity Framework Core** is the ORM most ASP.NET Core teams use for SQL Server. Search intent here is rarely “what is DbContext?” — it is **why my list endpoint issues 200 SQL commands**, **why two Includes made one giant JOIN**, or **why tenant B saw tenant A’s rows**. This page explains the mental model before you open a symptom-specific article.

## What EF Core does on the request path

EF Core translates LINQ into SQL, tracks entities in a **`DbContext`** (per scope), and materializes results into .NET objects. On a typical API:

1. Controller receives HTTP request.
2. Scoped `DbContext` is resolved from DI.
3. Query runs (`ToListAsync`, `FirstOrDefaultAsync`, etc.).
4. `SaveChangesAsync` persists tracked changes.

**Performance and correctness** live in *query shape* — projections, Includes, tracking, filters — not in “using EF instead of raw SQL.”

## Real-world analogy

EF Core is a **translator between your C# object graph and SQL tables**:

- **N+1** — asking the warehouse “where is box 1?” then “where is box 2?” … 10,000 times instead of one pick list.
- **Cartesian explosion** — one JOIN that duplicates every order line for every order note in RAM before you filter in memory.
- **Global query filter** — a automatic “only this tenant’s rows” clause on every query — powerful until a background job forgets to opt out.

## N+1 vs fat JOIN vs split query

| Symptom | Likely cause | Direction |
|---|---|---|
| 1 SQL per grid row | N+1 lazy load or loop + query | Projection or single Include |
| One huge result set, correct JSON | Cartesian product from multiple collection Includes | `AsSplitQuery` or reshape API |
| Same patient twice in one DTO list | Identity resolution + Include | Project to DTO or `AsNoTracking` + explicit shape |
| Fast in dev, slow for one tenant | Parameter sniffing / bad plan | Sniffing article, indexes, `OPTION (RECOMPILE)` sparingly |

## Change tracker vs read-only queries

**Tracking** — EF remembers entities so `SaveChanges` knows what changed. Good for updates; expensive for read-only lists.

**`AsNoTracking()`** — read without tracker overhead. Default for list endpoints. Still not enough if you `Include` ten related tables into 50k entities — see [when to use AsNoTracking](/blog/ef-core-asnotracking-vs-identity-resolution).

**Rule:** List screens → project to DTO in SQL. Detail/edit screens → tracked entity with explicit Includes.

## Multi-tenancy and soft delete

**Global query filters** (`HasQueryFilter`) apply a predicate to every query — e.g. `TenantId == current` or `!IsDeleted`. 

**Cross-question:** “Why did the export job include deleted rows?” → job used `IgnoreQueryFilters()` or raw SQL without the filter.

## Interview cross-questions (EF Core)

1. **ExecuteUpdate vs SaveChanges?** — ExecuteUpdate is one SQL UPDATE without loading entities; interceptors and audit may not run.
2. **Optimistic concurrency?** — `RowVersion` / concurrency token; client must send token on PUT.
3. **Specification pattern — ceremony or value?** — Value when the same filter/Include is reused; ceremony when it wraps one query once.
4. **Entity relationships (1-1 / 1-n / n-n)?** — Owned type vs 1-1; skip a join entity until the link has payload. Mapping how-to: [EF Core relationships](/blog/ef-core-relationships). Interview narration: [EF Core interview questions](/blog/ef-core-interview-questions).

Full scenarios: [EF Core interview questions](/blog/ef-core-interview-questions).

## Deep-dive articles (by symptom)

| Symptom | Article |
|---|---|
| General SQL checklist | [EF Core SQL performance](/blog/ef-core-sql-performance) |
| Map 1-1 / 1-n / n-n, owned vs join | [EF Core relationships](/blog/ef-core-relationships) |
| N+1 vs Include vs split | [N+1 vs AsSplitQuery](/blog/ef-core-nplus1-include-vs-assplitquery) |
| Two Includes, huge JOIN | [Cartesian explosion](/blog/ef-core-cartesian-explosion-multiple-include) |
| Duplicate entities in memory | [AsNoTracking vs identity](/blog/ef-core-asnotracking-vs-identity-resolution) |
| One tenant slow | [Parameter sniffing](/blog/ef-core-sql-server-parameter-sniffing) |
| Bulk flag updates | [ExecuteUpdate](/blog/ef-core-bulk-update-executeupdate) |
| Tenant leak / soft delete | [Global query filters](/blog/ef-core-global-query-filters-soft-delete) |

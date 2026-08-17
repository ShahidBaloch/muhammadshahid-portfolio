---
title: "EF Core and SQL Server Performance — Queries That Hurt in Production"
description: "EF Core performance lessons from healthcare reporting and SaaS dashboards — N+1 queries, projections, indexes, AsNoTracking, and the SQL Server pain that only appears under real data volume."
date: "2026-05-10"
category: "ef-core"
tags: ["EF Core", "SQL Server", "Performance", "ASP.NET Core"]
---

The Angular dashboard looked fine in demo data. Then a clinic turned on twelve months of appointment history, a marketplace seller exported four thousand orders, and the API started timing out at thirty seconds. Nothing changed in the controller signature. EF Core was doing exactly what we asked — we just asked for too much, too many times, with tracking enabled on a read-only report.

This post covers the EF Core and SQL Server performance issues I see most often in healthcare reporting, SaaS analytics endpoints, and eCommerce list screens — and the fixes that actually stick without rewriting the stack.

## Measure before you optimize

I start with three signals:

1. **Application Insights** dependency duration on SQL
2. **EF Core command logging** in Development (never sensitive data in production)
3. **SQL Server Query Store** or actual execution plans on the slow statement

```csharp
#if DEBUG
options.LogTo(Console.WriteLine, new[] { RelationalEventId.CommandExecuted });
#endif
```

Copy the generated SQL, run it in SSMS with "Include Actual Execution Plan," and note logical reads. Optimization without a baseline is guesswork — and guesswork ships hidden N+1 queries to production.

## N+1: the silent budget killer

N+1 appears when you load a list, then touch a navigation property in a loop:

```csharp
// Generates 1 + N queries
var appointments = await _db.Appointments
    .Where(a => a.ClinicId == clinicId)
    .Take(50)
    .ToListAsync(ct);

foreach (var a in appointments)
{
    var name = a.Patient.Name; // lazy load or implicit include per row
}
```

Healthcare scheduling screens and order list APIs do this constantly when handlers return entities instead of DTOs.

Fixes, in order of preference:

**Project in one query** — best for read APIs feeding Angular grids:

```csharp
var rows = await _db.Appointments
    .AsNoTracking()
    .Where(a => a.ClinicId == clinicId)
    .OrderByDescending(a => a.StartTime)
    .Select(a => new AppointmentRowDto(
        a.Id,
        a.Patient.FirstName + " " + a.Patient.LastName,
        a.Status,
        a.StartTime))
    .Take(50)
    .ToListAsync(ct);
```

**Explicit `Include`** when you genuinely need full graphs — rare for list endpoints:

```csharp
await _db.Appointments
    .Include(a => a.Patient)
    .AsNoTracking()
    .Where(a => a.ClinicId == clinicId)
    .ToListAsync(ct);
```

N+1 vs a single `Include` vs `AsSplitQuery` is compared in [EF Core N+1 vs Include vs AsSplitQuery](/blog/ef-core-nplus1-include-vs-assplitquery). Two collection Includes multiplying JOIN rows is [cartesian explosion](/blog/ef-core-cartesian-explosion-multiple-include).

**Split queries** for cartesian explosion when multiple collection includes multiply rows:

```csharp
await _db.Orders
    .AsSplitQuery()
    .Include(o => o.Lines)
    .Include(o => o.Payments)
    .FirstOrDefaultAsync(o => o.Id == id, ct);
```

Enable `MultipleCollectionIncludeWarning` in Development. EF logs when a query pattern will hurt.

## Projections: send the screen what it needs

The worst reports I have debugged selected entire tables into memory, then filtered in C#:

```csharp
// Loads every claim for the clinic into RAM
var all = await _db.Claims.Where(c => c.ClinicId == id).ToListAsync(ct);
return all.Where(c => c.SubmittedAt >= from).GroupBy(...);
```

Angular needs twenty columns; EF fetched forty columns and six navigation properties. Push filtering, grouping, and aggregation to SQL:

```csharp
return await _db.Claims
    .AsNoTracking()
    .Where(c => c.ClinicId == clinicId && c.SubmittedAt >= from && c.SubmittedAt < to)
    .GroupBy(c => c.Status)
    .Select(g => new ClaimsSummaryRow(g.Key, g.Count(), g.Sum(c => c.Amount)))
    .ToListAsync(ct);
```

For paged SaaS admin tables, always project **before** `Skip`/`Take`:

```csharp
.Select(o => new OrderListItem(o.Id, o.Status, o.Total, o.CreatedAt))
.Skip(page * size)
.Take(size)
```

If EF cannot translate your projection, fix the expression — do not pull to client with `AsEnumerable()` unless the dataset is provably tiny.

## AsNoTracking on read paths

Change tracking costs CPU and memory on read-only handlers. Healthcare reports, dashboard KPIs, and catalog searches should default to `AsNoTracking()`.

I use tracked queries only when the same `DbContext` instance will update entities in the same request. For MediatR query handlers that return DTOs, tracking is almost never needed.

If you still return an **entity graph** and the same `Patient` becomes two CLR instances, that is [AsNoTracking vs AsNoTrackingWithIdentityResolution](/blog/ef-core-asnotracking-vs-identity-resolution) — not an index problem. If one clinic is fast and the hub clinic times out on the same LINQ, read [parameter sniffing](/blog/ef-core-sql-server-parameter-sniffing) after you have a plan in Query Store.

```csharp
builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking);
});
```

Opt in to tracking per query when a command handler mutates entities. Global NoTracking with explicit `AsTracking()` on writes keeps reports fast and reduces accidental stale-update bugs.

## Indexes: what EF cannot invent

EF Core generates SQL; SQL Server chooses plans. Missing indexes show up as table scans on clinic ID + date filters:

```sql
CREATE NONCLUSTERED INDEX IX_Claims_ClinicId_SubmittedAt
ON dbo.Claims (ClinicId, SubmittedAt)
INCLUDE (Status, Amount);
```

Match indexes to **where** and **order by** columns in hot queries. Include columns that appear in `SELECT` projections to avoid key lookups.

Common mistakes:

- Index every column — write performance suffers
- Index only the first column of a composite filter when queries always filter clinic + date range
- Forget filtered indexes for soft-deleted rows: `WHERE IsDeleted = 0`

After adding indexes, re-check Query Store. Sometimes EF's `OrderBy` on non-indexed columns forces sorts that dominate cost.

## Healthcare and reporting query pain

Reporting endpoints differ from CRUD endpoints. Product teams ask for "export to Excel" and "monthly summary by provider" on the same API that serves real-time screens.

Patterns that help:

**Bounded date ranges.** Require `from`/`to` or max range server-side. Open-ended "all history" queries become full table scans.

**Pre-aggregation for heavy dashboards.** Nightly SQL jobs or materialized summary tables for metrics that do not need second-level freshness. EF reads summaries; raw SQL or stored procedures for rebuild jobs is acceptable in reporting paths.

**Timeout and command timeout.** Long reports get explicit `CancellationToken` from the client and higher `CommandTimeout` only on those commands — not globally.

```csharp
_db.Database.SetCommandTimeout(TimeSpan.FromMinutes(2));
```

**Read-only routing.** When Azure SQL or Always On secondary replicas exist, route heavy reports to a read connection string. EF supports two contexts or `DbContext` factory with named connections.

**Avoid `Count()` on huge tables for pagination UI.** Approximate counts or "next page exists" patterns reduce cost on million-row eCommerce order history.

## Compiled queries for hot paths

Endpoints hit thousands of times per minute — product search, cart line lookup — benefit from compiled queries:

```csharp
private static readonly Func<AppDbContext, Guid, Task<Product?>> GetProductById =
    EF.CompileAsyncQuery((AppDbContext db, Guid id) =>
        db.Products.AsNoTracking().FirstOrDefault(p => p.Id == id));
```

Measure first. Compiled queries help micro-hot paths; they add complexity if applied everywhere.

## Batch operations and SaveChanges habits

Import jobs and bulk status updates fail when code loads entities one by one:

```csharp
foreach (var id in ids)
{
    var entity = await _db.Items.FindAsync(id);
    entity!.Status = Status.Approved;
    await _db.SaveChangesAsync(ct); // N round trips
}
```

Prefer `ExecuteUpdateAsync` / `ExecuteDeleteAsync` in EF Core 7+ for set-based updates when change tracking and interceptors are not required:

```csharp
await _db.Claims
    .Where(c => ids.Contains(c.Id))
    .ExecuteUpdateAsync(s => s.SetProperty(c => c.Status, ClaimStatus.Approved), ct);
```

When domain events or audit interceptors must fire, batch in one transaction with a single `SaveChangesAsync` after loop — still load only what you need.

## Diagnostics checklist before rewriting architecture

Before proposing read replicas or microservices, I verify:

- [ ] No N+1 in the hot path (SQL log query count)
- [ ] List endpoints project DTOs, not entities
- [ ] Read handlers use AsNoTracking
- [ ] Indexes match filter + sort columns
- [ ] Pagination happens in SQL, not in memory
- [ ] Command timeout appropriate for reports
- [ ] Query Store reviewed for regressions after deploy

Most "we need caching" requests disappear after fixing projection and indexes. Redis helps after SQL is honest.

## EF Core version and SQL Server compatibility

Stay current on EF Core patch releases — translation improvements and performance fixes ship regularly. Verify compatibility level on Azure SQL matches features you use (JSON functions, etc.).

Test reports against production-scale data copies. Empty databases lie.

## Bottom line

EF Core performance in healthcare and SaaS is usually about query shape: stop N+1, project early, track only when updating, and index what your Angular screens actually filter. Reporting pain needs bounded queries, aggregation in SQL, and sometimes read paths separate from transactional writes — not a rewrite on day one.

If your ASP.NET Core API is struggling with SQL Server under real data volume and you want a focused performance review, [get in touch](/contact).

---
title: "EF Core AsNoTracking vs AsNoTrackingWithIdentityResolution"
description: "When no-tracking queries return duplicate Patient instances on one graph, why AsNoTrackingWithIdentityResolution exists, and when I still project DTOs instead in ASP.NET Core + SQL Server."
date: "2026-08-17"
category: "ef-core"
tags: ["EF Core", "SQL Server", "Performance", "ASP.NET Core"]
---

`AsNoTracking()` is the right default on read APIs. It is also how I have shipped a clinic schedule DTO where the same patient appeared as **two objects** with the same id, and an Angular grid showed two “edit” buttons that were not the same reference.

This page is that distinction: **no tracking** versus **no tracking with identity resolution**. It is not the N+1 article and not the cartesian-explosion article. Those are [N+1 vs Include vs AsSplitQuery](/blog/ef-core-nplus1-include-vs-assplitquery) and [multiple collection Includes](/blog/ef-core-cartesian-explosion-multiple-include). The wider checklist is [EF Core and SQL Server performance](/blog/ef-core-sql-performance).

## What tracking is for

A tracked query puts entities in the `DbContext` identity map. Same primary key → **same CLR instance**. `SaveChanges` can see property changes.

That is what you want in a **command** that loads a claim, mutates status, saves. It is ballast on a **query** that returns 200 rows to Angular and never calls `SaveChanges`.

So read handlers use `AsNoTracking()` (or a context with `QueryTrackingBehavior.NoTracking`).

## What AsNoTracking actually does to a graph

No-tracking skips the identity map. EF still materializes rows. If the SQL result has the **same patient id on two visit rows**, you get **two `Patient` instances**. They compare equal by id if you wrote equality. They do **not** compare equal by reference.

```csharp
var visits = await db.Visits
    .AsNoTracking()
    .Include(v => v.Patient)
    .Where(v => v.ClinicId == clinicId && v.StartUtc >= from && v.StartUtc < to)
    .OrderBy(v => v.StartUtc)
    .Take(100)
    .ToListAsync(ct);

var first = visits[0].Patient;
var later = visits.First(v => v.PatientId == first.Id && v.Id != visits[0].Id).Patient;

// Often true with AsNoTracking:
ReferenceEquals(first, later); // false
```

If you then build a lookup `Dictionary<Patient, List<Visit>>` keyed by reference, you split one person. If you `JsonSerializer` the graph with reference handling, you emit duplicates. If a mapper uses object identity to dedupe, it silently fails.

This is **not** cartesian explosion. Cartesian explosion is extra **SQL rows** from two collection joins. Identity resolution is extra **CLR instances** for the same key after materialization. You can have both on one query. Fix them separately.

## What AsNoTrackingWithIdentityResolution changes

```csharp
var visits = await db.Visits
    .AsNoTrackingWithIdentityResolution()
    .Include(v => v.Patient)
    .Where(v => v.ClinicId == clinicId && v.StartUtc >= from && v.StartUtc < to)
    .Take(100)
    .ToListAsync(ct);
```

EF still will not track for `SaveChanges`. It **will** reuse instances for the same key while materializing this query. `ReferenceEquals` on `Patient` becomes true for the same id in that graph.

Cost: identity maps for the duration of materialization. Cheaper than full tracking (no snapshot for updates). More expensive than raw `AsNoTracking()` on a huge graph.

I use it when **all** of these are true:

- I am returning **entities** (or a graph I did not project)
- The consumer cares about **object identity** (in-memory grouping, reference loops, a mapper)
- I cannot or will not rewrite the query as a DTO projection this week

I do **not** use it as a default for every read. Most Angular list endpoints should never see a `Patient` entity.

## The fix I prefer: do not return the graph

Identity resolution is a bandage on “we Included the world.”

```csharp
var rows = await db.Visits
    .AsNoTracking()
    .Where(v => v.ClinicId == clinicId && v.StartUtc >= from && v.StartUtc < to)
    .OrderBy(v => v.StartUtc)
    .Take(100)
    .Select(v => new VisitRowDto(
        v.Id,
        v.StartUtc,
        v.PatientId,
        v.Patient.DisplayName))
    .ToListAsync(ct);
```

SQL joins once for the name. There is no second `Patient` instance because there is no `Patient` instance. Duplicate names in the JSON are just strings. Angular groups by `patientId`.

That is the API I want for a scheduler grid. Identity resolution never comes up.

## When projection is awkward

Detail screens, print models, and “export this visit with nested lines” sometimes keep a graph. Then:

| Query | Tracking | Identity | Use |
| --- | --- | --- | --- |
| Command, will `SaveChanges` | On (`AsTracking`) | Yes | Default |
| Read, DTO `Select` | `AsNoTracking` | N/A | Default for APIs |
| Read, entity graph, identity matters | `AsNoTrackingWithIdentityResolution` | Yes | Short list |
| Read, entity graph, identity does not matter | `AsNoTracking` | No | Logging dumps, one-off |

If you `Include` two collections, fix [cartesian explosion](/blog/ef-core-cartesian-explosion-multiple-include) first (`AsSplitQuery` or two queries). Identity resolution will not shrink a 50,000-row JOIN. It only dedupes CLR objects **after** SQL already paid.

## A marketplace example (same bug, different nouns)

Ecom_NET10-style orders: `Include(o => o.Buyer)` on a page of orders. The same buyer placed four orders this week. `AsNoTracking()` → four `Buyer` instances. A naive “unique buyers on this page” using `HashSet<Buyer>` (reference equality) reports four. `AsNoTrackingWithIdentityResolution()` reports one. `Select` buyer id + name reports one without thinking about it.

## Mutation trap

Do not load with `AsNoTrackingWithIdentityResolution`, mutate the instance, and expect `SaveChanges` to persist. It will not. Attach explicitly if you must — I would rather load tracked in the command handler.

```csharp
// Wrong: looks loaded, will not update
var visit = await db.Visits.AsNoTrackingWithIdentityResolution()
    .FirstAsync(v => v.Id == id, ct);
visit.Status = VisitStatus.Cancelled;
await db.SaveChangesAsync(ct); // no UPDATE
```

No-tracking means **no snapshot**. Identity resolution does not restore tracking.

## Practical default in Program.cs

```csharp
builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseSqlServer(connection);
    options.UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking);
});
```

Command handlers that update call `.AsTracking()` or use a context configured for tracking. Query handlers stay no-tracking. When a leftover `Include` graph breaks an in-memory grouping, that handler opts into `AsNoTrackingWithIdentityResolution` **or** gets a projection in the same PR. I do not flip the global default to identity resolution. It hides the “we returned entities” smell.

## Checklist

- [ ] List/search endpoints project DTOs — no `Patient`/`Buyer` entity in JSON
- [ ] Remaining entity reads that group by navigation use identity resolution **or** group by id
- [ ] Commands use tracked queries
- [ ] Nobody mutates no-tracking instances
- [ ] Cartesian / N+1 diagnosed with SQL, not with CLR identity

If the Angular screen only needs columns, you do not have an identity-resolution problem. You have an Include problem.

---

If an ASP.NET Core read API is duplicating related entities or tracking reports it should not, [contact me](/contact). Bring the query and the JSON; the identity map is easy to reason about once you see both.

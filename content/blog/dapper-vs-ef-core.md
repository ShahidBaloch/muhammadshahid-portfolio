---
title: "Dapper vs EF Core: When to Use Each"
description: "Dapper vs EF Core for ASP.NET Core: EF Core for the model and writes, Dapper for one hot read that must be a specific SQL statement. Do not pick a side for the whole database."
date: "2026-09-18"
updated: "2026-09-18"
category: "ef-core"
tags: ["Dapper", "EF Core", "SQL", "ASP.NET Core"]
related:
  - ef-core-sql-performance
  - ef-core-bulk-update-executeupdate
  - repository-pattern-dotnet
  - ef-core-interview-questions
faq:
  - q: "Is Dapper faster than EF Core?"
    a: "Dapper skips change tracking and mapping overhead. For a single indexed read, a compiled EF Core query or FromSql is usually close enough. Dapper wins when you need SQL that EF Core will not generate, not because every SELECT is slow in EF Core."
  - q: "Can I use Dapper and EF Core in the same app?"
    a: "Yes. Use one connection string and one database. EF Core owns migrations and writes. Dapper runs specific reads. Do not have two models that both insert the same table."
  - q: "Should I drop EF Core and rewrite in Dapper?"
    a: "No. Change tracking, migrations, and unit-of-work saves are why EF Core is there. Replace the one query that shows up in traces, not the whole data layer."
---

"Dapper is faster" is not a design. Most ASP.NET Core apps are slow because of N+1 queries and missing indexes, which Dapper will copy line for line if you let it.

Hub: [EF Core](/learning/ef-core). Start with [SQL performance](/blog/ef-core-sql-performance) before you add a second library.

## Real-world analogy

A general contractor builds the house: foundations, wiring, inspections. That is EF Core. One staircase needs a pattern the contractor's plans will not draw, so you bring in a joiner with their own measurements. That is Dapper. You do not knock the house down because the staircase was awkward.

## Worked example

The orders screen is slow. The trace shows an `Include` of lines, products, and customers, and the SQL is a wide join. Replacing the whole data layer with Dapper would copy that join into a string and keep the same plan. The useful split is smaller: the page projects a DTO in EF Core with `AsNoTracking`, and one month-end report that needs a table-valued parameter stays in Dapper. Saves, concurrency tokens, and migrations stay on the context. The report does not get its own model that also inserts into `Orders`.

## Split the work

| Job | Use | Why |
|---|---|---|
| Insert and update an aggregate | EF Core | Change tracking, one `SaveChanges`, concurrency token |
| Schema | EF Core migrations | One history table |
| Bulk set of a column | `ExecuteUpdate` | No need to load rows. See [ExecuteUpdate](/blog/ef-core-bulk-update-executeupdate) |
| Report or search that must be exact SQL | Dapper | You control the statement and the plan |
| One query returning a flat DTO | Either | `Select` to a DTO in EF Core is already untracked |

## A read that stays in EF Core

```csharp
var page = await db.Orders
    .AsNoTracking()
    .Where(o => o.CustomerId == customerId)
    .OrderByDescending(o => o.CreatedAt)
    .Select(o => new OrderListItem(o.Id, o.Total, o.Status))
    .Take(20)
    .ToListAsync(ct);
```

That is one SQL statement and no tracker. Dapper does not make this faster in a way a user can feel. Measure before you split the stack.

## When Dapper is the right call

The SQL needs a hint, a TVP, or a shape `Include` turns into a cartesian product you already fought. Then a query object is clearer than another specification class. See [repository pattern](/blog/repository-pattern-dotnet): the repository is optional. A `GetOrderReport` method that calls `QueryAsync` is enough.

Share the connection string. Do not open a second context strategy. If the Dapper read must see uncommitted EF Core writes, you are in the same transaction and this got complicated on purpose. Commit first, then read, unless you have a real reason not to.

## What not to do

- Do not map the same table in both tools and forget which one writes.
- Do not use Dapper to avoid learning `AsNoTracking` and projections. Those are the actual fix.
- Do not micro-benchmark a `SELECT 1` and announce a framework decision. Trace a slow request.

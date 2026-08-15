---
title: "EF Core N+1 vs Include vs AsSplitQuery — Pick the SQL You Meant"
description: "How I tell lazy-load N+1 from a single fat Include JOIN, when AsSplitQuery helps in ASP.NET Core + SQL Server, and why two collection Includes are a different bug (cartesian explosion)."
date: "2026-08-16"
category: "ef-core"
tags: ["EF Core", "SQL Server", "Performance", "ASP.NET Core"]
---

Teams say “we have an N+1” for three different SQL shapes. The fix for one makes another worse. This article is the **comparison**: lazy N+1, eager `Include` (one JOIN query), and `AsSplitQuery`. The broader EF/SQL Server checklist is [EF Core performance](/blog/ef-core-sql-performance). Cartesian explosion — two collection Includes multiplying rows — is [its own post](/blog/ef-core-cartesian-explosion-multiple-include).

I use appointment and order graphs from healthcare and eCommerce APIs. Numbers below are **illustrative**, not a benchmark you should quote as fact.

## Three shapes, three symptoms

| Shape | What SQL Server sees | Typical Angular symptom |
| --- | --- | --- |
| **N+1** | 1 query for the list + 1 per row for a navigation | Dashboard “pops in” slowly; App Insights shows dozens of SQL deps |
| **Single `Include` (reference)** | One query, JOIN to a **many-to-one** | Usually fine for lists if you project |
| **`Include` two **collections**** | One query, JOIN that **multiplies rows** | One endpoint, huge payload, high logical reads |
| **`AsSplitQuery`** | One query per included collection (plus the root) | More round-trips, no multiplied rows |

N+1 is **too many round-trips**. Cartesian explosion is **too many rows in one round-trip**. `AsSplitQuery` trades the second for a few extra round-trips. It is not a magic “make Include fast” switch.

## N+1: you asked for a list, then touched a navigation

Classic pattern in a query handler that returns entities:

```csharp
var visits = await db.Visits
    .Where(v => v.ClinicId == clinicId)
    .OrderByDescending(v => v.StartUtc)
    .Take(50)
    .ToListAsync(ct);

foreach (var v in visits)
{
    dto.Add(ToRow(v.Patient.DisplayName, v.StartUtc)); // Patient not loaded
}
```

If lazy loading is on, that is **1 + 50** SQL calls. If lazy loading is off, it is a null reference — which is nicer, because it fails in staging.

**Fix I prefer for list APIs:** do not `Include` the whole `Patient`. Project:

```csharp
var rows = await db.Visits
    .AsNoTracking()
    .Where(v => v.ClinicId == clinicId)
    .OrderByDescending(v => v.StartUtc)
    .Take(50)
    .Select(v => new VisitRowDto(v.Id, v.Patient.DisplayName, v.StartUtc))
    .ToListAsync(ct);
```

SQL becomes one query with a JOIN to `Patients` for the columns you need. That JOIN is **not** cartesian explosion: `Patient` is a **reference** (many visits, one patient). Row count stays 50.

`Include(v => v.Patient)` on the same filter is acceptable when you truly need the entity graph in a command. For an Angular grid, it is usually wasted columns and tracking.

## Include one collection: still usually one query

```csharp
var order = await db.Orders
    .Include(o => o.Lines)
    .AsNoTracking()
    .SingleAsync(o => o.Id == id, ct);
```

SQL Server runs **one** SELECT with a JOIN from `Orders` to `OrderLines`. If the order has 12 lines, you get 12 rows in the raw result and EF **stitches** them into one `Order` with 12 `Lines`. That stitching is normal. Reads scale with line count, not with a second collection.

This is the case `Include` was designed for. Do not reach for `AsSplitQuery` yet.

## AsSplitQuery: when one JOIN is the wrong tool

`AsSplitQuery()` tells EF to load the root, then load each included collection with a **separate** query (same `DbContext`, typically same transaction).

Use it when:

- You already `Include` **more than one collection**, or
- A **wide** collection Include + a huge root select is cheaper as two queries than as one JOIN (measure; do not assume)

```csharp
var order = await db.Orders
    .AsSplitQuery()
    .Include(o => o.Lines)
    .Include(o => o.Payments)
    .AsNoTracking()
    .SingleAsync(o => o.Id == id, ct);
```

Without split: JOIN lines **and** payments in one statement → row count ≈ lines × payments. That is the cartesian article.

With split: query 1 loads the order; query 2 loads lines; query 3 loads payments. Three round-trips. Row counts stay honest.

**Cost:** extra network hops and a consistency window (data can change between queries unless you wrap in a transaction / snapshot). For a read model on SQL Server, I often wrap the three queries in a `ReadCommitted` transaction for the request — still cheaper than a 50,000-row JOIN.

**Do not** `AsSplitQuery()` a list endpoint that already projects DTOs. Split query exists for **graphs**, not for `Select`.

## How I tell them apart in logs

Turn on command logging in Development:

```csharp
options
    .EnableSensitiveDataLogging(false)
    .LogTo(Console.WriteLine, new[] { RelationalEventId.CommandExecuted });
```

- **N+1:** many similar `SELECT` statements with a changing `PatientId` parameter.
- **Healthy Include (reference or one collection):** one `SELECT` with a JOIN; result row count ≈ parents (or ≈ child rows for one collection).
- **Cartesian:** one `SELECT` with two collection JOINs; result row count ≈ product of collection sizes. EF still returns one object graph, so **the API looks correct** while SQL Server does the damage.
- **Split:** several `SELECT`s in one request, different `FROM` tables, same parent key.

I copy the SQL into SSMS, include the actual plan, and look at **number of rows read**, not whether the C# object graph looks right. The graph almost always looks right.

## Decision I write in the PR

1. List/grid JSON → **projection**, `AsNoTracking`, no `Include` unless proven.
2. Need one child collection on a detail screen → **`Include` that collection** (or a second query you own).
3. Need two child collections → **do not** one-query `Include` both; **`AsSplitQuery` or two explicit queries**, and read [cartesian explosion](/blog/ef-core-cartesian-explosion-multiple-include).
4. Still slow → indexes and Query Store, not another Include flag. See the [performance pillar](/blog/ef-core-sql-performance).

Enable `MultipleCollectionIncludeWarning` in Development so EF yells before production does.

## What I do not do

I do not disable lazy loading in Production only. If the app relies on it, you will ship N+1 the first time someone adds a `foreach`.

I do not `AsSplitQuery` globally in `OnConfiguring` without measuring. Some graphs get slower.

I do not cache the wrong query in Redis to hide a cartesian JOIN. Cache after the SQL is honest.

---

If an ASP.NET Core endpoint is “fine in demo data” and dies on a real clinic or seller catalog, [contact me](/contact). Send the generated SQL and the Include list — that pair is usually enough to choose projection vs split vs a different bug.

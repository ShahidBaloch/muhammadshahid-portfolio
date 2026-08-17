---
title: "SQL Server Parameter Sniffing with EF Core — When the Plan Fits the Wrong Clinic"
description: "How EF Core parameterized SQL meets SQL Server parameter sniffing: why one clinic is fast and another times out, what I change first, and the workarounds I refuse as a default."
date: "2026-08-17"
category: "ef-core"
tags: ["EF Core", "SQL Server", "Performance", "ASP.NET Core"]
---

The appointment search is fine for clinic A (200 visits a week). Clinic B (a regional hub) times out the same endpoint. Same ASP.NET Core code. Same EF query. SQL Server cached a plan that was cheap for A’s parameters and catastrophic for B’s.

That is **parameter sniffing**. It is a SQL Server behavior. EF Core did not invent it. EF Core **does** send parameterized SQL by default, which is how sniffing gets a value to sniff.

This is not [N+1](/blog/ef-core-nplus1-include-vs-assplitquery) and not “add an index and walk away.” Indexes still matter. Sniffing is why a **good** index still serves a **bad** plan. Broader query habits: [EF Core performance](/blog/ef-core-sql-performance).

Numbers below are **illustrative**. Do not quote them as a benchmark.

## What sniffing is (in this stack)

SQL Server compiles a plan using the **first** parameter values it sees (or a sniffed value at compile). That plan is reused for later calls.

EF generates something like:

```sql
SELECT ... FROM Visits v
WHERE v.ClinicId = @__clinicId_0
  AND v.StartUtc >= @__from_1
  AND v.StartUtc < @__to_2
ORDER BY v.StartUtc
OFFSET @__p_3 ROWS FETCH NEXT @__p_4 ROWS ONLY
```

Clinic A: `@__clinicId_0` is a small tenant. Nested loop + seek is perfect.  
Clinic B: millions of rows for that `ClinicId`. The cached nested loop reads like a table scan with extra steps.

Angular sees “the API is slow on big clinics.” App Insights shows SQL duration. The code review finds nothing because the LINQ is reasonable.

## Confirm it before you sprinkle hints

I want **Query Store** (or an actual plan) for the slow call:

- Same query hash, wildly different duration by clinic
- Plan shows a join type that makes sense for a tiny estimate and not for the actual rows
- `SET STATISTICS IO` on a replay with B’s parameters vs A’s

If every clinic is slow, you probably have a missing index, a [cartesian Include](/blog/ef-core-cartesian-explosion-multiple-include), or a projection that loads entities. Fix that first. Sniffing is the diagnosis when **data distribution** is the difference.

Do not log parameter values that are patient identifiers in production traces. Use clinic id and date range in a controlled replay with a masked database.

## What I change first (application)

**1. The query shape Angular actually needs**

Unbounded `from`/`to` on clinic B is a scan waiting to happen. Require a max window. Hub clinics search a week, not “all history,” unless they hit a report connection with a timeout.

**2. Projection, not Include**

A sniffed bad plan plus `Include` of collections is how you timeout and then blame sniffing only. Project columns. [AsNoTracking vs identity resolution](/blog/ef-core-asnotracking-vs-identity-resolution) if you still materialize graphs.

**3. Indexes that match the filter you sniff**

`(ClinicId, StartUtc)` INCLUDE list columns is the usual seek. If the first sniffed plan used a different index because A’s `StartUtc` range was tiny, B still needs a supporting index so **a** good plan exists.

Sniffing on a heap with no tenant+date index is not sniffing. It is a missing index wearing a costume.

## What I change in SQL Server (carefully)

When the LINQ is already honest and Query Store shows a sniffed nested loop:

**Update statistics** on the big tables after a data load. Stale stats + sniffing is a popular pairing.

**Query Store force plan** for a known-good plan — operations-owned, not a developer folklore hint in LINQ. I use this when one query id is a fire and we need the site up.

I am slow to put **RECOMPILE** on every EF query. It “fixes” sniffing by compiling every time. CPU goes up. Tiny clinics pay for hub clinics. I will use `Option (Recompile)` on a **single** report stored procedure, not as a global EF interceptor.

`OPTIMIZE FOR UNKNOWN` (local variable pattern / `OPTIMIZE FOR UNKNOWN`) can produce a generic plan. Sometimes that generic plan is mediocre for everyone instead of excellent for A and deadly for B. Measure both tenants.

I do **not** tell EF to concatenate SQL to avoid parameters. That is injection and plan-cache pollution. Parameterization stays.

## EF Core levers that are real

**Split the hot query** so the sniffed parameter is less lethal: filter `ClinicId` in a cheap seek, then date page. Two round-trips can beat one disaster plan. That is an engineering trade, not a purity loss.

**`EF.Constant` (where it exists in your EF version)** for a value that should not be a parameter — use rarely. A boolean feature flag is a candidate. `ClinicId` is not. If you constant-fold tenant ids you explode the plan cache.

**Raw SQL for the one report** that Query Store hates, with parameters you control:

```csharp
var rows = await db.Database
    .SqlQuery<VisitRowDto>($"""
        SELECT v.Id, v.StartUtc, p.DisplayName
        FROM Visits v
        INNER JOIN Patients p ON p.Id = v.PatientId
        WHERE v.ClinicId = {clinicId}
          AND v.StartUtc >= {from}
          AND v.StartUtc < {to}
        ORDER BY v.StartUtc
        OFFSET {skip} ROWS FETCH NEXT {take} ROWS ONLY
        """)
    .ToListAsync(ct);
```

EF still parameterizes interpolated SQL in current versions when used correctly — verify the log. The point of raw SQL here is **hints you will not hang on LINQ**, e.g. a well-reviewed `OPTION (RECOMPILE)` on a report only:

```sql
OPTION (RECOMPILE)
```

I keep that in a stored procedure named for the report, not sprinkled through the app. Healthcare reporting already wants a stable contract.

**Dapper for the ugly report** is allowed. A single Dapper method in the reporting project is not a betrayal of EF. Hybrid EF + Dapper in one host is a later cluster post — do not invent a second ORM story until this query has a plan you can explain.

## Application patterns that make sniffing worse

- **One mega-search** with optional filters (`if (q.ProviderId is not null)`) that change the SQL shape. EF may generate multiple query caches anyway; optional filters also change estimates. Prefer a small set of dedicated queries over a 40-branch IQueryable.
- **`Contains` on a huge id list** from Angular. Sniffing plus a table-valued parameter would be a different article; start by capping the list.
- **Global filters** (`HasQueryFilter` for soft delete) that interact with the sniffed seek. Check the plan includes `IsDeleted = 0` efficiently.

## Checklist I use on a “big tenant is slow” ticket

- [ ] Reproduce with clinic B parameters on a masked copy
- [ ] Query Store: plan vs duration vs tenant
- [ ] Index on tenant + date (or the actual filter)
- [ ] LINQ projects; no double collection Include
- [ ] Date range bounded
- [ ] Stats current
- [ ] Only then: Query Store force, isolated RECOMPILE, or a report procedure

If you skip to `RECOMPILE` in an interceptor, you will ship a CPU incident and still have a missing index.

## What I tell product

Parameter sniffing is not an EF bug. Multi-tenant healthcare data is **skewed**. The API has to assume one clinic is not like another. Timeouts on hub clinics are a capacity and plan problem, not “SQL Server being random.”

---

If one tenant crawls and others do not on the same EF query, [contact me](/contact). Bring Query Store for that query id and a redacted plan; we can tell sniffing from a missing index in one sitting.

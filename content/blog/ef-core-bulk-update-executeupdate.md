---
title: "EF Core ExecuteUpdate vs SaveChanges"
description: "ExecuteUpdateAsync runs one UPDATE without loading entities. When I use it on fee schedules — and why it will not fire your audit interceptor."
date: "2026-09-07"
category: "ef-core"
tags: ["EF Core", "SQL Server", "Performance", "ASP.NET Core"]
related:
  - ef-core-interceptors-audit-log
  - ef-core-sql-performance
  - ef-core-interview-questions
faq:
  - q: "When should I use ExecuteUpdateAsync instead of SaveChanges?"
    a: "When you are changing a set of rows you do not need in memory — deactivate a year’s fee schedules, close stale claims. One SQL UPDATE. No change tracker."
  - q: "Does ExecuteUpdate run ISaveChangesInterceptor?"
    a: "No. There is no SaveChanges. Put ModifiedAt in SetProperty yourself, or do not use ExecuteUpdate for rows that must raise domain events."
  - q: "Is ExecuteUpdate the same as a bulk insert library?"
    a: "No. It is a set-based UPDATE or DELETE from LINQ. Imports that need per-row validation still batch AddRange plus one SaveChanges, or a real bulk copy."
---

A clinic uploaded a new fee year. The handler loaded **four thousand** `FeeSchedule` rows, set `IsActive = false`, and called `SaveChanges`. EF sent thousands of UPDATE statements. The request timed out. Angular showed a generic 500.

**`ExecuteUpdateAsync`** (EF Core 7+) turns that into one `UPDATE ... WHERE`. This URL is the merge checklist. Interview “SaveChanges in a foreach” is [EF Core interview questions](/blog/ef-core-interview-questions). Do not treat this page as a second interview dump.

## The load-mutate-save that dies at volume

```csharp
var expired = await db.FeeSchedules
    .Where(f => f.ClinicId == clinicId && f.Year == oldYear)
    .ToListAsync(ct);

foreach (var row in expired)
{
    row.IsActive = false;
}

await db.SaveChangesAsync(ct);
```

Fine for twenty rows. Wrong for a full schedule file. You paid for materialization, snapshots, and a round-trip per row (or a huge batch of individual UPDATEs). Healthcare fee files that half-apply are worse than a 500 — so this also wants a **transaction**, not “save whatever we got.”

## One set-based UPDATE

```csharp
var affected = await db.FeeSchedules
    .Where(f => f.ClinicId == clinicId && f.Year == oldYear)
    .ExecuteUpdateAsync(
        setters => setters
            .SetProperty(f => f.IsActive, false)
            .SetProperty(f => f.ModifiedAt, DateTime.UtcNow),
        ct);
```

SQL Server runs a single statement. `affected` is the row count. I return that on the admin API so ops can see “3,912 rows closed” instead of a silent success.

`ExecuteDeleteAsync` is the same idea for rows you are allowed to remove. Soft-delete in this codebase is usually `IsDeleted = true` via `ExecuteUpdate`, not a hard delete — filters still apply unless you ignore them.

## What you give up

**No change tracker.** Tracked instances in the same `DbContext` stay stale. Do not `ExecuteUpdate` then read `entity.IsActive` on an instance you loaded earlier in the request and expect it to match.

**No `SaveChanges` interceptors.** [Audit interceptors](/blog/ef-core-interceptors-audit-log) never run. If `ModifiedBy` must be the JWT subject, set it in `SetProperty`. If you need domain events per row, **do not** use `ExecuteUpdate` — batch `Add`/`Update` and one `SaveChanges`.

**Global query filters still apply.** A tenant filter on `ClinicId` stays in the UPDATE. `IgnoreQueryFilters()` on a bulk close is how you deactivate the wrong tenant. Re-apply `Where(f => f.ClinicId == clinicId)` yourself if you ignore filters.

## When I still use SaveChanges

- The Angular form edited **one** encounter and the interceptor must write `ModifiedBy`
- The import must validate each row and report line numbers
- RowVersion optimistic concurrency on a single document — `ExecuteUpdate` can include the token in `Where`, but a 409 story is clearer with `SaveChanges` and `DbUpdateConcurrencyException` ([concurrency token post](/blog/ef-core-optimistic-concurrency-token))

I do not replace every `SaveChanges` with `ExecuteUpdate` because it is “faster.” Faster at skipping the rules you put in interceptors is not a win on a healthcare API.

If a fee-schedule or claims close job is loading tens of thousands of entities to flip a flag, [contact me](/contact). The LINQ `Where` plus whether audit must fire decides ExecuteUpdate vs a tracked batch.

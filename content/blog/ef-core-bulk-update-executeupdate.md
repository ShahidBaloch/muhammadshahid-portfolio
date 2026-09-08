---
title: "EF Core ExecuteUpdate vs SaveChanges"
description: "EF Core ExecuteUpdateAsync runs one set-based UPDATE without loading entities. When to use it for bulk fee schedules — and why it skips SaveChanges interceptors."
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

**`ExecuteUpdateAsync`** (EF Core 7+) translates a LINQ `Where` into a single SQL `UPDATE` statement. No entities load into the change tracker. No `SaveChanges`. Thousands of rows change in one round-trip instead of one UPDATE per tracked instance.

```text
SaveChanges loop                    ExecuteUpdateAsync

  SELECT 4000 rows into RAM           UPDATE FeeSchedules
  mutate each in C#                   SET IsActive = 0
  4000 UPDATE statements              WHERE ClinicId = @id AND Year = @year
  timeout at 30s                      one statement, ~200ms
```

**New to this** → stay here. **Merging a PR** → [load-mutate-save](#the-load-mutate-save-that-dies-at-volume). **On-call / interview** → [what you give up](#what-you-give-up) · [if an interviewer asks](#if-an-interviewer-asks).

**Terms used here:** **Set-based update** = one SQL statement changes every matching row. **Change tracker** = EF's in-memory snapshot of loaded entities; `ExecuteUpdate` bypasses it entirely. **`SetProperty`** = the fluent API that maps C# property assignments to SQL `SET` clauses.

A clinic uploaded a new fee year. The handler loaded **four thousand** `FeeSchedule` rows, set `IsActive = false`, and called `SaveChanges`. EF sent thousands of UPDATE statements. The request timed out. Angular showed a generic 500.

Interview "SaveChanges in a foreach" is [EF Core interview questions](/blog/ef-core-interview-questions). This URL is the merge checklist for set-based updates.

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

I do not replace every `SaveChanges` with `ExecuteUpdate` because it is "faster." Faster at skipping the rules you put in interceptors is not a win on a healthcare API.

## If an interviewer asks

*Import 4,000 fee-schedule rows times out. What do you change?*

**30-second answer:** Stop calling `SaveChanges` per row. For a set-based column change on rows you do not need in memory, use `ExecuteUpdateAsync`. For a true import with per-row validation, batch `AddRange` and one `SaveChanges`, or use a bulk copy path.

**Strong answer:** I'd ask whether the handler needs change-tracker features — audit interceptors, domain events, optimistic concurrency on individual documents. If it is "deactivate every schedule for year X," `ExecuteUpdate` with `SetProperty` for `IsActive`, `ModifiedAt`, and `ModifiedBy` is the right tool. I'd wrap it in a transaction so a partial apply cannot ship. I'd return the affected row count on the admin API. If audit must fire per row, I keep tracked entities and one `SaveChanges` — speed without audit is worse than a timeout on a healthcare fee file.

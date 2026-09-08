---
title: "EF Core Global Query Filters for Soft Delete"
description: "EF Core global query filters for soft delete and multi-tenant ClinicId. How HasQueryFilter works — and why IgnoreQueryFilters is how tenant data leaks."
date: "2026-09-07"
category: "ef-core"
tags: ["EF Core", "Architecture", "Security", "ASP.NET Core"]
related:
  - ef-core-interview-questions
  - ef-core-interceptors-audit-log
  - serilog-pii-redaction-healthcare-aspnet-core
faq:
  - q: "Are EF Core global query filters a security boundary?"
    a: "No. They are a seatbelt. IgnoreQueryFilters, raw SQL, and a DbContext with the wrong tenant still leak. Authorization stays in policies."
  - q: "Does IgnoreQueryFilters affect Includes?"
    a: "Yes. It disables filters for the whole query, including included children. Soft-deleted line items come back too unless you filter them yourself."
  - q: "How do hosted jobs set the tenant?"
    a: "There is no HttpContext. Pass clinic id in the job payload and filter explicitly — or create a scope that sets ITenantContext before resolving DbContext."
---

**Global query filters** in EF Core append a predicate to every LINQ query on an entity — `!IsDeleted && ClinicId == currentTenant` without repeating it in every handler. They make the common case automatic. They are a seatbelt, not a security boundary.

```text
Without filter (someone forgets)     With HasQueryFilter

  db.Encounters.ToList()             db.Encounters.ToList()
  → all clinics, incl. deleted       → WHERE IsDeleted = 0
                                       AND ClinicId = @tenant
  nightly CSV emails wrong clinic    forget IgnoreQueryFilters
                                     or you still leak
```

**New to this** → stay here. **Merging a PR** → [the filter I put on healthcare rows](#the-filter-i-put-on-healthcare-rows). **On-call / interview** → [bypass without leaking](#bypass-without-leaking-the-other-clinic) · [if an interviewer asks](#if-an-interviewer-asks).

**Terms used here:** **`HasQueryFilter`** = fluent API that registers a global `WHERE` clause on an entity type. **`IgnoreQueryFilters()`** = disables every filter on that query — soft-delete and tenant together. **Soft delete** = `IsDeleted = true` UPDATE instead of `DELETE`; rows stay in the table but disappear from default queries.

If every LINQ query must remember `!IsDeleted && ClinicId == current`, someone will forget. A nightly CSV then emails clinic B clinic A's encounters. I have cleaned that up.

The interview prompt ("the job ignored the filter") is [EF Core interview questions](/blog/ef-core-interview-questions). Who deleted the row belongs in an [audit interceptor](/blog/ef-core-interceptors-audit-log), not in this filter.

## The filter I put on healthcare rows

```csharp
public class AppDbContext : DbContext
{
    private readonly Guid _clinicId;

    public AppDbContext(DbContextOptions<AppDbContext> options, ITenantContext tenant)
        : base(options)
    {
        _clinicId = tenant.ClinicId;
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Encounter>().HasQueryFilter(e =>
            !e.IsDeleted && e.ClinicId == _clinicId);
    }
}
```

`db.Encounters.ToListAsync()` becomes `WHERE IsDeleted = 0 AND ClinicId = @clinicId`. Soft delete is an UPDATE to `IsDeleted`, not `ExecuteDelete`, unless the row is allowed to disappear.

I inject **tenant from the request scope**, not a static `Guid`. A singleton `DbContext` with the first clinic that booted is how the wrong tenant’s numbers show up in a cache. That captive-dependency story is in the interview post and in [DI lifetimes](/blog/aspnet-core-dependency-injection).

## Bypass without leaking the other clinic

Admin restore and compliance exports need deleted rows. `IgnoreQueryFilters()` turns **both** the soft-delete and the tenant predicate off.

```csharp
var includingDeleted = await db.Encounters
    .IgnoreQueryFilters()
    .Where(e => e.ClinicId == clinicId)
    .ToListAsync(ct);
```

If you skip the extra `Where` on `ClinicId`, you just queried **every** clinic. I treat `IgnoreQueryFilters` in a PR as a review event. Re-apply the tenant predicate in the same statement. Log the clinic id from the job payload, not from “whatever the context happened to hold.”

## Includes follow the ignore

`IgnoreQueryFilters()` applies to the **entire** query, including `Include`d collections. Restore an encounter and you also get soft-deleted lines unless you filter lines yourself. If you only needed deleted headers, do not Include children on that query.

Raw SQL / `FromSqlRaw` never saw the filter. Neither did a second `DbContext` constructed in a hosted service with `ClinicId = Guid.Empty`. Those are the other leak paths I list in interviews.

## Filters are not a substitute for policies

A user in clinic A can still hit `GET /encounters/{id}` for an id from clinic B if you only “hide” rows in LINQ and never check the resource. I still load with the filter **and** enforce a policy. The filter stops accidental lists. It does not stop a guessed GUID if you query by id with `IgnoreQueryFilters` in a debug helper you forgot to delete.

Do not log encounter payloads when you debug a filter miss. [PII redaction](/blog/serilog-pii-redaction-healthcare-aspnet-core) is the logging article.

## If an interviewer asks

*A nightly job emailed clinic B a CSV of clinic A's encounters. `HasQueryFilter` is on `Encounter`. How?*

**30-second answer:** `IgnoreQueryFilters()` without re-applying `ClinicId`, raw SQL that never saw the filter, or a `DbContext` constructed with the wrong tenant because the hosted service has no HTTP scope.

**Strong answer:** I'd list every escape hatch: `IgnoreQueryFilters` copied from a debug session, `FromSqlRaw`, a singleton or mis-scoped `DbContext` with `Guid.Empty` as tenant, and navigation includes from an unfiltered parent. The fix is explicit `Where(e => e.ClinicId == clinicId)` on exports, tenant from the job payload, and treating `IgnoreQueryFilters` in a PR as a review event. Filters are a seatbelt — authorization still lives in policies. A guessed GUID on `GET /encounters/{id}` still works if you never check the resource.

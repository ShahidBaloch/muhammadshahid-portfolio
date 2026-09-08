---
title: "EF Core SaveChanges Interceptors for Audit Logs"
description: "EF Core SaveChanges interceptors for audit logs: ISaveChangesInterceptor stamps CreatedBy and ModifiedBy from the JWT. Why ExecuteUpdate bypasses it."
date: "2026-09-07"
category: "ef-core"
tags: ["EF Core", "Architecture", "Security", "ASP.NET Core"]
related:
  - ef-core-bulk-update-executeupdate
  - ef-core-global-query-filters-soft-delete
  - serilog-pii-redaction-healthcare-aspnet-core
faq:
  - q: "Does ExecuteUpdateAsync trigger a SaveChanges interceptor?"
    a: "No. Set ModifiedAt and ModifiedBy in SetProperty, or do not use ExecuteUpdate for rows that must be audited that way."
  - q: "Can a SaveChanges interceptor use IHttpContextAccessor?"
    a: "Yes if you register the interceptor as singleton — the accessor is singleton-safe. Hosted services still have no HttpContext; use ICurrentUser that returns System for jobs."
  - q: "Should I log entity snapshots in the interceptor?"
    a: "Not on healthcare rows. Member names and claim amounts in App Insights are a compliance incident. Log entity name, id, and state."
---

**`ISaveChangesInterceptor`** hooks into EF Core's `SaveChanges` pipeline. Before SQL hits the database, you walk the change tracker and stamp `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` on every auditable entity — so no controller or handler can forget.

```text
Tracked SaveChanges path              ExecuteUpdate path

  Handler mutates entity              LINQ → single UPDATE
       ↓                                    ↓
  SaveChangesAsync                    (no SaveChanges)
       ↓                                    ↓
  AuditInterceptor.Stamp()            interceptor never runs
       ↓
  SQL with ModifiedBy set
```

**New to this** → stay here. **Merging a PR** → [stamp auditable entities](#stamp-auditable-entities-in-savingchanges). **On-call / interview** → [what this interceptor will never see](#what-this-interceptor-will-never-see) · [if an interviewer asks](#if-an-interviewer-asks).

**Terms used here:** **`SaveChangesInterceptor`** = EF Core hook that runs before/after `SaveChanges`. **`ICurrentUser`** = abstraction that reads JWT subject in HTTP requests and returns `"System"` for hosted jobs. **Shadow property** = a column mapped without a CLR property (`entry.Property("ModifiedAt")`).

Every encounter row needed `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy`. Controllers stamped them by hand. One intern forgot on a PATCH. The audit trail said the row was created by nobody.

This is not a second [query-filter](/blog/ef-core-global-query-filters-soft-delete) article. Filters hide rows. Interceptors write columns on save.

## Stamp auditable entities in SavingChanges

```csharp
public interface IAuditable
{
    DateTime CreatedAt { get; set; }
    string CreatedBy { get; set; }
    DateTime? ModifiedAt { get; set; }
    string? ModifiedBy { get; set; }
}

public sealed class AuditInterceptor : SaveChangesInterceptor
{
    private readonly ICurrentUser _user;

    public AuditInterceptor(ICurrentUser user) => _user = user;

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        Stamp(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    public override InterceptionResult<int> SavingChanges(
        DbContextEventData eventData,
        InterceptionResult<int> result)
    {
        Stamp(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    private void Stamp(DbContext? context)
    {
        if (context is null) return;

        var userId = _user.UserId ?? "System";
        var now = DateTime.UtcNow;

        foreach (var entry in context.ChangeTracker.Entries<IAuditable>())
        {
            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreatedAt = now;
                entry.Entity.CreatedBy = userId;
            }
            else if (entry.State == EntityState.Modified)
            {
                entry.Entity.ModifiedAt = now;
                entry.Entity.ModifiedBy = userId;
            }
        }
    }
}
```

Override **both** sync and async. Imports and tests still call the sync path.

`ICurrentUser` reads the JWT name identifier when `HttpContext` exists and returns `"System"` for a hangfire/hosted job. I do **not** inject `IHttpContextAccessor` into a story that pretends jobs have a user. Register the interceptor as singleton; `ICurrentUser` should be scoped **or** also wrap the accessor so it is safe across requests.

```csharp
builder.Services.AddSingleton<AuditInterceptor>();
builder.Services.AddDbContext<AppDbContext>((sp, options) =>
{
    options.UseSqlServer(connectionString)
        .AddInterceptors(sp.GetRequiredService<AuditInterceptor>());
});
```

## What this interceptor will never see

[`ExecuteUpdateAsync`](/blog/ef-core-bulk-update-executeupdate) does not call `SaveChanges`. Bulk close of a fee year must set `ModifiedAt` / `ModifiedBy` in `SetProperty` or you will ship an unaudited UPDATE.

Soft-delete via `IsDeleted = true` **does** go through `SaveChanges` if you load and mutate. If you `ExecuteUpdate` the flag, stamp it there too.

## Do not log the graph

I have seen interceptors dump `entry.CurrentValues` into Serilog. On a claim that is PHI. Log `entry.Metadata.ClrType.Name`, primary key, and `EntityState`. Payload redaction is [the Serilog post](/blog/serilog-pii-redaction-healthcare-aspnet-core).

## If an interviewer asks

*Bulk fee-year close ran but `ModifiedBy` is null on every row. The audit interceptor exists. What happened?*

**30-second answer:** `ExecuteUpdateAsync` does not call `SaveChanges`. The interceptor never ran. Set `ModifiedBy` in `SetProperty`, or do not use `ExecuteUpdate` for rows that must be audited that way.

**Strong answer:** I'd check the write path first — if it is `ExecuteUpdate` or raw SQL, interceptors are bypassed by design. For tracked saves, I'd verify the interceptor is registered as a singleton on `AddInterceptors`, that `ICurrentUser` returns the JWT subject in HTTP scope and `"System"` in hosted jobs (not a null from missing `HttpContext`), and that both sync and async `SavingChanges` overrides exist. I'd log entity type, id, and state — never the full graph on healthcare rows.

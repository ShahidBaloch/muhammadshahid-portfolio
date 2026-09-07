---
title: "EF Core SaveChanges Interceptors for Audit Logs"
description: "ISaveChangesInterceptor sets CreatedBy and ModifiedBy from the JWT. Hosted jobs have no HttpContext. ExecuteUpdate will not run this interceptor."
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

Every encounter row needed `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy`. Controllers stamped them by hand. One intern forgot on a PATCH. The audit trail said the row was created by nobody. **`ISaveChangesInterceptor`** is where I put that stamp so a handler cannot forget.

This is not a second [query-filter](/blog/ef-core-global-query-filters-soft-delete) article. Filters hide rows. Interceptors write columns on save. Shadow properties (`Property<DateTime>("ModifiedAt")` with no CLR property) work the same way inside `SavingChanges` via `entry.Property("ModifiedAt")` — I do not need a separate URL for that.

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

If CreatedBy is empty on production rows, [contact me](/contact). Either the interceptor is not registered, the job path skipped `ICurrentUser`, or the write used ExecuteUpdate.

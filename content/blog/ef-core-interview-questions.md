---
title: "EF Core Interview Questions (Concurrency, Filters, SaveChanges)"
description: "EF Core interview questions with production answers — RowVersion concurrency, global query filters, ExecuteUpdate vs SaveChanges, DbContext in tests, and tenant leaks. Not an N+1 tutorial."
date: "2026-09-07"
category: "interview-questions"
tags: ["Interview Questions", "EF Core", "SQL Server", "ASP.NET Core", ".NET", "Career"]
---

**EF Core interview questions** at senior level are not “what is `Include`.” Interviewers ask whether you can keep a clinic or marketplace database correct when two users save the same row, when a tenant filter is missing, and when a background job shares a `DbContext`.

This URL is **interview narration**. SQL-shaped performance (N+1, split queries, cartesian explosion, parameter sniffing, tracking vs identity resolution) lives in the [EF Core hub](/learning/ef-core). Do not retell those posts here. If the prompt is “the dashboard is slow,” start at [EF Core SQL performance](/blog/ef-core-sql-performance) and come back when they ask about **correctness**.

---

## Scenario 1: Two clinicians save the same encounter

**Prompt:** Two Angular tabs load the same encounter. Both PATCH `status`. Last write wins. How do you make that a conflict the API can show, not silent data loss?

### Weak answer

“Add a lock” with no row version, or “use a transaction” as if wrapping two independent HTTP requests in one `TransactionScope` were possible.

### Strong answer

Optimistic concurrency with a **`RowVersion` / `xmin` / `timestamp`** column that EF maps as a concurrency token. Each GET returns the token. Each PUT sends it back. The second save throws `DbUpdateConcurrencyException`. Map that to **409** with ProblemDetails, not 500.

```csharp
modelBuilder.Entity<Encounter>()
    .Property(e => e.RowVersion)
    .IsRowVersion();
```

```csharp
try
{
    await _db.SaveChangesAsync(cancellationToken);
}
catch (DbUpdateConcurrencyException)
{
    throw new ConcurrencyConflictException(encounterId);
}
```

**Prove it:** two integration tests against a real SQL database (or Testcontainers). Same `Id`, different `RowVersion`. One succeeds, one 409s. In-memory provider is a liar for this.

**Refuse:** pessimistic `UPDLOCK` on every read for a SPA. Clinicians leave tabs open. You lock the row for the lifetime of a coffee.

---

## Scenario 2: Global query filter that leaked a tenant

**Prompt:** `HasQueryFilter(e => e.ClinicId == _tenant.ClinicId)` is on `Encounter`. A nightly job emailed clinic B a CSV of clinic A’s encounters. How?

### Weak answer

“Filters are always applied.” They are not.

### Strong answer

I list the **escape hatches** out loud:

1. **`IgnoreQueryFilters()`** on a report query someone copied from a debug session
2. **Raw SQL** / `FromSqlRaw` that never saw the filter
3. **A `DbContext` constructed with a default tenant** (`Guid.Empty` or first clinic in the table) because the hosted service has no HTTP scope
4. **Navigation includes** from an unfiltered parent (`Clinic` loaded without a filter, then `.Encounters` accessed in memory)

Fix the job: create a scope, set tenant from the job payload, or use an explicit `Where(e => e.ClinicId == clinicId)` on exports and **log if `IgnoreQueryFilters` appears in a PR**.

I do not pretend a filter is a security boundary. Authorization still lives in policies. The filter is a seatbelt.

---

## Scenario 3: `SaveChanges` inside a `foreach`

**Prompt:** Import 4,000 fee-schedule rows. The code does `Add` + `SaveChangesAsync` per row. The request times out. What do you change, and what do you not change?

### Weak answer

“Use `AddRange` and one `SaveChanges`” as the entire answer, or “bulk insert library” without saying when.

### Strong answer

One `SaveChanges` per HTTP request is the default. Per-row save is N round-trips plus N change-tracker snapshots.

For a **true bulk import** I want `ExecuteInsert` / a bulk copy path, not 4,000 tracked entities. For a **small upsert** I batch:

```csharp
_db.FeeSchedules.AddRange(rows);
await _db.SaveChangesAsync(cancellationToken);
```

When the rows already exist, I prefer **`ExecuteUpdate`** for a set-based column change, not load-mutate-save:

```csharp
await _db.FeeSchedules
    .Where(f => f.ClinicId == clinicId && f.Year == year)
    .ExecuteUpdateAsync(
        s => s.SetProperty(f => f.IsActive, false),
        cancellationToken);
```

**Refuse:** `SaveChanges` in a loop “so we can return partial success” without a strategy. Either a transaction with a report of failures, or a staging table. Healthcare fee files that half-apply are worse than a 500.

---

## Scenario 4: Same entity, two tracked instances

**Prompt:** A PUT loads the encounter, then `_db.Update(dtoMappedEntity)` and `SaveChanges` throws: *another instance with the same key is already being tracked.* What happened?

### Weak answer

“Call `AsNoTracking` on the PUT.” Tracking on a write path is not the bug.

### Strong answer

You **loaded a tracked instance**, then attached a **second instance** with the same primary key (mapped from the Angular body). EF cannot have two tracked copies.

Pick one:

1. Load, mutate the tracked entity, save
2. Or attach/update **without** a prior tracked load (`ExecuteUpdate`, or `Update` on a disconnected graph with no previous `Find`)

```csharp
var encounter = await _db.Encounters.FirstAsync(e => e.Id == id, cancellationToken);
encounter.Status = body.Status;
await _db.SaveChangesAsync(cancellationToken);
```

Identity resolution on **reads** (`AsNoTrackingWithIdentityResolution`) is a different article: [AsNoTracking vs identity resolution](/blog/ef-core-asnotracking-vs-identity-resolution). Do not mix that story into a PUT.

---

## Scenario 5: `DbContext` in a singleton cache

**Prompt:** A `ReportCache` singleton injects `AppDbContext`. Intermittent “cannot access a disposed object” and, once, the wrong clinic’s numbers. Diagnose.

### Weak answer

“Make everything singleton” or “make everything scoped.”

### Strong answer

This is a **captive dependency**. `DbContext` is scoped. A singleton holds the first request’s context (or a disposed one). Tenant data rides along.

Fix: cache is singleton **or** scoped; context stays scoped. If the cache must be singleton, inject `IServiceScopeFactory` and open a scope per refresh. Full lifetime rules: [DI lifetimes](/blog/aspnet-core-dependency-injection). If the exception is actually “Unable to resolve service for type,” that is [the registration post](/blog/aspnet-core-unable-to-resolve-service).

---

## Scenario 6: Migrations in production

**Prompt:** App Service swap. API 500s: *pending model changes* or *could not apply migration*. How do you ship schema?

### Weak answer

“`Migrate()` in `Program.cs`” as a religion, or “never migrate in prod” without an alternative.

### Strong answer

I separate **schema** from **app start**:

- Generate SQL (`dotnet ef migrations script`) and run it in the release pipeline **before** the new bits take traffic
- Or a dedicated migrator job with a lock so two instances do not race
- `Database.Migrate()` at startup is acceptable for a **single-instance** internal tool, not for a slot swap with three instances

Pending model changes at runtime means someone edited entities and skipped `dotnet ef migrations add`. That is a CI gate, not a try/catch.

---

## Rapid-fire (30 seconds)

| Prompt | Answer I want |
|---|---|
| Why not the InMemory provider for concurrency tests? | No real transactions, no row versions you can trust |
| `EnsureCreated` vs migrations | `EnsureCreated` skips the migration history; do not mix in one database |
| Compiled queries | Hot path with a stable shape; not a substitute for indexes |
| Returning `IQueryable` from a repository | Callers can still `IgnoreQueryFilters` and `Include` the world |
| `AsNoTracking` on a write | You will reattach; usually the wrong default for PUT |

---

## How this differs from the other EF posts

- **This page:** correctness under concurrent writes, tenant filters, `SaveChanges` shape
- **[EF Core SQL performance](/blog/ef-core-sql-performance):** N+1, projections, indexes
- **[N+1 vs Include vs AsSplitQuery](/blog/ef-core-nplus1-include-vs-assplitquery):** which SQL you meant
- **[Cartesian explosion](/blog/ef-core-cartesian-explosion-multiple-include):** two collection Includes
- **[Parameter sniffing](/blog/ef-core-sql-server-parameter-sniffing):** one tenant fast, another slow

## Related reading

- [ASP.NET Core interview scenarios](/blog/aspnet-core-interview-questions-scenarios)
- [C# expert-level interview questions](/blog/csharp-expert-interview-questions)
- [Interview questions hub](/learning/interview-questions)
- [EF Core topic hub](/learning/ef-core)

Preparing an EF Core loop for a healthcare or marketplace API, or sitting one? [Contact me](/contact). Bring a `SaveChanges` failure, not a definition of `DbSet`.

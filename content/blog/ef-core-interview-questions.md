---
title: "EF Core Interview Questions"
description: "EF Core interview questions with production answers — entity relationships, RowVersion concurrency, global query filters, ExecuteUpdate vs SaveChanges, and tenant leaks."
date: "2026-09-07"
updated: "2026-09-11"
category: "interview-questions"
tags: ["Interview Questions", "EF Core", "SQL Server", "ASP.NET Core", ".NET", "Career"]
related:
  - ef-core-relationships
  - ef-core-optimistic-concurrency-token
  - ef-core-global-query-filters-soft-delete
  - ef-core-asnotracking-vs-identity-resolution
faq:
  - q: "What EF Core interview questions get asked at senior level?"
    a: "Correctness, not Include trivia: two users saving the same row, a global query filter that leaked a tenant, SaveChanges in a foreach, two tracked instances of one key, and a singleton holding a DbContext."
  - q: "What entity relationship interview questions come up with EF Core?"
    a: "How you map 1-1, 1-n, and n-n without leaking join tables into Angular; required vs optional dependents; and when owned types beat a fake 1-1. Rapid-fire table below — full mapping with code: EF Core relationships."
  - q: "How do you stop last-write-wins on an encounter?"
    a: "Map SQL Server rowversion as a concurrency token. GET returns it, PUT sends it back, second save throws DbUpdateConcurrencyException. Map that to 409, not 500. The how-to is the RowVersion article."
  - q: "Are query filters a security boundary?"
    a: "No. IgnoreQueryFilters, raw SQL, and a job DbContext with the wrong tenant still leak. Filters are a seatbelt. The wiring post is the query-filters article."
---

**EF Core interview questions** at senior level test whether you can keep a clinic or marketplace database **correct** under concurrent writes, missing tenant filters, and background jobs that share a `DbContext` — not whether you can define `Include`.

```text
Junior prompt                    Senior prompt
─────────────                    ─────────────
"What is Include?"               "Two tabs PATCH the same row — what happens?"
"Tracking vs no-tracking?"       "Nightly job emailed clinic B clinic A's data"
                                 "SaveChanges in a foreach on 4,000 rows"
                                 "Another instance with the same key is tracked"
```

**New to this** → start with [Scenario 1](#scenario-1-two-clinicians-save-the-same-encounter). **Merging a PR** → [rapid-fire table](#rapid-fire-30-seconds). **On-call / interview** → all scenarios below · [cross-questions](#cross-questions).

**Terms used here:** **Lost update** = two writers save the same row; last write wins without conflict detection. **Captive dependency** = a singleton holding a scoped `DbContext`. **Optimistic concurrency** = a row token (`rowversion`) that makes the second save fail with 409.

This URL is **interview narration**. SQL-shaped performance (N+1, split queries, cartesian explosion, parameter sniffing, tracking vs identity resolution) lives in the [EF Core hub](/learning/ef-core). If the prompt is "the dashboard is slow," start at [EF Core SQL performance](/blog/ef-core-sql-performance) and come back when they ask about **correctness**.

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
| 1-1 vs owned type | Owned type when the child has no independent identity (address on a clinic). Separate entity + FK when you query the child alone |
| 1-n | Required dependent with `HasMany` / `WithOne` and a real FK. Optional when the child can exist without the parent |
| Many-to-many | Skip a hand-rolled join entity until you need payload on the link (assigned-at, role). EF can hide the join table |

## Entity relationship interview questions

**Entity relationship interview questions** on EF Core panels are mapping questions, not ERD trivia:

1. **One-to-one** — optional dependent (`HasOne` / `WithOne` + unique FK) vs owned type (`OwnsOne`) when the child never lives alone.
2. **One-to-many** — collection navigation + FK. Required vs optional is a nullability decision that leaks into Angular forms (`clinicId` required on create).
3. **Many-to-many** — skip an explicit join entity until the link has data (who assigned the clinician, when). A payload-free n-n is a skip-level navigation; a join with `AssignedAt` is a first-class entity.
4. **Delete behavior** — `Restrict` on healthcare FKs until you have an explicit cascade story. Silent `Cascade` on a clinic wipe is a compliance incident.

If they draw a diagram and ask you to write `OnModelCreating`, talk FK, required/optional, and indexes — not "I would add a repository." Working mappings, delete behavior, and Angular DTOs: [EF Core relationships](/blog/ef-core-relationships).

---

## How this differs from the other EF posts

- **This page:** correctness under concurrent writes, tenant filters, `SaveChanges` shape
- **[EF Core relationships](/blog/ef-core-relationships):** 1-1 vs owned, 1-n, skip n-n vs join entity with payload
- **[EF Core SQL performance](/blog/ef-core-sql-performance):** N+1, projections, indexes
- **[N+1 vs Include vs AsSplitQuery](/blog/ef-core-nplus1-include-vs-assplitquery):** which SQL you meant
- **[Cartesian explosion](/blog/ef-core-cartesian-explosion-multiple-include):** two collection Includes
- **[Parameter sniffing](/blog/ef-core-sql-server-parameter-sniffing):** one tenant fast, another slow
- **[RowVersion](/blog/ef-core-optimistic-concurrency-token):** how to map the token and return 409
- **[Query filters](/blog/ef-core-global-query-filters-soft-delete):** how to wire `HasQueryFilter` without a leak
- **[ExecuteUpdate](/blog/ef-core-bulk-update-executeupdate):** set-based UPDATE when interceptors must not run

## Related reading

- [EF Core relationships (1-1 / 1-n / n-n)](/blog/ef-core-relationships)
- [ASP.NET Core interview scenarios](/blog/aspnet-core-interview-questions-scenarios)
- [C# expert-level interview questions](/blog/csharp-expert-interview-questions)
- [Interview questions hub](/learning/interview-questions)
- [EF Core topic hub](/learning/ef-core)

## Cross-questions

Interviewers often chain EF topics. These pairings test depth without repeating the dedicated posts:

| If they ask about… | Follow-up they might spring | Point them to |
|---|---|---|
| RowVersion / 409 | "Does RCSI fix lost updates?" | No — RCSI is blocking; concurrency token is this page, Scenario 1 |
| Query filter leak | "Is the filter a security boundary?" | No — Scenario 2; wiring is [query filters](/blog/ef-core-global-query-filters-soft-delete) |
| SaveChanges in foreach | "What about ExecuteUpdate?" | Scenario 3; implementation is [ExecuteUpdate](/blog/ef-core-bulk-update-executeupdate) |
| Two tracked instances | "What about AsNoTracking on reads?" | Different bug — [identity resolution](/blog/ef-core-asnotracking-vs-identity-resolution) |
| Singleton + DbContext | "How do you fix the cache?" | `IServiceScopeFactory` per refresh — Scenario 5 |
| Pending migrations at swap | "Migrate() in Program.cs?" | Scenario 6 — pipeline script, not startup on three instances |

Bring a `SaveChanges` failure or a tenant-leak story, not a definition of `DbSet`.

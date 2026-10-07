---
title: "EF Core and SQL Server Articles"
description: "EF Core articles for ASP.NET Core: N+1, cartesian explosion, migrations, interceptors, value conversions, deadlocks, TempDB contention, and SQL performance tuning from production."
---

## Introduction

This page is the **article map** for EF Core on ASP.NET Core. Open the symptom-specific post for deep answers — this index does not replace them.

| You want… | Open |
|---|---|
| **Performance checklist** | [EF Core SQL performance](/blog/ef-core-sql-performance) |
| **N+1 / Include / AsSplitQuery** | [N+1 guide](/blog/ef-core-nplus1-include-vs-assplitquery) |
| **Cartesian explosion** | [Two collection Includes](/blog/ef-core-cartesian-explosion-multiple-include) |
| **Relationships 1-1 / 1-n / n-n** | [EF relationships](/blog/ef-core-relationships) |
| **AsNoTracking identity** | [AsNoTracking](/blog/ef-core-asnotracking-vs-identity-resolution) |
| **Parameter sniffing** | [Parameter sniffing](/blog/ef-core-sql-server-parameter-sniffing) |
| **Migrations in production** | [EF Core migrations](/blog/ef-core-migrations-production) |
| **Audit log interceptors** | [SaveChanges interceptors](/blog/ef-core-interceptors-audit-log) |
| **Value conversions / enums** | [Value conversions](/blog/ef-core-value-conversions-enum) |
| **Bulk update / ExecuteUpdate** | [Bulk update](/blog/ef-core-bulk-update-executeupdate) |
| **Optimistic concurrency** | [Concurrency tokens](/blog/ef-core-optimistic-concurrency-token) |
| **Soft delete / global filters** | [Global query filters](/blog/ef-core-global-query-filters-soft-delete) |
| **Specification pattern** | [Specification pattern](/blog/ef-core-specification-pattern) |
| **IEnumerable vs IQueryable** | [IEnumerable vs IQueryable](/blog/ienumerable-vs-iqueryable-ef-core) |
| **Deadlocks / RCSI** | [Deadlocks and snapshot isolation](/blog/sql-server-deadlocks-snapshot-isolation) |
| **TempDB contention** | [TempDB contention](/blog/sql-server-tempdb-contention) |
| **Interview scenarios** | [EF Core interview questions](/blog/ef-core-interview-questions) |

## Mental model (one minute)

EF Core translates LINQ to SQL, tracks entities in a scoped `DbContext`, and materializes results. Most production pain falls into three categories:

**Query shape problems:** Too many round-trips (N+1), too many rows returned (missing filter, no paging), too many columns (`SELECT *` where a projection suffices). Start with the [performance checklist](/blog/ef-core-sql-performance).

**Concurrency problems:** Two requests updating the same row without a concurrency token cause silent last-write-wins data loss. Reader/writer deadlocks under load are usually fixed by enabling RCSI at the database level. See [optimistic concurrency](/blog/ef-core-optimistic-concurrency-token) and [deadlocks](/blog/sql-server-deadlocks-snapshot-isolation).

**Schema evolution problems:** `Database.Migrate()` on startup races when multiple pods boot simultaneously. A non-nullable column with a default can lock a table for minutes. The expand-and-contract pattern avoids downtime. See [migrations in production](/blog/ef-core-migrations-production).

## The LINQ trap

The most common EF Core mistake is declaring a repository return type as `IEnumerable<T>` when the underlying query is `IQueryable<T>`. The caller adds `.OrderBy(id).Take(20)` — those operators run in memory, after loading every row. The fix is to keep `IQueryable<T>` until you have applied all filters and paging, then materialize once with `ToListAsync`.

See [IEnumerable vs IQueryable](/blog/ienumerable-vs-iqueryable-ef-core) and [LINQ interview questions](/blog/linq-interview-questions) for the full set of patterns interviewers probe.

## Key rules

- **Change tracker is scoped.** Use one `DbContext` per request. Never share across threads.
- **`AsNoTracking` for read-only queries.** Removes change tracking overhead. Does not reduce SQL round-trips.
- **`ExecuteUpdateAsync` bypasses interceptors.** If your audit trail uses `ISaveChangesInterceptor`, bulk updates via `ExecuteUpdate` will not be stamped — set the audit columns in `SetProperty` explicitly.
- **Migrations are SQL.** Review the generated `Up()` method. Rename = drop + add unless you edit the migration. Non-nullable column with default = potential table lock on large tables.
- **TempDB is shared.** Sorts, hash joins, RCSI versioning, and temp tables all write to TempDB. One undivided TempDB file under heavy concurrent load produces `PAGELATCH_UP` waits — the API hangs while CPU looks idle.

## What to read next

Diagnosing a slow query? Start with [SQL performance](/blog/ef-core-sql-performance). Debugging a deadlock? Read [deadlocks and snapshot isolation](/blog/sql-server-deadlocks-snapshot-isolation). Preparing for an interview? Go to [EF Core interview questions](/blog/ef-core-interview-questions), then [LINQ interview questions](/blog/linq-interview-questions).

For the broader .NET architecture picture — where EF Core fits into Clean Architecture and CQRS — see the [architecture hub](/learning/architecture).

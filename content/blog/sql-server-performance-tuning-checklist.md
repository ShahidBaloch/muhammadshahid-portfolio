---
title: "SQL Server Performance Tuning: A Checklist From Real .NET Apps"
description: "SQL Server performance tuning in the order I actually do it: wait stats, Query Store, execution plans, indexes, and the EF Core habits behind most slow queries."
date: "2026-11-16"
category: "ef-core"
tags: ["SQL Server", "Performance", "EF Core", "Diagnostics"]
related:
  - ef-core-sql-server-parameter-sniffing
  - covering-index-ef-core
  - clustered-vs-nonclustered-index-sql-server
faq:
  - q: "Where should SQL Server performance tuning start?"
    a: "With wait stats and Query Store, not with indexes. Waits tell you what the server is waiting on. Query Store tells you which queries cost the most. Only then do you open an execution plan."
  - q: "Do more indexes make SQL Server faster?"
    a: "Reads, sometimes. Writes, never. Every index is extra work on insert, update and delete. Add one when a specific slow query needs it, and drop the ones nobody reads."
  - q: "Is EF Core slow compared to raw SQL?"
    a: "Rarely by itself. Most slow EF Core code loads too many rows or columns, or runs one query per row. Fix the query shape first. Switching to raw SQL comes last."
---

Most slow .NET apps I've been asked to look at had the same story. The app was fine for a year. Then the data grew, a few screens started taking five seconds, and someone suggested a bigger server. A bigger server sometimes buys a few months. It rarely fixes the cause.

This is the order I follow for SQL Server performance tuning. It's boring on purpose. Each step is cheap, and each one tells you whether the next step is worth doing.

## 1. Find out what the server is waiting on

Before touching a query, look at wait stats. SQL Server records every time a request has to wait for something: disk, CPU, a lock, memory, or another thread.

```sql
SELECT TOP (10)
    wait_type,
    wait_time_ms / 1000.0 AS wait_seconds,
    waiting_tasks_count
FROM sys.dm_os_wait_stats
WHERE wait_type NOT LIKE 'SLEEP%'
  AND wait_type NOT IN ('BROKER_TASK_STOP', 'XE_TIMER_EVENT', 'REQUEST_FOR_DEADLOCK_SEARCH',
                        'LAZYWRITER_SLEEP', 'SQLTRACE_BUFFER_FLUSH', 'CHECKPOINT_QUEUE')
ORDER BY wait_time_ms DESC;
```

These numbers add up from the last restart, so take two snapshots an hour apart and compare them. One snapshot on its own can mislead you.

A rough guide to what you'll see:

- **PAGEIOLATCH_\*** means reading pages from disk. Usually a query is scanning far more data than it needs.
- **LCK_M_\*** means blocking. One transaction holds locks that others are waiting for.
- **CXPACKET / CXCONSUMER** means parallel queries. Often a side effect of big scans, not the problem itself.
- **SOS_SCHEDULER_YIELD** points to CPU pressure.
- **PAGELATCH_\*** on database id 2 is [TempDB contention](/blog/sql-server-tempdb-contention), which is a file layout fix, not a query fix.

This step alone saves a lot of wasted SQL Server performance tuning effort. I've seen teams add index after index to fix what was really a blocking problem.

## 2. Let Query Store tell you which queries hurt

Turn on Query Store if it isn't already on. It has been built in since SQL Server 2016, and new databases in SQL Server 2022 get it by default.

```sql
ALTER DATABASE [YourDb] SET QUERY_STORE = ON;
ALTER DATABASE [YourDb] SET QUERY_STORE (OPERATION_MODE = READ_WRITE);
```

Give it a day of real traffic. Then open **Top Resource Consuming Queries** in SSMS and sort by *total* duration, not average. A query that takes 40 ms but runs 200,000 times a day costs more than a three-second report that runs twice.

In almost every SQL Server performance tuning job I've done, three to five queries caused most of the load. That short list is your work. Everything else can wait.

Query Store also keeps old plans. If a query was fast last week and slow today, you can see the plan change and force the old plan while you investigate. That's often how [parameter sniffing](/blog/ef-core-sql-server-parameter-sniffing) first shows up.

## 3. Read the execution plan, one query at a time

Get the actual execution plan (Ctrl+M in SSMS, then run the query). Read it right to left. Look for the thickest arrows and the operators with the highest cost. The usual suspects:

- An **Index Scan** or **Clustered Index Scan** on a big table where you expected a seek.
- A **Key Lookup** repeated thousands of times. The index found the rows but had to go back to the table for extra columns. A [covering index](/blog/covering-index-ef-core) fixes that.
- A big gap between **estimated and actual rows**. The optimizer planned for the wrong row count, usually because of stale statistics or a filter it can't read well.
- **Yellow warning triangles**: implicit conversions, spills to TempDB, missing statistics.

Also run `SET STATISTICS IO ON;`. Logical reads are the most honest number you have. If a query reads 400,000 pages to return 20 rows, you've found the problem, whatever the duration said on a quiet afternoon.

## 4. Fix the query shape before adding indexes

Some patterns stop SQL Server from using an index at all. I find at least one of these in nearly every codebase:

```sql
-- A function on the column: the index on CreatedAt can't be used for a seek
WHERE YEAR(CreatedAt) = 2026

-- Same filter, written so the index can be used
WHERE CreatedAt >= '2026-01-01' AND CreatedAt < '2027-01-01'
```

Others to watch for: leading wildcards (`LIKE '%smith'`), `OR` across different columns, `SELECT *` from wide tables, and comparing an `NVARCHAR` value to a `VARCHAR` column.

That last one catches .NET developers all the time. C# strings map to `NVARCHAR` by default. If the column is `VARCHAR`, SQL Server may convert the column value on every row before comparing. Tell EF Core the real column type:

```csharp
modelBuilder.Entity<Patient>()
    .Property(p => p.MedicalRecordNumber)
    .HasColumnType("varchar(20)");
```

## 5. Add the index the query needs, and only that one

Once the filter is index-friendly, an index usually turns a scan into a seek. Put equality columns first, then range columns, then `INCLUDE` the columns you only return.

```sql
CREATE NONCLUSTERED INDEX IX_Appointments_ClinicId_StartsAt
ON dbo.Appointments (ClinicId, StartsAt)
INCLUDE (PatientId, Status);
```

Don't blindly accept the "missing index" hints in the plan. They only think about one query, they ignore the indexes you already have, and they love to include half the table. Treat them as a hint, not an instruction.

Then look for indexes nobody reads:

```sql
SELECT OBJECT_NAME(s.object_id) AS table_name, i.name,
       s.user_seeks, s.user_scans, s.user_updates
FROM sys.dm_db_index_usage_stats s
JOIN sys.indexes i ON i.object_id = s.object_id AND i.index_id = s.index_id
WHERE s.database_id = DB_ID()
  AND i.index_id > 1                -- nonclustered only; never drop the table itself
  AND i.is_primary_key = 0
  AND i.is_unique_constraint = 0
  AND s.user_seeks + s.user_scans + s.user_lookups = 0
ORDER BY s.user_updates DESC;
```

An index with zero reads and a million updates is pure cost. These numbers reset when SQL Server restarts, so check them after a full business cycle (month-end reports included) before you drop anything. If you're not sure which kind of index a query needs, my post on [clustered vs nonclustered indexes](/blog/clustered-vs-nonclustered-index-sql-server) explains how SQL Server stores the rows underneath.

## 6. Check the EF Core side

A lot of SQL Server performance tuning work ends up as EF Core fixes. The database did exactly what the app asked. The app just asked badly. Things to check:

- **N+1 queries**: a loop that fires one query per row. Log SQL in development and count queries per request.
- **Whole entities** loaded when the screen needs four columns. Use a `Select` projection.
- **Change tracking on read-only queries**. Add `AsNoTracking()`.
- **Several `Include` calls** that multiply rows. See [AsSplitQuery for Cartesian explosion](/blog/ef-core-cartesian-explosion-multiple-include).
- **`ToList()` too early**, then filtering in memory.

```csharp
var rows = await db.Appointments
    .AsNoTracking()
    .Where(a => a.ClinicId == clinicId && a.StartsAt >= from && a.StartsAt < to)
    .OrderBy(a => a.StartsAt)
    .Select(a => new AppointmentRow(a.Id, a.StartsAt, a.Patient.FullName, a.Status))
    .ToListAsync(ct);
```

This query lines up with the index from step 5: equality on `ClinicId`, a range on `StartsAt`, and only the columns the index (plus one join) can serve.

## 7. Keep statistics and maintenance boring

Statistics tell the optimizer how many rows to expect. Stale statistics on a fast-growing table lead to bad plans. Keep auto update statistics on, and schedule a regular statistics job for big tables. Ola Hallengren's maintenance scripts are a common, sensible choice.

Index fragmentation matters much less on SSDs than older advice suggests. I don't rebuild indexes every night because a report says 30% fragmentation. Fresh statistics usually do more good.

## 8. Measure again, then stop

After each change, run the same query with `STATISTICS IO` and compare logical reads and duration. Check Query Store again a day later under real load. Write down what you changed and why. The next person to touch it, often you, will be glad you did.

Then stop. SQL Server performance tuning has no finish line, and chasing the last 5% usually costs more than it gives back. When the top queries are fast and the waits look healthy, go back to building features.

## What I'd skip

These are the SQL Server performance tuning habits I'd drop first:

- **Buying hardware** before reading a single plan.
- **Adding `NOLOCK` everywhere.** It can return uncommitted rows and even the same row twice. If readers and writers block each other, look at [READ_COMMITTED_SNAPSHOT](/blog/sql-server-deadlocks-snapshot-isolation) instead.
- **Rewriting the data layer** because "EF is slow". Fix the five worst queries first. If some paths still need hand-written SQL, [Dapper and EF Core can live side by side](/blog/dapper-vs-ef-core).

## My SQL Server performance tuning checklist

1. Wait stats: what is the server waiting on?
2. Query Store: top queries by total duration.
3. Actual execution plan and `STATISTICS IO` for each of them.
4. Index-friendly filters and matching data types.
5. One targeted index per problem query, and unused indexes dropped.
6. EF Core query shape: projections, no N+1, `AsNoTracking`.
7. Fresh statistics.
8. Measure, write it down, stop.

If your team would rather hand this to someone, I do this kind of work as a [freelance .NET developer](/hire-dotnet-developer).

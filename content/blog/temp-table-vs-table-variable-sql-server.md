---
title: "Temp Table vs Table Variable in SQL Server: Which One to Use"
description: "Temp table vs table variable in SQL Server: statistics, indexes, row estimates, transactions, recompiles, and a simple rule for picking one in stored procedures."
date: "2026-11-16"
category: "ef-core"
tags: ["SQL Server", "T-SQL", "Performance"]
related:
  - sql-server-tempdb-contention
  - sql-server-performance-tuning-checklist
  - sql-server-window-functions
faq:
  - q: "Is a table variable stored in memory?"
    a: "No. This is a common myth. Both #temp tables and @table variables are stored in TempDB. Small ones of either kind may stay in memory, but neither is guaranteed to."
  - q: "Which is faster, a temp table or a table variable?"
    a: "For small row counts the difference is tiny. For larger sets, temp tables usually win because they have statistics, so SQL Server picks better join and memory plans."
  - q: "Do table variables roll back in a transaction?"
    a: "No. Changes to a table variable survive a ROLLBACK. Changes to a temp table are rolled back. That makes table variables handy for keeping log rows when a transaction fails."
---

The temp table vs table variable question comes up in almost every codebase that has stored procedures. Usually it's settled by habit: one developer always writes `#temp`, another always writes `@table`. Both work. But on a big data set, the wrong choice can turn a two-second report into a two-minute one, and it's not always obvious why.

## The two of them, side by side

```sql
-- Temp table
CREATE TABLE #Orders (OrderId int PRIMARY KEY, CustomerId int, Total decimal(18,2));

-- Table variable
DECLARE @Orders TABLE (OrderId int PRIMARY KEY, CustomerId int, Total decimal(18,2));
```

They look almost the same. Under the hood, they differ in ways that matter:

| | `#temp` table | `@table` variable |
|---|---|---|
| Stored in | TempDB | TempDB (yes, really) |
| Statistics | Yes | No column statistics |
| Row estimate | Based on real stats | Fixed guess (see below) |
| Indexes | Any, added any time | Inline only, declared up front |
| Rolls back with a transaction | Yes | No |
| Causes recompiles | Can | Rarely |
| Scope | Session / procedure and the procs it calls | Current batch only |
| Can be passed as a parameter | No | Yes, as a table-valued parameter type |

## The myth: "table variables live in memory"

You'll still find this in old blog posts and Stack Overflow answers. It isn't true. Both kinds are created in TempDB. A small one of either type may never be written to disk, because SQL Server caches pages in memory anyway. So memory isn't a reason to pick a side in the temp table vs table variable choice.

## The real difference: statistics and row estimates

This is what decides most temp table vs table variable debates on real data.

A temp table has statistics, just like a normal table. When you join it to `dbo.Customers`, SQL Server knows roughly how many rows it holds and how the values are spread, so it can pick a hash join for 200,000 rows or a nested loop for 20.

A table variable has no column statistics. Before SQL Server 2019, the optimizer assumed it held **one row**, whatever was actually in it. Load 500,000 rows into `@Orders`, join it to another big table, and SQL Server builds a plan for one row: nested loops and a tiny memory grant, so any sort or hash later in the plan spills to TempDB. That's the two-minute report.

SQL Server 2019 added **table variable deferred compilation** (on at database compatibility level 150 and above). Now the optimizer waits until the first time the statement runs and uses the real row count. That helps a lot, but the plan is then reused for later runs, so a first run with 10 rows can give a bad plan for a later run with 500,000 (much like parameter sniffing). And it's still a count, not a distribution. The estimates on filters and joins can still be far off.

```sql
-- Check your compatibility level
SELECT name, compatibility_level FROM sys.databases WHERE name = DB_NAME();
```

## Indexes

On a temp table you can add an index whenever it makes sense, including after loading the data:

```sql
INSERT INTO #Orders (OrderId, CustomerId, Total)
SELECT Id, CustomerId, Total FROM dbo.Orders WHERE CreatedAt >= @from;

CREATE INDEX IX_Orders_CustomerId ON #Orders (CustomerId);
```

A table variable can only have indexes declared inline when you create it, like a `PRIMARY KEY`, a `UNIQUE` constraint, or an `INDEX` clause (SQL Server 2014 and later). Since there are still no column statistics on those indexes, they help less than you might expect.

## Transactions: a useful quirk

Table variables ignore `ROLLBACK`:

```sql
DECLARE @Log TABLE (Step varchar(50), At datetime2 DEFAULT sysdatetime());

BEGIN TRAN;
    INSERT INTO @Log (Step) VALUES ('Started import');
    -- ... something fails
ROLLBACK;

SELECT * FROM @Log; -- still has 'Started import'
```

That's handy when you want to keep a record of what happened inside a transaction that failed, and then write it to a real log table afterwards. With a temp table, the log rows would be gone.

## Recompiles

Creating and loading a temp table can trigger statement recompiles when row counts change a lot. On a procedure called thousands of times a minute, that CPU cost can add up. Table variables rarely cause recompiles, which is one reason they're a decent fit for small, very frequent operations.

If you're seeing allocation waits on database id 2 under heavy load, the problem is TempDB file layout, not your choice of temp object. See [TempDB contention](/blog/sql-server-tempdb-contention).

## My rule of thumb

For the temp table vs table variable choice, I use this:

- **Use a table variable** for small sets (roughly under a few hundred rows), for table-valued parameters, for procedures called very often, and when you need data to survive a rollback.
- **Use a temp table** for anything larger, anything you'll join to big tables, anything that needs an index added after loading, and any intermediate result in a reporting query.
- **When unsure, test both** with `SET STATISTICS IO ON` and the actual execution plan, using a realistic amount of data. Look at estimated vs actual rows on the operators that read the temp object.

## Where EF Core fits in

Most EF Core apps never create either one directly. You'll meet them when calling stored procedures, and through **table-valued parameters** if you pass a list of IDs to SQL Server. For large ID lists, a TVP backed by a table type is much better than a giant `IN (...)` clause:

```sql
CREATE TYPE dbo.IntList AS TABLE (Id int PRIMARY KEY);
```

Inside the procedure, a TVP is read-only and, like a table variable, has no column statistics. So if a procedure receives 50,000 IDs through a TVP and joins them to big tables, copying them into a `#temp` table first is often the fix.

## Summary

In the temp table vs table variable decision, remember that both live in TempDB. Temp tables have statistics and flexible indexes, so they're better for bigger data and joins. Table variables are lighter, don't recompile often, and survive rollbacks, so they suit small sets and parameters. When a stored procedure is slow and it uses a table variable full of rows, check the row estimates first. Then try switching it to a temp table. For the broader process of finding slow queries, see my [SQL Server performance tuning checklist](/blog/sql-server-performance-tuning-checklist).

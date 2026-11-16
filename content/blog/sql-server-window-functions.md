---
title: "SQL Server Window Functions: ROW_NUMBER, RANK, and Running Totals"
description: "SQL Server window functions with real examples: ROW_NUMBER for latest-per-group, RANK vs DENSE_RANK, running totals, LAG and LEAD, and how to call them from EF Core."
date: "2026-11-16"
category: "ef-core"
tags: ["SQL Server", "T-SQL", "EF Core", "Performance"]
related:
  - sql-server-performance-tuning-checklist
  - clustered-vs-nonclustered-index-sql-server
  - cursor-vs-offset-pagination-aspnet-core
faq:
  - q: "What is a window function in SQL Server?"
    a: "A function that calculates a value across a set of rows related to the current row, without collapsing those rows into one like GROUP BY does. You define the set with OVER (PARTITION BY ... ORDER BY ...)."
  - q: "What is the difference between ROW_NUMBER, RANK and DENSE_RANK?"
    a: "ROW_NUMBER gives every row a unique number, even on ties. RANK gives tied rows the same number and then skips (1, 1, 3). DENSE_RANK gives ties the same number without gaps (1, 1, 2)."
  - q: "Can I use window functions in a WHERE clause?"
    a: "No. Window functions are calculated after WHERE. Put the window function in a CTE or subquery, then filter on its result in the outer query."
---

SQL Server window functions solve a whole family of problems that people usually fix with loops in C#, cursors, or self-joins that get slower every month. "Latest order per customer", "rank sales reps by region", "running balance per account" are all one query once you know the pattern.

## GROUP BY collapses rows. Window functions don't.

That's the key difference. `GROUP BY` turns many rows into one row per group. Window functions keep every row and add a calculated column next to it.

```sql
SELECT CustomerId, OrderId, Total,
       SUM(Total) OVER (PARTITION BY CustomerId) AS CustomerTotal
FROM dbo.Orders;
```

Every order is still there, and each one also shows its customer's total. The `OVER (...)` part defines the "window":

- **`PARTITION BY`** splits rows into groups (like GROUP BY, but without collapsing).
- **`ORDER BY`** sets the order inside each group, which matters for numbering and running totals.
- An optional **frame** (`ROWS BETWEEN ...`) limits which rows in the group count.

## ROW_NUMBER: the latest row per group

Of all the SQL Server window functions, this is the one I write most often. Say you want each patient's most recent appointment:

```sql
WITH Ranked AS (
    SELECT a.*,
           ROW_NUMBER() OVER (PARTITION BY PatientId ORDER BY StartsAt DESC, Id DESC) AS rn
    FROM dbo.Appointments a
)
SELECT *
FROM Ranked
WHERE rn = 1;
```

`ROW_NUMBER` numbers each patient's appointments from newest to oldest, and the outer query keeps number 1. You can't filter on `rn` in the same `SELECT`, because window functions run after `WHERE`. That's why it goes in a CTE.

For this to be fast, give SQL Server an index that matches the window: `(PatientId, StartsAt DESC)`. Then it can read the rows already in order instead of sorting them. If the plan shows a big **Sort** operator before the window, that's the index you're missing.

## RANK vs DENSE_RANK vs ROW_NUMBER

They only differ on ties:

```sql
SELECT Rep, Sales,
       ROW_NUMBER() OVER (ORDER BY Sales DESC) AS RowNum,
       RANK()       OVER (ORDER BY Sales DESC) AS Rnk,
       DENSE_RANK() OVER (ORDER BY Sales DESC) AS DenseRnk
FROM dbo.RepSales;
```

| Rep | Sales | ROW_NUMBER | RANK | DENSE_RANK |
|---|---|---|---|---|
| Ali | 900 | 1 | 1 | 1 |
| Sara | 900 | 2 | 1 | 1 |
| Omar | 700 | 3 | 3 | 2 |

Use `ROW_NUMBER` when you need exactly one row per position (deduplication, latest-per-group). Use `RANK` for competition-style rankings. Use `DENSE_RANK` for "top 3 price levels" where ties shouldn't use up places.

A tip from experience: `ROW_NUMBER` with ties gives an arbitrary winner, and it can change between runs. Add a tiebreaker column to the `ORDER BY` (like `Id`) so results are stable.

## Running totals

```sql
SELECT AccountId, PostedAt, Amount,
       SUM(Amount) OVER (
           PARTITION BY AccountId
           ORDER BY PostedAt, Id
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
       ) AS Balance
FROM dbo.LedgerEntries;
```

Always write the `ROWS BETWEEN` frame for running totals. If you leave it out, SQL Server uses `RANGE` by default, which treats rows with the same `PostedAt` as one group (giving odd results on ties) and is usually slower because it spools to disk.

A moving average is the same idea with a smaller frame: `ROWS BETWEEN 6 PRECEDING AND CURRENT ROW` gives you a 7-day average if you have one row per day.

## LAG and LEAD: compare with the previous or next row

```sql
SELECT DeviceId, ReadAt, Value,
       Value - LAG(Value) OVER (PARTITION BY DeviceId ORDER BY ReadAt) AS ChangeSinceLast
FROM dbo.Readings;
```

`LAG` looks back, `LEAD` looks forward. They replace the self-join on "previous row" that every older codebase seems to have. For the first row in each partition, `LAG` returns `NULL`, or a default you pass as the third argument.

## Paging and percentages

A few more SQL Server window functions that come in handy:

- **`COUNT(*) OVER ()`** returns the total row count on every row, so a paged API can return the page and the total in one query.
- **`NTILE(4) OVER (ORDER BY Total)`** splits rows into quartiles.
- **`Total * 100.0 / SUM(Total) OVER (PARTITION BY Region)`** gives each row's share of its region.

For deep paging on large tables, prefer keyset pagination over `OFFSET`. I compare both in [cursor vs offset pagination](/blog/cursor-vs-offset-pagination-aspnet-core).

## Using window functions from EF Core

Recent EF Core versions translate some window-style queries, but not all of them, and the SQL can be hard to predict. For anything beyond simple cases, I write the SQL and map it to a keyless type:

```csharp
public class LatestAppointment
{
    public int PatientId { get; init; }
    public int AppointmentId { get; init; }
    public DateTime StartsAt { get; init; }
}

var latest = await db.Database
    .SqlQuery<LatestAppointment>($"""
        SELECT PatientId, Id AS AppointmentId, StartsAt
        FROM (
            SELECT PatientId, Id, StartsAt,
                   ROW_NUMBER() OVER (PARTITION BY PatientId ORDER BY StartsAt DESC, Id DESC) AS rn
            FROM dbo.Appointments
            WHERE ClinicId = {clinicId}
        ) x
        WHERE rn = 1
        """)
    .ToListAsync(ct);
```

`SqlQuery<T>` with an interpolated string turns `{clinicId}` into a real SQL parameter, so this is safe from SQL injection. It works for unmapped types from EF Core 8 onwards.

## When not to reach for them

Window functions aren't free. Each different `PARTITION BY`/`ORDER BY` combination can mean another sort. If a query has five windows with five different orders, check the plan before shipping it. And if you only need one number per group, plain `GROUP BY` is simpler and often faster.

That said, once you're comfortable with SQL Server window functions, you'll find yourself deleting a lot of C# loops and self-joins. That's usually a good trade. If performance is the worry, my [SQL Server performance tuning checklist](/blog/sql-server-performance-tuning-checklist) covers how to read the plans.

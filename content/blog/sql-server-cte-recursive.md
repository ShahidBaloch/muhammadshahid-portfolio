---
title: "SQL Server CTE Explained: WITH Queries and Recursive CTEs"
description: "SQL Server CTE basics and beyond: readable WITH queries, deleting duplicates, recursive CTEs for hierarchies, MAXRECURSION, and CTE vs temp table performance."
date: "2026-11-16"
category: "ef-core"
tags: ["SQL Server", "T-SQL", "Performance"]
related:
  - sql-server-window-functions
  - temp-table-vs-table-variable-sql-server
  - sql-server-performance-tuning-checklist
faq:
  - q: "What is a CTE in SQL Server?"
    a: "A Common Table Expression is a named, temporary result set defined with WITH at the start of a statement. It exists only for that one statement and makes complex queries easier to read."
  - q: "Is a CTE faster than a subquery?"
    a: "Usually they perform the same. SQL Server inlines a non-recursive CTE into the main query, just like a derived table. A CTE is about readability, not speed."
  - q: "What is the default recursion limit for a recursive CTE?"
    a: "100 levels. Change it with OPTION (MAXRECURSION n), where 0 means no limit. Keep a limit in place so a data loop can't run forever."
---

A SQL Server CTE (Common Table Expression) is one of the best tools for making a long query readable. It's also one of the most misunderstood. People expect it to be cached like a temp table, or faster than a subquery, and it's neither. Here's what it really does and where it shines.

## The basic shape

```sql
WITH RecentOrders AS (
    SELECT CustomerId, Total
    FROM dbo.Orders
    WHERE CreatedAt >= DATEADD(day, -30, SYSUTCDATETIME())
)
SELECT CustomerId, SUM(Total) AS Last30Days
FROM RecentOrders
GROUP BY CustomerId;
```

`RecentOrders` is a named query that exists only for the statement right after it. You can define several, separated by commas, and later ones can use earlier ones:

```sql
WITH Recent AS (...),
     Totals AS (SELECT CustomerId, SUM(Total) AS Amount FROM Recent GROUP BY CustomerId)
SELECT c.Name, t.Amount
FROM Totals t
JOIN dbo.Customers c ON c.Id = t.CustomerId;
```

Read top to bottom, it tells a story: take recent orders, total them per customer, add names. That readability is the main reason to use a SQL Server CTE.

One small gotcha: if the statement before `WITH` doesn't end with a semicolon, you get a syntax error. That's why you often see `;WITH` in older code.

## A CTE is not a temp table

This is the part people get wrong. SQL Server does **not** run the CTE once and store the result. It folds the CTE into the main query, like a view or a derived table. If you reference the same CTE three times, its query may be evaluated three times.

```sql
WITH Expensive AS (SELECT ... heavy aggregation ...)
SELECT * FROM Expensive e1 JOIN Expensive e2 ON ...; -- may run the aggregation twice
```

When you need to reuse a heavy intermediate result, or you want statistics and an index on it, load it into a temp table instead. I compare the options in [temp table vs table variable](/blog/temp-table-vs-table-variable-sql-server).

## Filtering on window functions

Window functions can't go in a `WHERE` clause, so a CTE is the standard way to filter on them:

```sql
WITH Ranked AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY CustomerId ORDER BY CreatedAt DESC, Id DESC) AS rn
    FROM dbo.Orders
)
SELECT * FROM Ranked WHERE rn = 1; -- latest order per customer
```

More patterns like this are in my post on [SQL Server window functions](/blog/sql-server-window-functions).

## Deleting duplicates

A neat trick: you can update or delete through a SQL Server CTE that reads from a single table, and the change hits the base table.

```sql
WITH Dupes AS (
    SELECT ROW_NUMBER() OVER (PARTITION BY Email ORDER BY CreatedAt) AS rn
    FROM dbo.Subscribers
)
DELETE FROM Dupes WHERE rn > 1;
```

This keeps the oldest row for each email and removes the rest. Run it as a `SELECT` first to see what will go, and do it inside a transaction on production data.

## Recursive CTEs: walking a hierarchy

This is where a CTE does something a plain subquery can't. A recursive CTE has two parts joined by `UNION ALL`: an **anchor** (the starting rows) and a **recursive member** that refers back to the CTE itself.

Org charts, category trees, folder structures and bill-of-materials all fit:

```sql
WITH OrgChart AS (
    -- anchor: the top of the tree
    SELECT Id, Name, ManagerId, 0 AS Depth
    FROM dbo.Employees
    WHERE ManagerId IS NULL

    UNION ALL

    -- recursive member: everyone who reports to a row already found
    SELECT e.Id, e.Name, e.ManagerId, o.Depth + 1
    FROM dbo.Employees e
    JOIN OrgChart o ON e.ManagerId = o.Id
)
SELECT * FROM OrgChart
ORDER BY Depth, Name
OPTION (MAXRECURSION 50);
```

SQL Server runs the anchor, then keeps running the recursive part on the rows found in the previous round until no new rows come back.

## The recursion limit protects you

By default a recursive CTE stops with an error after 100 levels. That's a safety net: if the data has a loop (A manages B, B manages A), the query would otherwise never end. Set `MAXRECURSION` to a sensible number for your data. Use `0` (unlimited) only when you're sure the data can't contain a cycle.

For hierarchies you query constantly, look at an index on `ManagerId`, or the built-in `hierarchyid` type if the tree is large and rarely changes shape.

## Generating rows

Recursive CTEs also generate sequences, like a calendar for a report with no gaps:

```sql
WITH Days AS (
    SELECT CAST('2026-11-01' AS date) AS Day
    UNION ALL
    SELECT DATEADD(day, 1, Day) FROM Days WHERE Day < '2026-11-30'
)
SELECT d.Day, COUNT(o.Id) AS Orders
FROM Days d
LEFT JOIN dbo.Orders o ON CAST(o.CreatedAt AS date) = d.Day
GROUP BY d.Day;
```

That works fine for a month. For long ranges, a permanent calendar table or `GENERATE_SERIES` (SQL Server 2022 and later) is faster. Also note that `CAST(o.CreatedAt AS date)` in the join is one of the few casts SQL Server can still use an index for, but a plain date range join is safer on very large tables.

## Using CTEs from EF Core

EF Core doesn't write CTEs for you from LINQ, but you can use one in raw SQL with `FromSql` or `Database.SqlQuery<T>`, with interpolated parameters. One rule: EF Core can wrap your SQL in a subquery when you compose more LINQ on top, and a statement starting with `WITH` can't be wrapped. So either don't compose on top of it, or call `AsEnumerable()` after the raw query and do any extra work in memory on the (small) result.

## Summary

Use a SQL Server CTE to break a long query into readable steps, to filter on window functions, to delete duplicates, and, with recursion, to walk trees and generate rows. Don't use it as a cache. If you need an intermediate result reused or indexed, a temp table is the better tool. When performance is the question, check the plan; my [SQL Server performance tuning checklist](/blog/sql-server-performance-tuning-checklist) shows how.

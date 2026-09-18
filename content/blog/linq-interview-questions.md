---
title: "LINQ Interview Questions for C# and EF Core"
description: "LINQ interview questions with scenario answers for C# and EF Core: deferred execution, IQueryable SQL, client evaluation, and queries that look fine in memory and fail in production."
date: "2026-09-18"
updated: "2026-09-18"
category: "interview-questions"
tags: ["Interview Questions", "C#", "LINQ", "EF Core"]
related:
  - ef-core-interview-questions
  - ef-core-sql-performance
  - csharp-oop-interview-questions
faq:
  - q: "What LINQ interview questions show up for .NET roles?"
    a: "Deferred execution, the difference between LINQ to Objects and LINQ to Entities, multiple enumeration, and a Where clause that silently runs in memory. They want the SQL consequence, not the method name."
  - q: "Why does my LINQ query hit the database twice?"
    a: "The query is deferred. Each foreach, Count, or ToList executes it. Materialize once with ToListAsync when you need the same rows twice."
  - q: "What is wrong with calling a local method inside an EF Core Where?"
    a: "EF Core cannot translate an arbitrary C# method to SQL. It either throws or, on older versions, client-evaluates and loads the whole table. Keep the predicate translatable."
---

**This page is for LINQ interview questions** that follow the "what does Where do" warm-up. The interviewer wants to know whether your query runs in SQL or in the process.

EF Core context: [EF Core interview questions](/blog/ef-core-interview-questions) and [SQL performance](/blog/ef-core-sql-performance). Hub: [interview questions](/learning/interview-questions).

## Real-world analogy

LINQ is a waiter writing down an order. The pad is the query. The kitchen has not cooked anything until the waiter tears off the sheet and hands it in. That tear is `ToList` or `First`. Adding "no onions" after the kitchen has plated is a second pass on the plate, not a change to the ticket. In EF Core the kitchen is SQL Server. In a `List` the kitchen is the process you are already standing in.

## Worked example

A reviewer sees `orders.Where(o => o.IsOpen).Select(o => o.Total)` and asks why the page is slow. The variable `orders` is already a `List<Order>` from an earlier `ToList`. The `Where` is C#, and the totals are summed after every open order was loaded, including the columns the page never shows. The fix is to filter and project before the materializing call, then `Sum` in SQL if the page only needs the number. Deferred execution is the reason this compiled and still did the wrong thing: nothing ran at the `Where` line.

## Short answers

| Question | Crisp answer |
|---|---|
| Deferred execution | The query runs when you iterate or call ToList, not when you write Where |
| LINQ to Objects | `IEnumerable`. Runs in memory |
| LINQ to Entities | `IQueryable`. Builds SQL until you materialize |
| Multiple enumeration | Two loops, two executions |
| Client evaluation | A predicate EF cannot translate, so it pulls rows into the app |

## The questions they ask

1. Why `customers.Where(...)` does not hit SQL yet
2. Why the same query runs twice
3. Why `DateTime.Now` inside a query is a bug
4. Why a local `IsVip` method blows up or scans the table
5. `Select` before `Where` and what that does to SQL
6. `First` versus `FirstOrDefault` versus `Single`

## Scenario 1: deferred execution

**Prompt:** This code logs one SQL. Then the method counts and then loops. Production shows two queries. Why?

```csharp
IQueryable<Order> open = db.Orders.Where(o => o.Status == OrderStatus.Open);
var count = await open.CountAsync(ct);
var page = await open.OrderBy(o => o.Id).Take(20).ToListAsync(ct);
```

**Answer:** `CountAsync` and `ToListAsync` each execute. That is correct if you need both a count and a page, and you should say so. The bug is assuming `Where` already loaded rows. If you only need the page, do not count. If you need both, two round-trips are honest. Do not `.ToList()` the whole table to count in memory.

## Scenario 2: client evaluation

**Prompt:** `Where(o => IsOverdue(o))` worked in a unit test with a `List<Order>` and timed out in production.

**Answer:** The test was LINQ to Objects. EF Core needs a translatable expression. `IsOverdue` is an opaque method. Write the comparison inline (`o.DueOn < DateTime.UtcNow`) or use a mapped computed column. Do not "fix" it by `ToList()` then filtering. That downloads the table.

## Scenario 3: First, FirstOrDefault, Single

**Prompt:** `SingleAsync` on a lookup by email starts throwing in a migration.

**Answer:** `Single` means zero or one, and it throws if there are two. After a bad import there are two rows. `First` hides the data bug. Say which one you want: `Single` when the invariant is one row, `FirstOrDefault` when missing is normal. Do not use `Single` as a synonym for `First`.

Related: [IEnumerable vs IQueryable](/blog/ienumerable-vs-iqueryable-ef-core).

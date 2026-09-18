---
title: "IEnumerable vs IQueryable vs ICollection in EF Core"
description: "IEnumerable vs IQueryable vs ICollection in EF Core: which one still builds SQL, which one loads the table, and which one is only a navigation collection."
date: "2026-09-18"
updated: "2026-09-18"
category: "ef-core"
tags: ["EF Core", "LINQ", "C#", "ASP.NET Core"]
related:
  - linq-interview-questions
  - ef-core-interview-questions
  - ef-core-sql-performance
  - ef-core-asnotracking-vs-identity-resolution
faq:
  - q: "What is the difference between IEnumerable and IQueryable in EF Core?"
    a: "IQueryable is a query EF Core can still translate to SQL. IEnumerable is an in-memory sequence. Once you switch to IEnumerable, further Where and Select run in the process, not in SQL Server."
  - q: "Is ICollection the same as IQueryable?"
    a: "No. ICollection is a navigation or a mutable list of entities already loaded. It does not build SQL. IQueryable is the unexecuted query."
  - q: "Why does AsEnumerable change the SQL?"
    a: "AsEnumerable switches the rest of the chain to LINQ to Objects. Anything after it filters rows already pulled into memory."
---

People search this because a query that looked filtered in C# returned the whole table. The type on the variable is the answer.

Hub: [EF Core](/learning/ef-core). Related: [LINQ interview questions](/blog/linq-interview-questions), [SQL performance](/blog/ef-core-sql-performance).

## Real-world analogy

A library catalog is `IQueryable`. You tell the desk "the red books, first twenty" and they search the shelves. `IEnumerable` is the stack of books already in your arms. Any further sorting happens in your living room, after you carried the whole shelf home. `ICollection` is the bookshelf in the room: you can add a book, but it is not a catalog and it does not phone the library.

## Worked example

An order list is supposed to show 20 open orders. The repository method is declared as `IEnumerable<Order>` and the body is `db.Orders.Where(status is Open)`. The page calls `.OrderBy(id).Take(20)`. Because the declared type is `IEnumerable`, that `Take` never becomes SQL. The network trace shows one query with no `TOP`, then the process throws away every row after the first 20. Change the return type to `IQueryable` until the `Take`, or finish the query inside the method and return `IReadOnlyList<Order>`.

## The three types

| Type | What it is | Further LINQ runs in |
|---|---|---|
| `IQueryable<T>` | Expression tree EF Core can translate | SQL, until you materialize |
| `IEnumerable<T>` | An in-memory sequence | The .NET process |
| `ICollection<T>` | A loaded navigation or list you can add to | Already in memory. Not a query |

`IList<T>` and `List<T>` are also in-memory. They are not query providers.

## The line that changes the database call

```csharp
IQueryable<Order> query = db.Orders.Where(o => o.Status == OrderStatus.Open);

// Still SQL: Take is on IQueryable
var page = await query.OrderBy(o => o.Id).Take(20).ToListAsync(ct);

// No longer SQL. Where after AsEnumerable filters the list you already loaded.
IEnumerable<Order> local = query.AsEnumerable();
var urgent = local.Where(o => o.Priority > 5);
```

If you `AsEnumerable` before `Take(20)`, SQL has no `TOP`. You loaded every open order, then took 20 in memory.

## Repository methods

Return `IQueryable` only if the caller is allowed to compose SQL and you accept that they can add `Include` you did not plan. Return `IReadOnlyList<T>` (materialized) when the method is a use case: "open orders for this customer, page 1."

Do not return `IEnumerable` from a repository if the implementation is still `IQueryable`. Callers will compose, the switch happens at compile time based on the declared type, and filters become in-memory. If the signature says `IEnumerable<Order>`, EF Core materializes before the caller's `Where`.

```csharp
// Dangerous signature: caller's Where never becomes SQL
public IEnumerable<Order> OpenOrders() =>
    db.Orders.Where(o => o.Status == OrderStatus.Open);
```

## ICollection on entities

`ICollection<OrderLine> Lines` means those lines are a navigation. Accessing `order.Lines` does not build a query by itself. If lazy loading is off and you did not `Include` or explicitly load, `Lines` is empty, not "the query." Do not treat a navigation as `IQueryable`.

## What to say in a review

- Keep filters, order, and paging on `IQueryable`.
- Call `ToListAsync` once, at the boundary.
- Do not `AsEnumerable` to call a C# method. Rewrite the predicate so SQL can do it, or filter a page you already bounded.

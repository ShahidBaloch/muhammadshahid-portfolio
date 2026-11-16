---
title: "LINQ Group By in C#: GroupBy in Memory vs EF Core, With Examples"
description: "LINQ group by explained with examples: grouping in memory, multiple keys, counts and sums, and what EF Core can and can't translate to SQL GROUP BY."
date: "2026-11-16"
category: "csharp"
tags: ["C#", "LINQ", "EF Core"]
related:
  - ienumerable-vs-iqueryable-ef-core
  - linq-interview-questions
  - sql-server-window-functions
faq:
  - q: "What does LINQ GroupBy return?"
    a: "A sequence of IGrouping<TKey, TElement>. Each group has a Key property and is itself a sequence of the items that share that key."
  - q: "Why does EF Core throw on my GroupBy query?"
    a: "EF Core translates GroupBy to SQL GROUP BY when you select the key plus aggregates like Count, Sum or Max. Returning the groups themselves only works as the last operator (EF Core 7 and later) and loads every row. Other shapes that use the grouped items can fail to translate."
  - q: "How do I group by multiple columns in LINQ?"
    a: "Group by an anonymous type or a tuple: GroupBy(o => new { o.Year, o.Region }). Then use g.Key.Year and g.Key.Region in the Select."
---

LINQ group by, written as the `GroupBy` method, is one of those features that behaves a little differently depending on where your data lives. On a `List<T>` it does exactly what you'd expect. On an EF Core `DbSet`, the same code can run as fast SQL, or throw at runtime, or quietly pull a whole table into memory. Here's how to tell which one you'll get.

## What GroupBy gives you

```csharp
var orders = new List<Order>
{
    new(1, "Lahore", 120m),
    new(2, "Karachi", 80m),
    new(3, "Lahore", 45m),
};

var byCity = orders.GroupBy(o => o.City);

foreach (var group in byCity)
{
    Console.WriteLine($"{group.Key}: {group.Count()} orders, {group.Sum(o => o.Total)} total");
}
// Lahore: 2 orders, 165 total
// Karachi: 1 orders, 80 total
```

Each group is an `IGrouping<string, Order>`. It has a `Key` (the city) and you can loop over it like any other sequence. That's the main mental model: LINQ GroupBy hands you buckets, and each bucket still contains the original items.

SQL's `GROUP BY` is different. It gives you one row per key, and you can only select the key and aggregates. Keep that difference in mind, because it explains every EF Core error below.

## Shaping the result

Most of the time you project groups straight into a result type:

```csharp
var summary = orders
    .GroupBy(o => o.City)
    .Select(g => new CitySummary(g.Key, g.Count(), g.Sum(o => o.Total)))
    .OrderByDescending(s => s.Total)
    .ToList();
```

There's also an overload that does the projection for you, but I find the `GroupBy` + `Select` form easier to read and easier to change later.

## Grouping by more than one key

Use an anonymous type (or a tuple):

```csharp
var monthly = orders
    .GroupBy(o => new { o.CreatedAt.Year, o.CreatedAt.Month })
    .Select(g => new
    {
        g.Key.Year,
        g.Key.Month,
        Revenue = g.Sum(o => o.Total)
    });
```

Anonymous types compare by value, so two orders from March 2026 land in the same group. Records work the same way, which is one reason [C# records](/blog/csharp-records-explained) make good keys.

## LINQ GroupBy with EF Core: what translates

EF Core turns this into a single SQL `GROUP BY`:

```csharp
var perClinic = await db.Appointments
    .Where(a => a.StartsAt >= from)
    .GroupBy(a => a.ClinicId)
    .Select(g => new { ClinicId = g.Key, Count = g.Count(), Last = g.Max(a => a.StartsAt) })
    .ToListAsync(ct);
```

```sql
SELECT a.ClinicId, COUNT(*) AS Count, MAX(a.StartsAt) AS Last
FROM Appointments AS a
WHERE a.StartsAt >= @from
GROUP BY a.ClinicId
```

The rule: **select the key and aggregates** (`Count`, `Sum`, `Average`, `Min`, `Max`) and EF Core can translate it.

## Returning the groups themselves

This looks harmless:

```csharp
// Returns the groups themselves
var groups = await db.Appointments.GroupBy(a => a.ClinicId).ToListAsync(ct);
```

There's no SQL that returns "buckets of rows". Older EF Core versions threw an exception here. Since EF Core 7, this exact shape works: EF Core sorts the rows by the key in SQL and builds the groups while reading them. But it still loads every matching row into memory, and more complex shapes after the `GroupBy` can still fail to translate. So treat it with care. Three better options, in the order I'd try them:

1. **Ask for aggregates instead** if that's all the screen needs.
2. **Get the top N per group with SQL** using `ROW_NUMBER`. I show that in [SQL Server window functions](/blog/sql-server-window-functions).
3. **Filter first, then group in memory**, when the filtered set is small:

```csharp
var rows = await db.Appointments
    .Where(a => a.StartsAt >= from && a.StartsAt < to)
    .Select(a => new { a.ClinicId, a.Id, a.StartsAt })
    .ToListAsync(ct);

var grouped = rows.GroupBy(r => r.ClinicId); // in memory, on a small set
```

The danger is doing step 3 by accident on a huge table, like calling `AsEnumerable()` too early. Then EF Core loads every row and LINQ GroupBy runs in your app's memory. It works fine in development with 200 rows and falls over in production with 2 million. My post on [IEnumerable vs IQueryable](/blog/ienumerable-vs-iqueryable-ef-core) explains exactly where that line is crossed.

## A few things worth knowing

- **Grouping is deferred.** Nothing runs until you enumerate. If you enumerate twice, it groups twice. Call `ToList()` once if you'll reuse the result.
- **`ToLookup` is the eager cousin.** It groups immediately and gives you fast lookups by key: `var byCity = orders.ToLookup(o => o.City); var lahore = byCity["Lahore"];`. A missing key returns an empty sequence instead of throwing.
- **Null keys are allowed.** Items with a `null` key all go into one group whose `Key` is `null`. Handle it in your `Select`, or it'll show up as a blank row on a report.
- **Order of groups** follows the first appearance of each key in the source, in memory. In SQL there's no order unless you add `OrderBy`.

## Group or count?

If you only need "how many per key", grouping is right. If you need "does any item match" or "the total across everything", don't group at all: `Any`, `Count` and `Sum` on the whole set are simpler and cheaper.

## Summary

LINQ GroupBy gives you buckets of items; SQL `GROUP BY` gives you one row per key. In memory, group however you like. With EF Core, select the key plus aggregates and it becomes efficient SQL. When you really need the items per group, filter down first or move to window functions. It's also a popular interview topic, so see my [LINQ interview questions](/blog/linq-interview-questions) if you're preparing.

---
title: "Clustered vs Nonclustered Index in SQL Server, Explained Simply"
description: "Clustered vs nonclustered index in SQL Server: how each one stores rows, why a table gets only one clustered index, key lookups, and choosing keys for EF Core tables."
date: "2026-11-16"
category: "ef-core"
tags: ["SQL Server", "Indexes", "Performance", "EF Core"]
related:
  - covering-index-ef-core
  - sql-server-performance-tuning-checklist
  - ef-core-sql-performance
faq:
  - q: "What is the main difference between a clustered and a nonclustered index?"
    a: "A clustered index is the table itself, stored in key order. A nonclustered index is a separate, smaller structure that holds its key columns plus a pointer back to the full row."
  - q: "How many clustered indexes can a table have?"
    a: "One. The rows can only be stored in one order. A table can have many nonclustered indexes."
  - q: "Should a GUID be the clustered key?"
    a: "Not a random one. Values from Guid.NewGuid() or NEWID() land on random pages and cause page splits. Use sequential GUIDs, or keep the GUID as a nonclustered primary key and cluster on an identity column."
---

When people ask about a clustered vs nonclustered index, they usually get the phone book analogy. It's fine as far as it goes, but it stops helping the moment you have a real slow query in front of you. This is how I explain it to developers on my teams, with the parts that actually change how you write EF Core code.

## The short answer

A clustered index *is* the table, sorted by its key. A nonclustered index is a separate copy of a few columns, sorted a different way, with a pointer back to the full row.

Everything else follows from that one difference.

## How a clustered index stores rows

SQL Server stores data in 8 KB pages. With a clustered index, those pages form a B-tree: a root page at the top, some middle levels, and leaf pages at the bottom. The leaf pages hold the complete rows, in key order.

```text
                 [ root: 1 | 5000 | 10000 ]
                /            |             \
      [1 ... 4999]    [5000 ... 9999]    [10000 ...]
        leaf pages = the actual rows, sorted by Id
```

So when you search for `WHERE Id = 7342`, SQL Server walks from the root down to one leaf page, and the whole row is right there. No second trip.

That's also why a table gets only one clustered index. The rows can only be stored in one order.

A table with no clustered index is called a heap. Rows go wherever there's free space. Heaps have a few niche uses, like staging tables for bulk loads, but normal application tables should have a clustered index.

## How a nonclustered index stores rows

A nonclustered index is its own B-tree. Its leaf pages hold the index key columns, any `INCLUDE` columns, and a row locator. When the table has a clustered index, that locator is the clustered key.

```sql
CREATE NONCLUSTERED INDEX IX_Orders_CustomerId
ON dbo.Orders (CustomerId);
```

```text
IX_Orders_CustomerId (leaf)        Clustered index (leaf = full rows)
CustomerId | Id                    Id   | CustomerId | Total | Status
   12      | 881   ──────────►     881  |   12       | 49.90 | Paid
   12      | 1204  ──────────►     1204 |   12       | 12.00 | Open
   13      | 77    ──────────►     77   |   13       | 99.00 | Paid
```

If your query needs only `CustomerId` and `Id`, this index answers it alone. If it also needs `Total` and `Status`, SQL Server has to follow each pointer back into the clustered index. That extra trip is called a key lookup.

## Key lookups: where the difference starts to hurt

This is where the clustered vs nonclustered index difference starts to matter in practice. A few key lookups are fine. Thousands are not. Each one is a separate walk down the clustered index. At some point the optimizer decides that scanning the whole table is cheaper, and your index gets ignored.

You'll spot it in the execution plan as a **Key Lookup** next to an **Index Seek**, joined by **Nested Loops**. There are two ways to fix it:

1. **Return fewer columns.** In EF Core, a `Select` projection often removes the lookup completely.
2. **Make the index cover the query** with `INCLUDE`:

```sql
CREATE NONCLUSTERED INDEX IX_Orders_CustomerId
ON dbo.Orders (CustomerId)
INCLUDE (Total, Status)
WITH (DROP_EXISTING = ON);
```

I go deeper into picking key columns versus `INCLUDE` columns in the [covering index post](/blog/covering-index-ef-core).

## Clustered vs nonclustered index, side by side

| | Clustered | Nonclustered |
|---|---|---|
| Leaf level holds | The full row | Key + INCLUDE columns + row locator |
| How many per table | One | Up to 999 |
| Created by default for | The PRIMARY KEY | UNIQUE constraints, plus any you add |
| Good for | Lookups and range scans on its key | Filters and sorts on other columns |
| Write cost | Rows move if the key value changes | Every insert, update and delete touches it |

## Choosing a good clustered key

This is the part of the clustered vs nonclustered index story most people skip. The clustered key is copied into every nonclustered index as the row locator. So a poor clustered key makes every other index bigger and slower too. A good clustered key is:

- **Narrow.** An `int` or `bigint` is 4 to 8 bytes. A composite key of three strings gets copied into every index.
- **Unique.** If it isn't, SQL Server quietly adds a hidden 4-byte "uniquifier".
- **Stable.** Changing a clustered key value moves the row and updates every nonclustered index.
- **Ever-increasing.** New rows go at the end instead of splitting pages in the middle.

An identity `int` or `bigint` ticks every box, which is why it's the default answer.

## The GUID trap in EF Core

EF Core makes a `Guid Id` property the primary key, and SQL Server makes the primary key clustered unless you say otherwise. When EF Core generates the value, the SQL Server provider uses sequential GUIDs, which is mostly fine. The trouble starts when your code sets `Id = Guid.NewGuid()` itself, or the column default is `NEWID()`. Those values are random, so each insert lands on a random page. Pages split, fragmentation climbs, and busy tables get slower to write.

If you need GUIDs as public IDs, one clean fix is to keep the GUID as the primary key but cluster on something else:

```csharp
modelBuilder.Entity<Order>(e =>
{
    e.HasKey(o => o.Id).IsClustered(false);       // Guid primary key, nonclustered
    e.Property<long>("Seq").UseIdentityColumn();  // hidden identity column
    e.HasIndex("Seq").IsUnique().IsClustered();   // rows stored in insert order
});
```

Another option is a `NEWSEQUENTIALID()` default on the column. Whichever you pick, test insert speed with a realistic amount of data before and after the change.

## Which one does my query need?

Look at what the query filters and sorts on. That tells you which side of the clustered vs nonclustered index choice it falls on.

- **Lookups by the clustered key, or ranges over it** (`WHERE Id BETWEEN ...`): the clustered index already serves it.
- **Filters on other columns** (`WHERE CustomerId = @id`, or `WHERE Status = 'Open' AND CreatedAt > @from`): you need a nonclustered index on those columns.
- **A few extra columns in the result**: add them as `INCLUDE` columns so there's no key lookup.

For a typical orders table, that ends up as one clustered index on `Id` and two or three nonclustered indexes shaped by the real screens and reports. Not ten. Every extra index slows down inserts and updates, so add them for queries you've actually measured.

## See what your table has today

```sql
SELECT i.name, i.type_desc, i.is_primary_key,
       STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS key_columns
FROM sys.indexes i
JOIN sys.index_columns ic
  ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
JOIN sys.columns c
  ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.object_id = OBJECT_ID('dbo.Orders')
GROUP BY i.name, i.type_desc, i.is_primary_key;
```

(`STRING_AGG ... WITHIN GROUP` needs SQL Server 2017 or later.)

Run it on your busiest table. A clustered index on a random GUID, or six nonclustered indexes that all start with the same column, is a good place to start. My [SQL Server performance tuning checklist](/blog/sql-server-performance-tuning-checklist) shows how to find which queries to fix first.

## Summary

The clustered vs nonclustered index choice comes down to how rows are stored. The clustered index is the table itself in key order, and there's only one. Nonclustered indexes are extra sorted copies of a few columns that point back to it. Keep the clustered key narrow, unique, stable and increasing, and shape the nonclustered indexes around the queries your app really runs.

Got a SQL Server database that's slowing your product down? I take on this kind of work as a [freelance .NET developer](/hire-dotnet-developer).

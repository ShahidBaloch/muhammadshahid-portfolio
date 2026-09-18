---
title: "Cursor vs Offset Pagination in ASP.NET Core"
description: "Offset page numbers skip and duplicate rows when the table changes. Cursor pagination for an ASP.NET Core list API is a key, a stable order, and a next link Angular can follow."
date: "2026-09-18"
updated: "2026-09-18"
category: "api-design"
tags: ["ASP.NET Core", "Pagination", "EF Core", "Angular"]
related:
  - api-design-principles
  - ef-core-sql-performance
  - angular-dotnet-integration
  - aspnet-core-api-versioning
faq:
  - q: "What is the difference between cursor and offset pagination?"
    a: "Offset asks for page N with Skip and Take. Cursor asks for rows after a key you already saw. Offset is fine for a short, stable admin table. Cursor is the one to use when rows are inserted while the user scrolls."
  - q: "Why does Skip get slower on later pages?"
    a: "SQL Server still reads and discards the skipped rows. Page 500 with a page size of 20 is not free. A keyset query starts at the index for the cursor and reads only the page."
  - q: "Can Angular keep using page numbers?"
    a: "Only if you accept missing or repeated rows. A virtual scroll or a Load more button should send the cursor from the last item, not an incremented page index."
---

`page=2` is easy to build and wrong for a live list. A new order inserted at the top pushes a row onto the next page, and the user sees a duplicate. A deleted row makes one disappear. The search they typed was "load more", not "random sample."

Hub: [API design](/learning/api-design). Related contract habits: [Angular + .NET](/blog/angular-dotnet-integration). Why the SQL matters: [EF Core SQL performance](/blog/ef-core-sql-performance).

## Real-world analogy

Offset is "skip the first 40 people and talk to the next 20." If someone joins the front of the queue while you walk, person 41 is now 42, and you greet someone you already greeted. A cursor is "the last person I spoke to was Sam. Give me the 20 people behind Sam." The queue can grow at the front and you do not greet Sam again.

## Worked example

The orders screen uses `page=3` and `pageSize=20`, so the query is `Skip(40).Take(20)` ordered by `CreatedAt` descending. Between page 2 and page 3 a new order is inserted at the top. The row that was 40th is now 41st, and it appears again at the top of page 3. The Angular list shows a duplicate. The replacement request sends the `CreatedAt` and `Id` of the last row on screen. SQL starts after that pair, reads 21 rows, and returns 20 plus a flag that more exist. Refreshing the screen drops the cursor and loads the head again. It does not increment a page number.

## Use this

| UI | Pagination | Why |
|---|---|---|
| Admin grid, small table, "go to page 12" | Offset | Users want a page index. The table is not a firehose. |
| Infinite scroll, mobile load-more, activity feed | Cursor | The list changes. The next page must start after the last row shown. |
| Export everything | Neither | Stream it. Do not loop offsets until the server cries. |

If the client needs a total count for a pager, that count is a separate query and it is stale the moment it returns. Do not block the page on `Count` of a million rows.

## Offset, and the hole in it

```csharp
await db.Orders.AsNoTracking()
    .OrderByDescending(o => o.CreatedAt)
    .Skip((page - 1) * pageSize)
    .Take(pageSize)
    .Select(o => new OrderListItem(o.Id, o.CreatedAt, o.Total))
    .ToListAsync(ct);
```

`Skip(10000)` is an index scan that throws rows away. It also has no memory of the previous page. Insertion between calls shifts the window.

## Cursor

Order by a unique key. `CreatedAt` alone collides. Break ties with `Id`.

```csharp
var rows = await db.Orders.AsNoTracking()
    .Where(o => cursor == null || o.CreatedAt < cursor.CreatedAt
        || (o.CreatedAt == cursor.CreatedAt && o.Id < cursor.Id))
    .OrderByDescending(o => o.CreatedAt)
    .ThenByDescending(o => o.Id)
    .Take(pageSize + 1)
    .Select(o => new OrderListItem(o.Id, o.CreatedAt, o.Total))
    .ToListAsync(ct);

var hasMore = rows.Count > pageSize;
if (hasMore) rows.RemoveAt(rows.Count - 1);
```

Return the last item's `CreatedAt` and `Id` as the next cursor. Opaque is better than raw columns if you might change the sort: base64 a small payload, not a page number. The client sends it back. It does not compute it.

Take `pageSize + 1` so you know there is another page without a `Count`.

## Angular

Send `cursor`, not `page + 1`. Append rows. If the first request has no cursor, that is the head of the list. A refresh clears the cursor. Mixing "pull to refresh" with an old cursor shows a gap and looks like a bug in the API.

Version the list DTO with the rest of the API if you rename the cursor fields. [API versioning](/blog/aspnet-core-api-versioning).

Feed and catalog lists on [Ecom_NET10](/work/ecom-net10) are the screens this is for.

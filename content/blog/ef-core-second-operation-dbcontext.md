---
title: "EF Core: A Second Operation Was Started on This Context"
description: "The ASP.NET Core error 'A second operation was started on this context' means one DbContext is running two queries. The usual causes are a missing await, a parallel task, or a context stored in a singleton."
date: "2026-09-18"
updated: "2026-09-18"
category: "ef-core"
tags: ["EF Core", "DbContext", "ASP.NET Core", "async"]
related:
  - aspnet-core-dependency-injection
  - ef-core-interview-questions
  - ef-core-nplus1-include-vs-assplitquery
  - csharp-task-whenall-vs-parallel-foreach
faq:
  - q: "What causes 'A second operation was started on this context instance'?"
    a: "Two operations used the same DbContext before the first finished. A missing await, Task.WhenAll on two queries that share the request's context, or a DbContext injected into a singleton."
  - q: "Does adding AsNoTracking fix the second operation error?"
    a: "No. That changes tracking, not ownership. The fix is one operation at a time per context instance, or a separate instance per parallel task via IDbContextFactory."
  - q: "Can I turn off the exception and share a DbContext across threads?"
    a: "No. A context is not thread-safe. Enabling multiple active result sets on SQL Server hides a different problem (two readers). It does not make the context safe to share."
---

The full message is `A second operation was started on this context instance before a previous operation completed.` EF Core refuses to use one `DbContext` for two commands at once. The bug is almost never SQL. It is who holds the context.

Hub: [EF Core](/learning/ef-core). Lifetimes: [dependency injection](/blog/aspnet-core-dependency-injection).

## Real-world analogy

One shop counter, one till. Two cashiers grabbing the same till at the same time mix the receipt. You either wait your turn, or you open a second till. You do not "fix" it by telling the first cashier to work faster, and you do not solve it by installing a second screen on the same till. The context is the till. `IDbContextFactory` is the second till.

## Worked example

A page loads orders and the customer's credit in one action. The code starts `ToListAsync` on orders and, without awaiting, starts `CountAsync` on the same injected `AppDbContext`. The exception is `A second operation was started on this context instance before a previous operation completed`. Awaiting the first query removes the exception and also removes the parallelism. If both reads really should overlap, the credit query needs a context from `IDbContextFactory.CreateDbContextAsync`, and the request's scoped context keeps the orders query. `MultipleActiveResultSets=true` does not make this safe. A context is still not for two threads.

## The four ways it happens

| Code | Why it throws |
|---|---|
| `db.Orders.ToListAsync()` without `await`, then another query | The first command is still running |
| `Task.WhenAll(q1, q2)` on the same injected context | Both queries share one instance |
| `DbContext` injected into a singleton, or stored in a static field | Every request shares one instance |
| Blazor circuit or a hosted service that captures the request scope | The scope is gone, or the same scope is reused after the request |

A lazy navigation that loads while another query is open looks the same. You did not write the second call. The proxy did, on the same context.

## Missing await

```csharp
var open = db.Orders.Where(o => o.Status == OrderStatus.Open).ToListAsync(ct);
var count = await db.Orders.CountAsync(ct); // throws
```

`open` is a hot task. `await` it before the next operation, or do not start it yet. Parallel `WhenAll` is the explicit version of the same mistake. Comparison of the two: [WhenAll vs Parallel.ForEach](/blog/csharp-task-whenall-vs-parallel-foreach).

## Parallel queries need two contexts

The request already has one scoped `AppDbContext`. Keep it for the single query path. When you truly need two reads at once, create a second instance:

```csharp
await using var db2 = await dbFactory.CreateDbContextAsync(ct);
var orders = db.Orders.AsNoTracking().Where(o => o.CustomerId == id).ToListAsync(ct);
var credit = db2.Customers.AsNoTracking().Where(c => c.Id == id).Select(c => c.Credit).FirstAsync(ct);
await Task.WhenAll(orders, credit);
```

Register `AddDbContextFactory<AppDbContext>` as well as `AddDbContext`. Do not resolve a scoped context from a singleton with `IServiceProvider` you captured at startup. That provider's scope is the root.

## What not to change

- Do not set `MultipleActiveResultSets=true` to get past this. MARS lets one connection hold two readers. It does not make a context safe, and it is not the error you are looking at.
- Do not make `DbContext` transient to "avoid sharing" and then inject it into a service that is still scoped next to another service that has its own context. You now have two contexts and a transaction that only covers one of them. One scoped context per request is the right default.
- `AsNoTracking` and `AsSplitQuery` do not affect this. Split query is the [N+1 and cartesian](/blog/ef-core-nplus1-include-vs-assplitquery) problem.

If the stack trace points at a navigation during `SaveChanges`, you loaded a related entity lazily while save was already talking to the database. `Include` what you need before save, or turn lazy loading off and see the `null` instead of a second operation.

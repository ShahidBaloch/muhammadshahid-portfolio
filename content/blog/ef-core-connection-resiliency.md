---
title: "EF Core SQL Retry with EnableRetryOnFailure"
description: "EnableRetryOnFailure retries a transient SQL error in EF Core. It does not retry a bug, and a user-started transaction needs the execution strategy or the retry never runs."
date: "2026-09-18"
updated: "2026-09-18"
category: "ef-core"
tags: ["EF Core", "SQL Server", "Resiliency", "ASP.NET Core"]
related:
  - ef-core-sql-performance
  - ef-core-sql-server-parameter-sniffing
  - sql-server-deadlocks-snapshot-isolation
faq:
  - q: "What does EnableRetryOnFailure do?"
    a: "It wraps EF Core operations in an execution strategy that retries a short list of transient SQL errors, such as a dropped connection or a brief failover. It does not retry a unique-key violation or a bad query."
  - q: "Why did my transaction not retry?"
    a: "A transaction you begin yourself is not retried unless the body runs inside strategy.ExecuteAsync. Retrying half a transaction would run the first statements twice."
  - q: "Should I retry every SaveChanges failure?"
    a: "No. A concurrency conflict and a constraint failure are the truth about the data. Retrying them hides the bug and writes a second time when the first failure was final."
---

A blip from SQL Server should not become a 500 if the next try will work. A unique index violation should not be tried five times. `EnableRetryOnFailure` is the switch for the first case only.

Hub: [EF Core](/learning/ef-core). Slow SQL is a different problem: [SQL performance](/blog/ef-core-sql-performance). Deadlocks need a different answer than a blind retry: [snapshot isolation](/blog/sql-server-deadlocks-snapshot-isolation).

## Real-world analogy

A phone call that drops gets dialed again. A person who says "no" does not get dialed again in a loop. The retry strategy is the redial button for a dropped call. It is not a way to nag a no into a yes.

## Worked example

Azure SQL fails over. The first `SaveChanges` throws a timeout. Without the strategy, the request returns 500 and the user hits refresh, which may double-submit if the first save actually committed. With `EnableRetryOnFailure`, EF Core opens a new connection and runs that save again. The order exists once, because the first attempt did not commit. Later a duplicate email hits the unique index. That error is not transient. The strategy does not retry it. The API returns 409. Wrapping the unique-index case in your own `for` loop of five is how you waste the failover budget and still fail.

| Error | Retry? |
|---|---|
| Connection dropped, failover, timeout | Yes, a few times, with a pause |
| Deadlock | Sometimes, after you have a strategy. Fix the order of writes too |
| Unique key, check constraint, concurrency token | No |

## Code

```csharp
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(connectionString, sql =>
        sql.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(10),
            errorNumbersToAdd: null)));
```

If you open `BeginTransaction` yourself, run the whole body through the strategy:

```csharp
var strategy = db.Database.CreateExecutionStrategy();
await strategy.ExecuteAsync(async () =>
{
    await using var tx = await db.Database.BeginTransactionAsync(ct);
    // work, then SaveChanges, then commit
    await tx.CommitAsync(ct);
});
```

Retries multiply load during an outage. Five tries on every request, from every instance, is a thundering herd. Keep the count small. Do not combine this with an HTTP retry on the same POST unless that POST is idempotent.

Checkout that cannot stand a double write: [Ecom_NET10](/work/ecom-net10).

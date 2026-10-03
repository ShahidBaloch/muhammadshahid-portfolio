---
title: "EF Core Connection Resiliency & EnableRetryOnFailure"
description: "Master EF Core connection resiliency in Azure SQL: EnableRetryOnFailure, handling transactions with CreateExecutionStrategy, and idempotency."
date: "2026-09-18"
updated: "2026-10-03"
category: "ef-core"
tags: ["EF Core", "SQL Server", "Resiliency", "Azure", "ASP.NET Core", "Architecture"]
related:
  - ef-core-sql-performance
  - ef-core-connection-pooling
  - sql-server-deadlocks-snapshot-isolation
  - ef-core-interview-questions
faq:
  - q: "What does EnableRetryOnFailure actually do in EF Core?"
    a: "EnableRetryOnFailure activates SqlServerRetryingExecutionStrategy. When EF Core encounters known transient SQL error numbers (such as connection drops, database failovers, or network blips), it automatically re-executes the operation with exponential backoff before throwing an exception to caller code."
  - q: "Why does BeginTransactionAsync throw an InvalidOperationException with EnableRetryOnFailure?"
    a: "SqlServerRetryingExecutionStrategy does not allow manual transactions because if a transient failure occurs mid-transaction, retrying only SaveChanges would commit orphaned operations. To use manual transactions, wrap the entire transaction block inside database.CreateExecutionStrategy().ExecuteAsync()."
  - q: "Does EnableRetryOnFailure retry non-transient errors like foreign key or unique constraint violations?"
    a: "No. Non-transient errors (such as unique constraint violation 2627 or foreign key error 547) fail immediately without retry, because re-executing a fundamentally invalid query or duplicate key insert will never succeed."
  - q: "What is the danger of retrying non-idempotent write operations?"
    a: "If a transient network disconnect happens after SQL Server commits a transaction but before the ACK reaches Kestrel, a retry may execute the write a second time. Ensure write workflows use idempotency keys or unique constraint guards."
---

**EF Core Connection Resiliency** (`EnableRetryOnFailure`) enables ASP.NET Core applications to survive transient cloud database disruptions—such as Azure SQL automatic failovers, TCP connection drops, and throttling spikes—by automatically re-executing failed database commands with exponential jitter backoff.

```text
Kestrel API ──► Executes SaveChangesAsync()
                      │
                      ▼
Azure SQL Database (Undergoing 10-second maintenance failover)
  ├── Attempt 1: Connection Reset (Error 40613) ──► Transient failure detected!
  ├── Delay 1s (Jitter backoff)
  ├── Attempt 2: Re-opens connection pool ──► SaveChangesAsync() succeeds! (200 OK)
  └── User experiences 1.2s latency instead of an HTTP 500 crash
```

**New to this** → start with [Transient error numbers](#which-errors-are-transient). **Manual transactions** → [Working with execution strategies](#handling-user-initiated-transactions). **Connection pooling** → [EF Core connection pooling guide](/blog/ef-core-connection-pooling). **Interview prep** → [If an interviewer asks](#if-an-interviewer-asks).

## Real-world analogy

Imagine a phone conversation where cell reception momentarily cuts out in a tunnel.
- **Without Resiliency**: You immediately hang up the phone, cancel your doctor's appointment, and file a complaint (HTTP 500 error).
- **With `EnableRetryOnFailure`**: You wait 2 seconds, tap the redial button, and continue the conversation once the signal restores.
- **The Non-Transient Rule**: If the other party picks up and says "We are permanently closed," you do not redial them 5 times in a row. That is a permanent error (`UniqueConstraintException`), not a transient network blip.

## Which errors are transient?

`SqlServerRetryingExecutionStrategy` targets specific Microsoft SQL Server error codes:

| SQL Error Code | Description | Strategy Action |
|---|---|---|
| **`4060`** | Cannot open database requested by login (Failover in progress) | **Retry with backoff** |
| **`40197`** | Error processing the request (Server error during failover) | **Retry with backoff** |
| **`40501`** | Service is busy (Azure SQL throttling threshold reached) | **Retry with backoff** |
| **`40613`** | Database on server is currently unavailable | **Retry with backoff** |
| **`49918` / `49919`** | Cannot process request (Not enough resources) | **Retry with backoff** |
| **`10054` / `10053`** | An existing connection was forcibly closed by remote host | **Retry with backoff** |
| **`2601` / `2627`** | Duplicate key / Unique constraint violation | **Fail immediately (No retry)** |
| **`547`** | Foreign key constraint violation | **Fail immediately (No retry)** |

## Basic Configuration in Program.cs

```csharp
// Program.cs
builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sqlServerOptions =>
        {
            sqlServerOptions.EnableRetryOnFailure(
                maxRetryCount: 3,                          // Keep count small (3-5 max)
                maxRetryDelay: TimeSpan.FromSeconds(5),     // Maximum backoff cap
                errorNumbersToAdd: null                     // Optional: add custom transient error numbers
            );
            sqlServerOptions.CommandTimeout(30);
        });
});
```

## Handling user-initiated transactions

If you call `await dbContext.Database.BeginTransactionAsync()` directly while `EnableRetryOnFailure` is configured, EF Core throws:

> `InvalidOperationException: The configured execution strategy 'SqlServerRetryingExecutionStrategy' does not support user-initiated transactions. Use the execution strategy returned by 'DbContext.Database.CreateExecutionStrategy()' to execute all the operations in the transaction as a retriable unit.`

### The Right Way: `CreateExecutionStrategy().ExecuteAsync`

```csharp
public async Task TransferBalanceAsync(
    AppDbContext db, 
    Guid fromAccountId, 
    Guid toAccountId, 
    decimal amount, 
    CancellationToken ct)
{
    // 1. Create execution strategy instance
    var strategy = db.Database.CreateExecutionStrategy();

    // 2. Execute the entire transaction block inside the strategy
    await strategy.ExecuteAsync(async () =>
    {
        // Must begin transaction INSIDE the lambda so the entire unit resets on retry
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var fromAccount = await db.Accounts.FindAsync([fromAccountId], ct);
        var toAccount = await db.Accounts.FindAsync([toAccountId], ct);

        if (fromAccount == null || toAccount == null)
            throw new InvalidOperationException("Account not found");

        fromAccount.Debit(amount);
        toAccount.Credit(amount);

        await db.SaveChangesAsync(ct);

        // Commit transaction
        await transaction.CommitAsync(ct);
    });
}
```

## The Network ACK loss hazard & Idempotency

Consider this catastrophic edge case:
1. EF Core executes `INSERT INTO Orders ...` and `COMMIT`.
2. SQL Server commits the order successfully.
3. The network drops before SQL Server can send the `ACK` back to Kestrel.
4. Kestrel catches the TCP disconnect as a transient error and **retries the whole transaction**.
5. Kestrel inserts a duplicate order!

### How to protect against double writes:
- Use **Idempotency Keys**: Store a unique `IdempotencyKey` on the table with a unique index. If a retry fires after a successful commit, the second insert safely fails with a unique constraint error rather than creating duplicate orders.
- Do not make external HTTP/Email calls inside the retry lambda: External API calls (like sending a customer email) will be duplicated every time the strategy retries. Move external notifications to background channels or the [Transactional Outbox](/blog/transactional-outbox-ef-core).

## Common mistakes and pitfalls

- **Setting `maxRetryCount: 10+`**: Under severe database outages, 50 API instances retrying 10 times each will unleash a devastating thundering-herd DDoS attack against your recovering SQL Server. Keep retries to 3–4 max.
- **Calling external APIs or sending emails inside `strategy.ExecuteAsync()`**: If the database query retries 3 times, the email or credit card charge will execute 3 times. Keep the execution strategy strictly limited to database mutations.
- **Ignoring Deadlock detection**: By default, SQL Server deadlocks (error 1205) may or may not be retried cleanly depending on transaction state. Combine execution strategies with proper table write ordering and [Snapshot Isolation](/blog/sql-server-deadlocks-snapshot-isolation).

## If an interviewer asks

**30-second answer:** `EnableRetryOnFailure` enables `SqlServerRetryingExecutionStrategy` in EF Core, automatically re-executing transient SQL failures (such as connection drops or Azure SQL failovers) with exponential backoff. For manual transactions, developers must wrap the transaction lifecycle within `db.Database.CreateExecutionStrategy().ExecuteAsync()` to guarantee atomic retries.

**Strong answer:** In cloud environments like Azure SQL, transient connection resets are normal operational occurrences. We configure `EnableRetryOnFailure(maxRetryCount: 3)` with conservative backoffs to avoid retry storms. For multi-step business transactions, we execute the entire unit within `CreateExecutionStrategy().ExecuteAsync()`. To protect against false-positive network drop scenarios where SQL Server commits but the network ACK is lost, we guard mutating tables with unique idempotency keys and defer side-effects (like emails) to a Transactional Outbox pattern.

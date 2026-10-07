---
title: "Dapper vs EF Core: Architecture and Hybrid Patterns"
description: "Dapper vs EF Core in ASP.NET Core: performance realities, change tracking overhead, sharing transactions in hybrid architectures, and when to use each tool."
date: "2026-09-18"
updated: "2026-10-03"
category: "ef-core"
tags: ["Dapper", "EF Core", "SQL Server", "ASP.NET Core", "Performance", "Architecture", "CQRS"]
related:
  - ef-core-sql-performance
  - ef-core-bulk-update-executeupdate
  - repository-pattern-dotnet
  - ef-core-interview-questions
faq:
  - q: "Is Dapper always faster than EF Core in real applications?"
    a: "No. For simple queries with AsNoTracking() and DTO projections (.Select()), modern EF Core (.NET 8/9/10) achieves near-identical execution speed to Dapper. Over 95% of database latency in production comes from network roundtrips, missing SQL indexes, and N+1 query patterns—which affect both Dapper and EF Core identically."
  - q: "Can I use EF Core and Dapper in the same ASP.NET Core project?"
    a: "Yes. The hybrid CQRS pattern uses EF Core for transactional writes, migrations, and aggregate domain logic, while using Dapper for complex analytical queries, recursive CTEs, window functions, and bulk reporting."
  - q: "How do I share a single database transaction between EF Core and Dapper?"
    a: "Access the underlying DbConnection and DbTransaction from EF Core using dbContext.Database.GetDbConnection() and dbContext.Database.CurrentTransaction.GetDbTransaction(). Pass these into Dapper's QueryAsync or ExecuteAsync methods so both tools enlist in the same atomic unit of work."
  - q: "When should I choose Dapper over EF Core?"
    a: "Choose Dapper when: (1) you require raw SQL features that LINQ cannot express (Table-Valued Parameters, query hints, dynamic pivot queries, recursive CTEs), (2) you need to query legacy databases with unconventional schemas, or (3) you are building high-throughput read-only analytical microservices."
---

**Dapper vs EF Core** is not an "either-or" religious debate—it is an architectural choice between **high-productivity object-relational mapping with unit-of-work tracking (EF Core)** and **low-level, high-control raw SQL micro-ORM execution (Dapper)**. Modern enterprise applications frequently combine both using a hybrid CQRS pattern.

```text
Hybrid Architecture Pattern:
├── Writes / Commands (EF Core):
│   └── Change Tracking, Business Invariants, Optimistic Concurrency, Migrations
│
└── Reads / Queries (Dapper or EF Core Projections):
    ├── Simple Reads ──► EF Core with .AsNoTracking().Select(dto => ...)
    └── Complex Reads ──► Dapper with Raw SQL, Window Functions & CTEs
```

**New to this** → start with [Feature Comparison](#feature-by-feature-comparison). **Hybrid transaction sharing** → [Sharing transactions between EF Core and Dapper](#sharing-transactions-between-ef-core-and-dapper). **EF Core optimization** → [SQL performance guide](/blog/ef-core-sql-performance). **Interview prep** → [If an interviewer asks](#if-an-interviewer-asks).

## Real-world analogy

- **EF Core**: A full-service general contractor who builds your entire house from blueprints. They manage the plumbing, electrical permits, and framing inspections (`Migrations`, `ChangeTracker`, `SaveChanges`).
- **Dapper**: A specialized master stone mason hired to install a custom curved marble fireplace. You supply the exact cut specifications (`raw SQL`), and the mason sets the stone instantly without asking questions about the house's foundation.

You do not tear down the house or fire the contractor just because one fireplace required custom masonry.

## Feature-by-feature comparison

| Feature | Entity Framework Core (EF Core 9+) | Dapper |
|---|---|---|
| **ORM Category** | Full Object-Relational Mapper (ORM) | Micro-ORM / SQL Mapper |
| **Mapping Mechanism** | LINQ to SQL Expression Tree Compilation | High-speed dynamic IL emission |
| **Change Tracking** | Full Unit-of-Work & Dirty Tracking | None (Stateless execution) |
| **Schema Migrations** | Code-First Migration engine with snapshots | None (Requires DbUp, FluentMigrator, or SQL scripts) |
| **Batch Updates** | `ExecuteUpdateAsync()` & `ExecuteDeleteAsync()` | Raw SQL `UPDATE ... WHERE ...` |
| **Complex SQL Support** | Broad LINQ support; complex CTEs/hints require raw SQL | Complete, unrestricted access to any SQL dialect feature |
| **Memory Overhead** | Low with `AsNoTracking()`; Moderate with tracker | Extremely low (close to raw `SqlDataReader`) |

## When EF Core is the right choice

1. **Transactional Aggregate Roots**: Creating or updating complex domain entities with child collections, where EF Core manages foreign key associations, concurrency tokens (`RowVersion`), and validation in a single atomic `SaveChangesAsync()`.
2. **Standard CRUD and DTO Projections**: Modern EF Core compiles LINQ queries into lean SQL when using `.AsNoTracking().Select()`, generating identical SQL to hand-written Dapper queries without string concatenation risks.
3. **Database Migrations and CI/CD**: Managing evolving schema migrations, seed data, and schema drift checks.

```csharp
// High-performance EF Core DTO Projection (0 tracker allocation)
public async Task<List<OrderSummaryDto>> GetRecentOrdersAsync(
    AppDbContext db, 
    Guid customerId, 
    CancellationToken ct)
{
    return await db.Orders
        .AsNoTracking()
        .Where(o => o.CustomerId == customerId)
        .OrderByDescending(o => o.CreatedAt)
        .Select(o => new OrderSummaryDto(o.Id, o.TotalAmount, o.Status, o.CreatedAt))
        .Take(20)
        .ToListAsync(ct);
}
```

## When Dapper is the right choice

1. **Table-Valued Parameters (TVPs)**: Passing bulk collections of thousands of records to SQL Server in a single roundtrip using structured types.
2. **Advanced SQL Features**: Queries utilizing `MERGE`, recursive Common Table Expressions (`WITH Recursive`), dynamic `PIVOT` statements, or query hints (`WITH (NOLOCK)`, `OPTION (RECOMPILE)`).
3. **Legacy Database Mapping**: Databases with composite keys without primary constraints, non-standard naming conventions, or stored procedure-driven legacy architectures.

```csharp
// Advanced Dapper Query with Window Functions
using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;

public async Task<IEnumerable<MonthlyRevenueDto>> GetMonthlyRevenueReportAsync(
    string connectionString, 
    int year, 
    CancellationToken ct)
{
    const string sql = """
        WITH RankedSales AS (
            SELECT 
                MONTH(CreatedAt) AS [Month],
                TotalAmount,
                SUM(TotalAmount) OVER(PARTITION BY MONTH(CreatedAt)) AS MonthlyTotal,
                ROW_NUMBER() OVER(PARTITION BY MONTH(CreatedAt) ORDER BY TotalAmount DESC) AS [Rank]
            FROM Orders
            WHERE YEAR(CreatedAt) = @Year AND Status = 'Paid'
        )
        SELECT [Month], MonthlyTotal, TotalAmount AS TopSaleAmount
        FROM RankedSales
        WHERE [Rank] = 1
        ORDER BY [Month];
        """;

    using var connection = new SqlConnection(connectionString);
    var command = new CommandDefinition(sql, new { Year = year }, cancellationToken: ct);
    return await connection.QueryAsync<MonthlyRevenueDto>(command);
}
```

## Sharing transactions between EF Core and Dapper

In a hybrid CQRS setup, execute Dapper queries inside an EF Core `IDbContextTransaction`:

```csharp
public async Task ProcessOrderAndReportAsync(
    AppDbContext dbContext, 
    Order newOrder, 
    CancellationToken ct)
{
    // 1. Begin atomic EF Core transaction
    await using var transaction = await dbContext.Database.BeginTransactionAsync(ct);

    try
    {
        // 2. Perform write with EF Core change tracker
        dbContext.Orders.Add(newOrder);
        await dbContext.SaveChangesAsync(ct);

        // 3. Obtain underlying DbConnection & DbTransaction for Dapper
        var dbConnection = dbContext.Database.GetDbConnection();
        var currentDbTransaction = transaction.GetDbTransaction();

        // 4. Execute Dapper command within the same transaction!
        const string auditSql = """
            INSERT INTO AuditLogs (Id, Action, EntityId, Timestamp)
            VALUES (@Id, @Action, @EntityId, @Timestamp);
            """;

        await dbConnection.ExecuteAsync(auditSql, new
        {
            Id = Guid.NewGuid(),
            Action = "OrderCreated",
            EntityId = newOrder.Id.ToString(),
            Timestamp = DateTime.UtcNow
        }, transaction: currentDbTransaction);

        // 5. Commit both operations atomically
        await transaction.CommitAsync(ct);
    }
    catch
    {
        await transaction.RollbackAsync(ct);
        throw;
    }
}
```

## Common mistakes and pitfalls

- **Rewriting EF Core in Dapper to fix slow queries without checking indexes**: If a query is slow because it performs a full table scan on a 5-million-row table with no index, converting it to Dapper will still perform a full table scan. Check your SQL execution plan and indexes first.
- **Forgetting `AsNoTracking()` in EF Core read queries**: Running read-only queries with full change tracking allocates unnecessary snapshot objects in memory. Always use `AsNoTracking()` or project to DTOs.
- **Maintaining two separate database migration engines**: Using EF Core migrations for some tables and raw SQL scripts or Flyway for others causes schema drift and deployment chaos. Keep schema migrations unified in EF Core.
- **Ignoring SQL injection risks with dynamic Dapper queries**: Never concatenate user input directly into Dapper SQL strings (`"WHERE Name = '" + input + "'"`). Always pass parameterized objects (`new { Name = input }`).

## If an interviewer asks

**30-second answer:** EF Core is a full ORM offering change tracking, unit-of-work transactions, and schema migrations for complex domain models. Dapper is a lightweight micro-ORM optimized for fast raw SQL mapping without tracking overhead. In modern .NET architectures, we use EF Core for domain writes and transactional operations, and use Dapper (or EF Core untracked projections) for high-performance reporting and complex SQL queries.

**Strong answer:** The belief that "Dapper is always needed for performance" is outdated. In modern .NET 8/9/10, EF Core compiled LINQ projections (`.AsNoTracking().Select()`) achieve within 2-5% of Dapper's speed. In enterprise architectures, we adopt a pragmatic hybrid model: EF Core manages aggregate roots, domain invariants, optimistic concurrency (`RowVersion`), and migrations. We bring in Dapper specifically when queries require SQL Server Table-Valued Parameters, recursive CTEs, or window functions, enlisting Dapper directly into EF Core's ambient `DbTransaction` to guarantee transactional consistency across writes.

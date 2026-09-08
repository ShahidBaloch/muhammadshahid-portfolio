---
title: "Repository Definition and Meaning (With .NET Examples)"
description: "Repository definition and meaning explained — what a repository is in software, define repository in plain English, and how the repository pattern applies to EF Core and ASP.NET Core."
date: "2026-09-08"
updated: "2026-09-08"
category: "design-patterns"
tags: ["Repository Pattern", "EF Core", ".NET", "Architecture", "Data Access", "Design Patterns"]
related:
  - repository-pattern-dotnet
  - ef-core-specification-pattern
  - clean-architecture-aspnet-core
faq:
  - q: "What is the repository definition in software?"
    a: "A repository is an abstraction that mediates between domain logic and data storage. It exposes named operations (get by id, list with filter, add, update) so application code does not scatter raw SQL or LINQ. In .NET, it is often an interface implemented with EF Core."
  - q: "Define repository in simple terms."
    a: "A repository is a collection-like gateway to persisted objects. You ask for Orders by status; it runs the query. Callers think in business terms, not table joins."
  - q: "What does repository mean in .NET?"
    a: "Usually IOrderRepository or similar — methods like GetDetailForInvoiceAsync backed by DbContext. DbContext itself is already a unit-of-work repository; extra layers must earn their keep."
  - q: "Is a repository the same as a database?"
    a: "No. The database stores data. The repository is the code boundary that reads and writes it with a stable API for the rest of the application."
---

Search **repository definition**, **define repository**, or just **repository** and you get mixed results — Git hosting, design patterns, and generic English. This page defines **repository in software** and connects it to **.NET and EF Core**.

Implementation guide: [repository pattern in .NET](/blog/repository-pattern-dotnet). Query reuse: [specification pattern](/blog/ef-core-specification-pattern).

## Repository definition (software)

**Definition:** A **repository** is a **persistence abstraction** that presents a collection-like interface for accessing domain objects. Application and domain layers call repository methods; the implementation knows how to map to tables, documents, or APIs.

```text
Application service / MediatR handler
              │
              ▼
      IOrderRepository  ←── contract (definition lives here)
              │
              ▼
   EfOrderRepository (DbContext, LINQ, SQL)
              │
              ▼
         SQL Server
```

**Purpose:** isolate **how data is stored** from **what the business wants to do**.

## Define repository in plain English

To **define repository** without jargon:

> A repository is the **single door** your code uses to get or save records of one kind — orders, patients, products — using **named operations** instead of ad-hoc queries everywhere.

Analogy: a library catalog desk. You ask for "books by author X published after 2020." The desk (repository) knows the stacks (database). You do not wander the shelves from every room in the building.

## Repository meaning in domain-driven design

In **DDD**, a repository:

- Represents a **collection of aggregates** (usually one aggregate root per repository)
- Hides **persistence mechanics** (EF Core, Dapper, Cosmos)
- Returns **domain objects** or **read models**, not `DataRow`
- Enforces **consistency boundaries** — load an `Order` with its `Lines` as one unit when needed

It is **not** a generic `GetAll()` on every table unless your domain truly treats every entity as a flat CRUD row.

## Repository vs DbContext in .NET

| | **Repository (interface)** | **DbContext (EF Core)** |
|---|---|---|
| **Role** | Named persistence port | ORM + unit of work |
| **Typical methods** | `GetBoardItemsAsync(filter)` | `DbSet<Order>`, `SaveChangesAsync` |
| **When to add** | Reused complex queries, test seams | Always — EF is the implementation |
| **Risk** | Ceremony wrapper over `DbSet` | Leaking `IQueryable` to handlers |

**Key insight:** `DbContext` **is already** a repository and unit of work. `DbSet<T>` is the collection gateway. Add `IOrderRepository` when it **reduces coordination cost** — not by default.

```csharp
public interface IOrderReadRepository
{
    Task<OrderDetailDto?> GetDetailForInvoiceAsync(Guid orderId, CancellationToken ct);
    Task<IReadOnlyList<OrderBoardItem>> GetBoardItemsAsync(
        OrderBoardFilter filter, CancellationToken ct);
}
```

That is a **repository** in the useful sense — business-language methods, one place to tune SQL.

## Repository vs DAO vs service

| Pattern | Focus |
|---|---|
| **Repository** | Collection-like access to aggregates |
| **DAO (Data Access Object)** | Lower-level CRUD per table — common in Java, less idiomatic in modern .NET |
| **Application service** | Orchestrates use cases; may call repositories |
| **Specification** | Composable query objects used *inside* or *instead of* fat repositories |

## When the repository pattern helps

1. **Same complex query in three handlers** — centralize in `ICaseReadRepository`
2. **Testing orchestration** — mock `IOrderRepository`, not `DbSet<Order>`
3. **Swappable persistence** — rare; usually you still have one EF database

## When repository is overkill

- `IRepository<T>` with `GetAll`, `GetById`, `Delete` on every entity
- Pass-through wrappers that only forward to `DbContext` with no named query
- Hiding `IQueryable` until every method is `GetByIdWithDetailsAndAlso…`

Decision guide: [repository pattern useful vs overkill](/blog/repository-pattern-dotnet).

## If an interviewer asks

**"Define repository."**  
Persistence abstraction presenting a collection interface for an aggregate — hides storage details from domain logic.

**"DbContext vs repository?"**  
DbContext is the EF implementation of unit-of-work + repository. Extra interfaces should encode **named queries**, not duplicate `DbSet`.

**"Repository vs specification?"**  
Repository is the port; specification composes query predicates. Use specifications when filters combine; use focused repository methods when the query is stable and named.

Hub: [design patterns](/learning/design-patterns).

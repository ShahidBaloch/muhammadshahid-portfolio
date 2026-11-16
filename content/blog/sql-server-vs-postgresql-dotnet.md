---
title: "SQL Server vs PostgreSQL for .NET Apps: An Honest Comparison"
description: "SQL Server vs PostgreSQL for ASP.NET Core and EF Core apps: licensing cost, tooling, Azure hosting, JSON, concurrency, and when I'd pick each one."
date: "2026-11-16"
category: "ef-core"
tags: ["SQL Server", "PostgreSQL", "EF Core", "Azure"]
related:
  - sql-server-performance-tuning-checklist
  - dapper-vs-ef-core
  - azure-app-service-aspnet-core
faq:
  - q: "Is PostgreSQL good for .NET applications?"
    a: "Yes. The Npgsql driver and its EF Core provider are mature and fast, and many production .NET apps run on PostgreSQL. You lose some SQL Server-specific tooling, not core functionality."
  - q: "Is PostgreSQL cheaper than SQL Server?"
    a: "The software is free under an open-source license, while SQL Server Standard and Enterprise need paid licenses. On managed cloud hosting the gap is smaller, because you pay for compute and storage either way."
  - q: "Can I switch from SQL Server to PostgreSQL with EF Core?"
    a: "It's possible, but not just a provider swap. Raw SQL, stored procedures, case sensitivity, date types, and identity columns all need checking, and existing migrations have to be regenerated."
---

Clients ask me about SQL Server vs PostgreSQL at the start of nearly every new .NET project. Ten years ago the answer for a .NET shop was almost always SQL Server. Today it's a real choice. Both are excellent databases, EF Core supports both well, and the deciding factors are usually cost, team skills and hosting, not raw features.

Here's how I think about it, from the point of view of someone who works mostly with SQL Server and .NET.

## The short version

| | SQL Server | PostgreSQL |
|---|---|---|
| License | Paid (Express and Developer editions free, with limits) | Free, open source |
| .NET driver | Microsoft.Data.SqlClient | Npgsql |
| EF Core provider | Microsoft, first-party | Npgsql team, very mature |
| Tooling | SSMS, Query Store, Profiler/XEvents, Azure Data Studio | pgAdmin, psql, pg_stat_statements, many third-party tools |
| Azure managed | Azure SQL Database / Managed Instance | Azure Database for PostgreSQL |
| JSON | `JSON_VALUE`, `OPENJSON` (native `json` type in newest versions) | `jsonb` with GIN indexes, very strong |
| Default read behaviour | Locking reads (unless you enable RCSI) | MVCC: readers don't block writers |
| Case sensitivity | Case-insensitive by default collation | Case-sensitive comparisons by default |

## Cost

This is often what settles the SQL Server vs PostgreSQL decision. On your own servers or VMs, SQL Server Standard and Enterprise are licensed per core, and that adds up fast as you scale. PostgreSQL costs nothing to license.

On managed cloud services the picture changes. Azure SQL Database and Azure Database for PostgreSQL both charge for compute and storage, and for small and medium workloads the bills can be close. Price both for your expected size before deciding on cost alone.

SQL Server Express is free but caps database size at 10 GB and limits memory and CPU. Fine for small internal tools, not for a growing product.

## Developer experience in .NET

SQL Server has a home-field advantage. Visual Studio, SSMS, Azure and the EF Core docs all treat it as the default. Query Store, actual execution plans in SSMS, and Extended Events make performance work comfortable, which is why my [performance tuning checklist](/blog/sql-server-performance-tuning-checklist) leans on them.

PostgreSQL's .NET story is very good too. Npgsql is fast and well maintained, and its EF Core provider supports PostgreSQL-specific features like arrays, `jsonb`, and range types. You'll use `EXPLAIN ANALYZE` instead of graphical plans, and `pg_stat_statements` instead of Query Store. Different tools, same job.

```csharp
// SQL Server
builder.Services.AddDbContext<AppDb>(o => o.UseSqlServer(config.GetConnectionString("Db")));

// PostgreSQL (Npgsql.EntityFrameworkCore.PostgreSQL package)
builder.Services.AddDbContext<AppDb>(o => o.UseNpgsql(config.GetConnectionString("Db")));
```

The setup line is the easy part. The differences show up later.

## Differences that bite during development

- **Case sensitivity.** `WHERE Email = 'Ali@Example.com'` matches `ali@example.com` on a default SQL Server collation, but not on PostgreSQL. Plan for this with lower-cased columns, `citext`, or collations.
- **Identifier casing.** PostgreSQL folds unquoted names to lower case. EF Core quotes them, so it works, but hand-written SQL against `"Orders"` needs the quotes. Many teams use a snake_case naming convention package to avoid this.
- **Dates.** `datetime2` vs `timestamp`/`timestamptz`. Npgsql is strict about `DateTimeKind`: writing a local `DateTime` into a `timestamptz` column throws. Use UTC everywhere.
- **Stored procedures and T-SQL.** PostgreSQL has functions and procedures in PL/pgSQL, but none of your T-SQL ports over unchanged.
- **Locking behaviour.** PostgreSQL readers never block writers. On SQL Server you get that by turning on [READ_COMMITTED_SNAPSHOT](/blog/sql-server-deadlocks-snapshot-isolation), which I recommend for most new OLTP databases anyway.

## When I'd pick SQL Server

- The company already runs SQL Server and has people who know it.
- Heavy reporting with SSRS or Power BI, or close ties to other Microsoft data tools.
- The team relies on SQL Server tooling for tuning and support.
- Enterprise healthcare or finance clients whose IT teams already approve and audit SQL Server.

## When I'd pick PostgreSQL

- A new product where licensing cost matters, especially self-hosted or in containers.
- Strong JSON needs: `jsonb` with GIN indexes is excellent for semi-structured data.
- A multi-cloud or Linux-first setup.
- Features like arrays, range types, or extensions such as PostGIS and pgvector.

## Switching later

Teams sometimes settle SQL Server vs PostgreSQL "for now" and plan to switch later. With EF Core that's doable, but budget real time for it. Migrations need regenerating, raw SQL needs rewriting, and every query that depended on case-insensitive comparison needs testing. If you've used Dapper for hot paths, those queries need review too. See [Dapper vs EF Core](/blog/dapper-vs-ef-core) for how I split those.

## My take

For most .NET business apps, SQL Server vs PostgreSQL won't decide whether the project succeeds. Schema design, indexes, and query shape matter far more. Pick the one your team can run and tune well, write UTC dates, keep raw SQL in a few known places, and you'll be fine with either.

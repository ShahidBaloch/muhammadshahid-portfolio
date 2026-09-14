---
title: "EF Core and SQL Server Articles"
---

## Introduction

This page is the **article map** for EF Core on ASP.NET Core. Open the symptom-specific post for deep answers — this index does not replace them.

| You want… | Open |
|---|---|
| **Performance checklist** | [EF Core SQL performance](/blog/ef-core-sql-performance) |
| **N+1 / Include / AsSplitQuery** | [N+1 guide](/blog/ef-core-nplus1-include-vs-assplitquery) |
| **Cartesian explosion** | [Two collection Includes](/blog/ef-core-cartesian-explosion-multiple-include) |
| **Relationships 1-1 / 1-n / n-n** | [EF relationships](/blog/ef-core-relationships) |
| **AsNoTracking identity** | [AsNoTracking](/blog/ef-core-asnotracking-vs-identity-resolution) |
| **Parameter sniffing** | [Parameter sniffing](/blog/ef-core-sql-server-parameter-sniffing) |
| **Interview scenarios** | [EF Core interview questions](/blog/ef-core-interview-questions) |

## Mental model (one minute)

EF Core translates LINQ to SQL, tracks entities in a scoped `DbContext`, and materializes results. Most production pain is query shape (too many round-trips, fat Includes, tracking on read-only lists) — start with the [performance checklist](/blog/ef-core-sql-performance).

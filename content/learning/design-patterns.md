---
title: "C# Design Patterns"
---

## Introduction

**C# design patterns** are named solutions to **recurring structure problems** — not badges to sprinkle on every class. This hub covers patterns I actually use on ASP.NET Core APIs consumed by Angular clients: **Factory**, **Strategy**, **Repository**, **Specification**, and **SOLID** as a review lens.

## What a design pattern is (and is not)

A **pattern** documents a trade-off that worked often enough to name:

- **Factory** — construction logic outgrew `new` scattered in controllers.
- **Strategy** — behavior varies by tenant, product line, or rule set without editing every caller.
- **Repository** — a query or command shape deserves a name and test seam.

A pattern is **not** automatically good. Ceremony without a second implementation is wallpaper.

## Real-world analogy

Patterns are **kitchen stations**, not duplicate appliances:

- You add a **pastry station** (Strategy for pricing rules) when the menu branch has its own tools and timing — not because every restaurant owns two ovens.
- **Factory** is the prep line that knows how to build tonight’s special — callers order “special,” not which knife to use.

## SOLID as a review checklist (not a folder religion)

| Principle | Practical question |
|---|---|
| **S** | Does this class change for two unrelated reasons? |
| **O** | Can I add a variant without editing a giant switch? |
| **L** | Can I substitute implementations without breaking callers? |
| **I** | Is this interface only what clients need? |
| **D** | Do high-level handlers depend on abstractions, not `new SqlConnection`? |

## When Factory vs Strategy vs Repository

| Pattern | Use when | Skip when |
|---|---|---|
| **Factory** | Object graph depends on config/tenant | One concrete type forever |
| **Strategy** | Swap algorithm at runtime | One `if` that will not grow |
| **Repository** | Query/command reused across handlers | Thin wrapper over `DbContext` with no name |
| **Specification** | Composable filters for EF queries | Single `Where` used once |

## Interview cross-questions

1. **Repository vs DbContext directly?** — Repository when query *shape* is the abstraction; otherwise handler + EF is fine.
2. **Strategy vs switch statement?** — Strategy when variants grow or are configured; switch OK for two stable branches.
3. **Is Specification just LINQ in a class?** — Yes, when it composes and reuses; no, when it is one line wrapped for fashion.

## Deep-dive articles

| Pattern | Article |
|---|---|
| SOLID on ASP.NET Core | [SOLID principles](/blog/solid-principles-aspnet-core) |
| Factory | [C# Factory pattern](/blog/csharp-factory-pattern) |
| Strategy | [C# Strategy pattern](/blog/csharp-strategy-pattern) |
| Repository | [Repository pattern .NET](/blog/repository-pattern-dotnet) |
| Specification + EF | [EF Core Specification](/blog/ef-core-specification-pattern) |

---
title: "Dependency Injection in .NET"
---

## Introduction

**Dependency injection (DI)** in ASP.NET Core wires implementations to interfaces at startup so controllers and handlers stay testable. Most readers already know what IoC is — they need **lifetimes**, **transient vs scoped**, **Unable to resolve service**, or why a **Singleton** broke their `DbContext`.

## What DI does

The built-in container:

1. Registers services in `Program.cs` (`AddScoped`, `AddSingleton`, `AddTransient`).
2. Resolves constructor parameters when creating a controller or `BackgroundService`.
3. Disposes scoped/singleton disposables when the scope or app ends.

**You still own the graph** — `new` in a handler bypasses the container and hides dependencies.

## Real-world analogy

DI is **hiring through HR with a roster**, not calling freelancers from memory:

- **Singleton** — one company-wide printer (one instance for the app).
- **Scoped** — one badge per visitor per day (per HTTP request).
- **Transient** — a new disposable glove for each procedure (new instance every resolve).

Putting a **scoped badge** (DbContext) in the **company safe** (Singleton) is a **captive dependency** — the badge outlives the visit.

## Lifetimes (the table that matters)

| Lifetime | Created | Typical use | Wrong use |
|---|---|---|---|
| **Singleton** | Once per app | Config, caches, `HttpClient` factory | Holding scoped DbContext |
| **Scoped** | Per request | DbContext, unit of work | Capturing in singleton |
| **Transient** | Every resolve | Lightweight stateless helpers | Heavy objects resolved hundreds of times per request |

## Common failures

| Exception / symptom | Cause |
|---|---|
| `Unable to resolve service for type X` | Never registered, wrong assembly scan, generic open type |
| `Cannot consume scoped from singleton` | Captive dependency at startup validation (sometimes) |
| Wrong tenant data | Singleton service holding request state |
| `IOptions` stale config | Using `IOptions` instead of `IOptionsSnapshot` when file reloads |

## Registration smells in code review

| Smell | Fix |
|---|---|
| `services.AddSingleton<MyDbContext>()` | Scoped — always |
| `new HttpClient()` in a service | `IHttpClientFactory` |
| `ServiceProvider` in a singleton | `IServiceScopeFactory` for per-message scopes |
| Giant `Program.cs` with 200 `Add*` lines | Extension methods per bounded context |

## Testing the graph

Integration tests should build the **same `Program.cs` registrations** (or `WebApplicationFactory`) — not `new ServiceCollection()` with three fakes that do not match production lifetimes.

## Interview cross-questions

1. **Why is DbContext scoped?** — Not thread-safe; aligns with request unit of work.
2. **Keyed services vs factory delegate?** — Keyed when multiple implementations of same interface; factory when construction needs runtime input.
3. **`IOptions` vs `Snapshot` vs `Monitor`?** — Snapshot reloads on scope; Monitor pushes change notifications.

## Deep-dive articles

| Topic | Article |
|---|---|
| Lifetimes checklist | [ASP.NET Core DI](/blog/aspnet-core-dependency-injection) |
| Unable to resolve | [Unable to resolve service](/blog/aspnet-core-unable-to-resolve-service) |
| IOptions variants | [IOptions Snapshot Monitor](/blog/aspnet-core-ioptions-snapshot-monitor) |
| Keyed services | [FromKeyedServices](/blog/keyed-services-aspnet-core-fromkeyedservices) |

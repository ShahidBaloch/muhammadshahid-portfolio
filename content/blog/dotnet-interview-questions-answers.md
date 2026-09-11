---
title: ".NET Interview Questions and Answers (C# and ASP.NET Core)"
description: ".NET interview questions and answers for mid-to-senior roles — .NET Core, ASP.NET Core Web API, C# async, EF Core, Angular integration, with links to full scenario write-ups."
date: "2026-09-08"
updated: "2026-09-11"
category: "interview-questions"
tags: ["Interview Questions", "C#", "ASP.NET Core", ".NET", "Career", "Web API"]
related:
  - csharp-async-await-interview-questions
  - aspnet-core-interview-questions-scenarios
  - csharp-expert-interview-questions
  - ef-core-interview-questions
  - angular-interview-questions-aspnet-core
faq:
  - q: "What are common .NET interview questions?"
    a: "Mid-level loops cover C# async await (.Result starvation, async void, WhenAll on one DbContext), ASP.NET Core DI lifetimes, JWT with Angular, middleware order, and EF Core N+1. Senior loops add IAsyncEnumerable exports, tenant-safe caches, Channels, and SQL deadlocks under load."
  - q: "What ASP.NET Core interview questions are asked most?"
    a: "Captive dependencies (singleton holding DbContext), 401 vs 403, thread pool starvation from sync-over-async, validation envelopes for SPAs, and middleware order (CORS before auth failures). Scenario answers live on the ASP.NET Core interview questions page."
  - q: "What .NET Core interview questions should I prepare?"
    a: "The same production stories as ASP.NET Core Web API loops — DI lifetimes, JWT, middleware, and EF N+1. .NET Core is the old product name; interviewers still say it. Use the Web API scenarios page, not a Framework-era dump."
  - q: "What web API interview questions come up on .NET panels?"
    a: "JWT that works in Postman but not Angular, 401 vs 403, ProblemDetails validation envelopes, rate limits on login, and pagination instead of unbounded lists. Full answers: ASP.NET Core interview questions scenarios."
  - q: "What C# interview questions and answers should I prepare?"
    a: "Task vs Thread, async vs multithreading, lock vs SemaphoreSlim, ConfigureAwait in libraries, and production failure stories — not syntax trivia. Start with async await interview questions, then expert scenarios for staff loops."
  - q: "How do I study .NET interview questions efficiently?"
    a: "Pick one track: async, ASP.NET Core scenarios, EF Core, or Angular integration. Read the scenario prompt, answer aloud, then compare to the strong answer. Link to how-to articles for merge-checklist depth."
  - q: "Are .NET test questions and MCQs enough?"
    a: "MCQs test recall. Mid-to-senior loops test scenarios. Use this hub for the latter. If a take-home includes net questions as multiple choice, still answer with a production story — captive DbContext beats defining IoC."
---

If you search **.NET interview questions**, **.NET Core interview questions**, **ASP.NET Core interview questions**, **web API interview questions**, or **C# interview questions and answers**, you want a **map** — not a 200-line dump copied from a PDF.

This page is that map: the questions I actually ask and hear in healthcare, SaaS, and marketplace hiring loops, with links to **full scenario answers** on dedicated URLs.

## How to use this guide

1. Pick your level (mid vs staff)
2. Open the linked article for each topic
3. Rehearse **out loud** — definition, production symptom, fix
4. Read the how-to post when you need merge-checklist depth

Hub: [interview questions](/learning/interview-questions).

## .NET interview questions by topic

### C# and async (most common mid-level loop)

| Question | Short answer | Full scenario |
|---|---|---|
| Does `async` create a thread? | No for I/O — yields the worker | [Async await interview questions](/blog/csharp-async-await-interview-questions) |
| `.Result` on ASP.NET Core? | Thread pool starvation, not UI deadlock | [Thread pool starvation](/blog/csharp-threadpool-starvation-sync-over-async) |
| `async void` on a controller? | Unobserved exceptions — use `Task` | [Async await interview questions](/blog/csharp-async-await-interview-questions) |
| `WhenAll` on one `DbContext`? | Race — not thread-safe | [WhenAll vs Parallel](/blog/csharp-task-whenall-vs-parallel-foreach) |
| `Task` vs `Thread`? | Promise vs OS worker | [Task vs Thread](/blog/csharp-task-vs-thread) |
| `ConfigureAwait(false)` on API? | Library rule, not controller default | [ConfigureAwait](/blog/csharp-configureawait-false-library) |

Definitions: [asynchronous meaning](/blog/asynchronous-meaning-definition), [async vs sync](/blog/async-vs-sync-programming).

### ASP.NET Core interview questions

| Question | Short answer | Full scenario |
|---|---|---|
| Captive dependency? | Singleton captured scoped `DbContext` | [ASP.NET Core scenarios](/blog/aspnet-core-interview-questions-scenarios) |
| 401 vs 403? | Not authenticated vs forbidden | [401 vs 403](/blog/aspnet-core-401-vs-403) |
| Middleware order? | CORS, exception handling, auth, authz | [Middleware order](/blog/aspnet-core-middleware-order) |
| JWT works in Postman, not Angular? | CORS, cookie vs bearer, clock skew | [JWT auth](/blog/aspnet-core-jwt-auth) |
| Why idle CPU and 504s? | Sync-over-async starving pool | [Starvation](/blog/csharp-threadpool-starvation-sync-over-async) |

Full narrative answers: [ASP.NET Core interview questions scenarios](/blog/aspnet-core-interview-questions-scenarios).

### C# interview questions and answers (staff / expert)

| Question | Short answer | Full scenario |
|---|---|---|
| Export 200k rows OOM? | `IAsyncEnumerable`, project in SQL | [Expert interview questions](/blog/csharp-expert-interview-questions) |
| Multi-tenant cache leak? | Key must include `tenantId` | [ConcurrentDictionary](/blog/csharp-concurrentdictionary-lock) |
| Fire-and-forget email? | `Channel` + `BackgroundService` | [BackgroundService async](/blog/csharp-backgroundservice-hosted-service-async) |
| Deadlock vs starvation? | UI sync context vs pool queue | [Deadlock explained](/blog/deadlock-csharp-explained) |

### EF Core interview questions

| Question | Short answer | Full scenario |
|---|---|---|
| N+1? | Loop + lazy load or missing Include | [EF interview questions](/blog/ef-core-interview-questions) |
| Include vs AsSplitQuery? | JOIN explosion vs multiple SQL | [N+1 Include AsSplitQuery](/blog/ef-core-nplus1-include-vs-assplitquery) |
| Lost update vs deadlock? | RowVersion vs RCSI | [Optimistic concurrency](/blog/ef-core-optimistic-concurrency-token) |
| Global query filter pitfall? | `IgnoreQueryFilters` for admin | [EF interview questions](/blog/ef-core-interview-questions) |
| 1-1 / 1-n / n-n mapping? | Owned vs skip join vs join entity | [EF Core relationships](/blog/ef-core-relationships) |

### Angular + ASP.NET Core interview questions

| Question | Short answer | Full scenario |
|---|---|---|
| Refresh token race? | Queue 401s, single refresh | [401 refresh queue](/blog/angular-interceptor-401-refresh-queue) |
| JWT interceptor design? | Attach bearer, handle 401 | [Angular JWT interceptors](/blog/angular-jwt-interceptors) |
| Auth guard vs API? | Guard is UX; API enforces | [Auth guard](/blog/angular-auth-guard-aspnet-core) |

Full list: [Angular interview questions](/blog/angular-interview-questions-aspnet-core).

## ASP.NET Core / .NET Core / Web API interview questions

**.NET Core interview questions** and **ASP.NET Core Web API interview questions** are the same loop under two names. Interviewers still say ".NET Core." Rehearse the scenarios page, then EF relationships, then Angular refresh races.

**Net questions**, **net test questions**, and **dot net MCQs** belong on a screening quiz, not a senior panel. If you get them, map each tick-box to a scenario on this hub instead of memorizing a PDF.

## Sample C# interview questions and answers

### Q: What is the difference between `async` and `multithreading`?

**Answer:** `async/await` frees the ThreadPool worker during I/O waits — the `Task` is a promise, not a dedicated thread. Multithreading runs work on multiple workers (`Task.Run`, `Parallel`, `lock`). On ASP.NET Core APIs, default to async for SQL and HTTP; use threading for CPU offload and in-memory gates.

### Q: What is dependency injection?

**Answer:** Inversion of control — the framework constructs services and injects them. Lifetimes matter: **Singleton** (one per app), **Scoped** (per request — `DbContext`), **Transient** (every resolve). Never inject scoped into singleton without a scope factory.

### Q: What is Clean Architecture?

**Answer:** Domain and application rules at the center; infrastructure and UI at the edges. Controllers stay thin. Goal is testable boundaries — not copying folder templates without domain complexity. [Clean Architecture guide](/blog/clean-architecture-aspnet-core).

### Q: Repository pattern — yes or no?

**Answer:** `DbContext` is already a unit of work. Add repositories for **named, reused queries** — not generic `IRepository<T>` on every entity. [Repository definition](/blog/repository-definition-meaning).

## Study order (recommended)

```text
Week 1 — Async track
  asynchronous meaning → async await interview questions → starvation how-to

Week 2 — ASP.NET Core track
  ASP.NET Core scenarios → DI lifetimes → JWT + Angular interceptors

Week 3 — Data track
  EF Core interview questions → relationships how-to → N+1 / AsSplitQuery

Week 4 — Staff polish
  Expert interview questions → Channels, IAsyncEnumerable
```

## If an interviewer asks

**"What .NET interview questions should a senior know?"**  
Production failures: tenant cache leaks, starvation dumps, JWT rotation, EF concurrency, and API design tradeoffs — not keyword lists.

**"ASP.NET Core vs .NET interview questions?"**  
.NET is the runtime and language. ASP.NET Core / Web API questions are web-specific: pipeline, auth, hosting, EF in request scope. ".NET Core" in a job spec almost always means that web loop, not Framework.

All tracks: [interview questions hub](/learning/interview-questions).

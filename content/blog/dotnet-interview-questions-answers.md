---
title: ".NET Interview Questions and Answers (C#, ASP.NET Core, .NET Core)"
description: ".NET interview questions and answers for mid-to-senior roles — net interview questions, .NET Core interview questions, ASP.NET Core Web API, C# async, EF Core, and Angular scenarios with strong answers and red flags."
date: "2026-09-08"
updated: "2026-09-14"
category: "interview-questions"
tags:
  [
    ".NET Interview Questions",
    ".NET Core Interview Questions",
    "Interview Questions",
    "C#",
    "ASP.NET Core",
    ".NET",
    "Web API",
    "Career",
  ]
related:
  - csharp-async-await-interview-questions
  - aspnet-core-interview-questions-scenarios
  - csharp-expert-interview-questions
  - ef-core-interview-questions
  - angular-interview-questions-aspnet-core
faq:
  - q: "What are the most common .NET interview questions?"
    a: "Panels cluster around async/await pitfalls, DI lifetimes (captive dependencies), middleware order, JWT vs Angular, EF Core N+1 and concurrency, and API design (401 vs 403, ProblemDetails). Use the topic tables on this page, then open the linked scenario articles for full answers."
  - q: "What .NET Core interview questions should I prepare?"
    a: ".NET Core interview questions are the same loop as ASP.NET Core Web API today — pipeline, auth, hosting, and EF in request scope. Start with the ASP.NET Core scenarios section here, then [ASP.NET Core interview questions](/blog/aspnet-core-interview-questions-scenarios)."
  - q: "What are net interview questions vs MCQs?"
    a: "Net interview questions on mid-to-senior panels are scenario prompts (production failures, tradeoffs). Net test questions and MCQs belong on screenings — map each tick-box to a scenario on this guide instead of memorizing a PDF."
  - q: "What ASP.NET Core interview questions are asked most?"
    a: "Captive DI, middleware order, 401 vs 403, JWT that works in Postman but not Angular, and idle-CPU 504s from sync-over-async. Full narratives: [ASP.NET Core interview questions](/blog/aspnet-core-interview-questions-scenarios)."
  - q: "What C# interview questions and answers should I rehearse first?"
    a: "Start with [async await interview questions](/blog/csharp-async-await-interview-questions) (`.Result`, `async void`, `WhenAll` + one `DbContext`), then [expert C#](/blog/csharp-expert-interview-questions) for staff runtime loops."
  - q: "How do I study .NET interview questions efficiently?"
    a: "Pick one track below. Read the prompt, answer aloud (symptom → cause → fix), then compare to the strong answer and red flag. Depth lives on the linked how-to posts."
  - q: "Where is the full .NET interview question bank on this site?"
    a: "This article is the bank and map. The [interview questions hub](/learning/interview-questions) only routes into async, ASP.NET Core, EF Core, and Angular tracks."
---

Whether the job post says **.NET interview questions**, **net interview questions**, **.NET Core interview questions**, or **ASP.NET Core Web API**, hiring loops test the same thing: can you diagnose production failures and defend a fix?

This guide is the question bank for that loop — topic tables, on-page sample answers with **strong answer / red flag**, and links to full scenario write-ups. It is not a 300-line MCQ dump.

Hub index: [interview questions](/learning/interview-questions).

## How to use these .NET interview questions

1. Pick your level (mid vs staff)
2. Rehearse the sample answers on this page out loud
3. Open the linked article when you need the full scenario
4. Read the how-to post when you need a merge checklist

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

### ASP.NET Core / .NET Core interview questions

| Question | Short answer | Full scenario |
|---|---|---|
| Captive dependency? | Singleton captured scoped `DbContext` | [ASP.NET Core scenarios](/blog/aspnet-core-interview-questions-scenarios) |
| 401 vs 403? | Not authenticated vs forbidden | [401 vs 403](/blog/aspnet-core-401-vs-403) |
| Middleware order? | CORS, exception handling, auth, authz | [Middleware order](/blog/aspnet-core-middleware-order) |
| JWT works in Postman, not Angular? | CORS, cookie vs bearer, clock skew | [JWT auth](/blog/aspnet-core-jwt-auth) |
| Why idle CPU and 504s? | Sync-over-async starving pool | [Starvation](/blog/csharp-threadpool-starvation-sync-over-async) |

**.NET Core interview questions** and **ASP.NET Core Web API interview questions** are the same panel under two names. Interviewers still say ".NET Core." Full narratives: [ASP.NET Core interview questions scenarios](/blog/aspnet-core-interview-questions-scenarios).

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

## Sample .NET interview questions and answers

Use this format in the room: **symptom → cause → fix**. Red flags are what junior dumps sound like.

### Q: What is the difference between `async` and `multithreading`?

**Strong answer:** `async/await` frees the ThreadPool worker during I/O waits — the `Task` is a promise, not a dedicated thread. Multithreading runs work on multiple workers (`Task.Run`, `Parallel`, `lock`). On ASP.NET Core APIs, default to async for SQL and HTTP; use threading for CPU offload and in-memory gates.

**Red flag:** "Async creates a new thread for every call" or "always wrap DB calls in `Task.Run`."

### Q: What is dependency injection in .NET?

**Strong answer:** Inversion of control — the container constructs services and injects them. Lifetimes matter: **Singleton** (one per app), **Scoped** (per request — `DbContext`), **Transient** (every resolve). Never inject scoped into singleton without an `IServiceScopeFactory`.

**Red flag:** Listing lifetimes without naming captive dependency or why `DbContext` is scoped.

### Q: Captive dependency — what breaks in production?

**Strong answer:** A singleton service that holds a scoped `DbContext` (or other scoped dependency). Under load you see cross-request data leaks, disposed-context exceptions, or stale tenants. Fix: inject a factory, create a scope per operation, or demote the consumer to scoped.

**Red flag:** "Just make everything singleton" or "DbContext is fine as a singleton because EF is thread-safe" (it is not).

### Q: 401 vs 403 on a Web API?

**Strong answer:** **401** — not authenticated (missing/invalid token). **403** — authenticated but not authorized. SPA interceptors that treat every 403 as "log out" create false logout storms.

**Red flag:** Using 401 for both missing login and missing permission.

### Q: Repository pattern — yes or no?

**Strong answer:** `DbContext` is already a unit of work. Add repositories for **named, reused queries** — not generic `IRepository<T>` on every entity. Prefer query objects or application services when the "repository" is a thin wrapper over `Set<T>()`.

**Red flag:** "Always wrap EF in a generic repository for Clean Architecture" with no named query examples. Details: [repository definition](/blog/repository-definition-meaning).

### Q: What is Clean Architecture in ASP.NET Core?

**Strong answer:** Domain and application rules at the center; infrastructure and UI at the edges. Controllers stay thin. Goal is testable boundaries — not copying folder templates without domain complexity. [Clean Architecture guide](/blog/clean-architecture-aspnet-core).

**Red flag:** Equating Clean Architecture with "lots of folders" and no domain invariants.

### Q: N+1 in EF Core — how do you prove it?

**Strong answer:** Loop that triggers lazy loads or missing `Include`/`Select` projections. Prove with SQL logging or a profiler (many round-trips). Fix with includes, split queries, or projecting only needed columns. [EF Core interview questions](/blog/ef-core-interview-questions).

**Red flag:** "Always use `Include` on every navigation" without talking about cartesian explosion or `AsSplitQuery`.

## Net interview questions vs MCQs

**Net questions**, **net test questions**, and **dot net MCQs** belong on a screening quiz, not a senior panel. If you get them, map each tick-box to a scenario on this guide instead of memorizing a PDF.

## Study order (recommended)

```text
Week 1 — Async track
  asynchronous meaning → async await interview questions → starvation how-to

Week 2 — ASP.NET Core / .NET Core track
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

**"Where should I start tonight?"**  
One async scenario + one captive-DI scenario + one EF concurrency scenario. Answer aloud, then open the linked full article.

All tracks: [interview questions hub](/learning/interview-questions).

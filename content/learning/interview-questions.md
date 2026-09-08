---
title: "C# and ASP.NET Core Interview Questions"
---

## Introduction

**C# and ASP.NET Core interview questions** on this site are **scenario-based** — production failures, merge-review judgment, and oral answers you can defend under follow-up. This page explains how to use the interview hub before you open individual question lists.

## What “scenario-based” means

A scenario question gives you a symptom, not a definition prompt:

- “Morning load, CPU idle, 504s — what do you check?”
- “Two tabs save the same fee header — what broke?”
- “Angular logs out on 403 — is that auth or authorization?”

**Strong answers** name the failure mode, the fix direction, and one trade-off. **Weak answers** recite textbook definitions without connecting to ASP.NET Core or EF Core behavior.

## Real-world analogy

Think of an interview as a **production incident tabletop**, not a flashcard deck:

- **Flashcard mode:** “What is DI?” → one sentence, no depth.
- **Tabletop mode:** “Singleton holds Scoped DbContext — what happens on the second request?” → you trace lifetimes, captive dependency, and the exception message.

Hiring teams use scenarios because they predict whether you have **debugged real systems**, not whether you memorized acronyms.

## How interview posts map to how-to articles

| Layer | Purpose |
|---|---|
| **This hub + interview posts** | Oral rehearsal — definition, prompt, strong/weak answer |
| **Topic how-tos** (async, EF Core, auth) | Merge checklists — code you would write in a PR |

Do not memorize interview answers without knowing the implementation article. Interviewers follow up: “Show me the controller shape” or “What does the SQL look like?”

## Cross-questions interviewers ask after your first answer

| After you say… | Common follow-up |
|---|---|
| “Use async all the way” | “Does async make SQL faster?” |
| “DbContext is not thread-safe” | “So how do you parallelize two queries?” |
| “Return 403 for missing permission” | “Why does Angular log the user out?” |
| “RowVersion on PUT” | “What if the client never sends the token back?” |
| “Refresh token rotation” | “What if two tabs refresh at once?” |

## Which interview post to open

| Your weak loop | Start here |
|---|---|
| Async, `.Result`, WhenAll, tokens | [C# async await interview questions](/blog/csharp-async-await-interview-questions) |
| Staff runtime — Channels, Span, streams | [Expert C# interview questions](/blog/csharp-expert-interview-questions) |
| Middleware, JWT, validation, pipelines | [ASP.NET Core scenarios](/blog/aspnet-core-interview-questions-scenarios) |
| SaveChanges, filters, concurrency | [EF Core interview questions](/blog/ef-core-interview-questions) |
| Angular + JWT with .NET backend | [Angular interview questions](/blog/angular-interview-questions-aspnet-core) |

Implementation depth: [async & threading](/learning/async-concurrency), [EF Core](/learning/ef-core), [authentication](/learning/authentication).

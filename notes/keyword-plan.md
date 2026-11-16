# Keyword plan — muhammadshahid.dev

Source: Semrush (US database), pulled 2026-11-16. Volume = monthly US searches. KD = keyword difficulty (lower is easier).

## 1. Hire intent → your profile and service pages

| Keyword | Volume | KD | Target page |
|---|---|---|---|
| .net developer | 2,400 | 48 | Homepage (title + H1) |
| hire angular developer | 720 | 14 | New page: /hire-angular-developer |
| net developer | 590 | 39 | Homepage |
| hire .net developer | 480 | 25 | New page: /hire-dotnet-developer |
| .net developers | 260 | 36 | /hire-dotnet-developer |
| dotnet developer | 210 | 35 | Homepage |
| c# developer | 210 | 34 | Homepage / About |
| sql server developer | 210 | 51 | Services (SQL Server section) |
| angular developer | 170 | 28 | /hire-angular-developer |
| .net consultant | 70 | 11 | Services |
| hire dotnet developer | 50 | 28 | /hire-dotnet-developer |

Notes:
- Most ".net developer" searches are by job seekers. The homepage can still rank for it, but the hire pages are where clients convert.
- "hire angular developer" (KD 14) and ".net consultant" (KD 11) are the easiest commercial wins.

## 2. Learner intent → new posts (gaps: no post covers these yet)

Ordered by opportunity (volume vs difficulty vs fit with your experience).

| # | Keyword | Volume | KD | Post angle |
|---|---|---|---|---|
| 1 | sql server performance tuning | 260 | 7 | DONE: /blog/sql-server-performance-tuning-checklist (density 0.53%) |
| 2 | clustered vs nonclustered index | 390 | 26 | DONE: /blog/clustered-vs-nonclustered-index-sql-server (density 0.54%) |
| 3 | c# records | 590 | 29 | DONE: /blog/csharp-records-explained |
| 4 | angular vs react | 2,400 | 34 | DONE: /blog/angular-vs-react-for-business-apps |
| 5 | c# delegates | 210 | 26 | DONE: /blog/csharp-delegates-func-action-events |
| 6 | sql server window functions | 140 | 23 | DONE: /blog/sql-server-window-functions |
| 7 | temp table vs table variable | 70 | 22 | DONE: /blog/temp-table-vs-table-variable-sql-server |
| 8 | sql server vs postgresql | 210 | 28 | DONE: /blog/sql-server-vs-postgresql-dotnet |
| 9 | c# generics | 480 | 36 | DONE: /blog/csharp-generics-constraints-variance |
| 10 | linq group by | 210 | 34 | DONE: /blog/linq-group-by-csharp-ef-core |
| 11 | c# vs java | 880 | 35 | From a C# developer's seat |
| 12 | angular routing | 480 | 42 | Routes, guards, resolvers, lazy routes |
| 13 | angular lazy loading | 70 | 29 | DONE: /blog/angular-lazy-loading-routes |
| 14 | sql server cte | 480 | 51 | DONE: /blog/sql-server-cte-recursive |
| 15 | sql server interview questions | 390 | 39 | Scenario-based, not trivia |
| 16 | sql joins | 6,600 | 51 | Joins explained with one dataset |

## 3. Already covered (improve, don't duplicate)

| Keyword | Volume | KD | Existing post |
|---|---|---|---|
| angular interview questions | 1,600 | 38 | angular-interview-questions-aspnet-core |
| angular signals | 1,000 | 43 | angular-signals-aspnet-core |
| c# interview questions | 880 | 37 | csharp-expert-interview-questions, csharp-oop-interview-questions |
| dependency injection c# | 390 | 47 | aspnet-core-dependency-injection |
| solid principles c# | 390 | 51 | solid-principles-aspnet-core |
| asp.net core identity | 320 | 37 | identityserver-vs-aspnet-identity |
| design patterns c# | 320 | 39 | csharp-factory-pattern, csharp-strategy-pattern |
| angular reactive forms | 210 | 33 | angular-reactive-forms-validation-problemdetails |
| rxjs operators | 210 | 35 | angular-switchmap-exhaustmap-concatmap |
| async await c# | 210 | 37 | csharp-async-await-aspnet-core |
| ef core migrations | 170 | 35 | ef-core-migrations-production |
| .net 10 features | 110 | 45 | dotnet-10-aspnet-core-api-highlights |

## 4. Writing rules for every new post

- Plain English. Short sentences. No filler or hype words.
- Main keyword density 0.45%–0.95% (about 5–9 uses per 1,000 words). Check before publishing.
- First-hand voice: real situations, trade-offs, mistakes, numbers where honest.
- No reused sections or stock phrases across posts. The audit flags "If an interviewer asks" in 133 posts and "Strong answer" in 111 — new posts should not use that template.
- Each post links to 2–3 related posts and one hire/services page.
- Run `npm run audit:uniqueness` before publishing.

---
title: "Software Architecture Articles for .NET"
---

## Introduction

This page is the **article map** for .NET + Angular architecture decisions.

| You want… | Open |
|---|---|
| **Clean Architecture** | [Clean Architecture](/blog/clean-architecture-aspnet-core) |
| **Modular monolith vs microservices** | [Modular monolith](/blog/modular-monolith-vs-microservices-dotnet) |
| **Middleware order** | [Middleware order](/blog/aspnet-core-middleware-order) |
| **appsettings / config** | [appsettings.json](/blog/aspnet-core-appsettings-localappsettings) |
| **Minimal APIs** | [Minimal APIs](/blog/aspnet-core-minimal-apis) |

```text
Angular SPA  →  ASP.NET Core API  →  EF Core  →  SQL Server
                    ↓
              config, middleware, auth, validation, caching
```

Open the linked article for the decision that matches your incident — this index does not replace those guides.

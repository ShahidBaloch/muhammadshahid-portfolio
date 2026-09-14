---
title: "Dependency Injection Articles for .NET"
---

## Introduction

This page is the **article map** for ASP.NET Core DI. Lifetimes, resolve failures, and options variants each own a dedicated URL.

| You want… | Open |
|---|---|
| **Lifetimes / captive dependencies** | [DI in ASP.NET Core](/blog/aspnet-core-dependency-injection) |
| **Unable to resolve service** | [Unable to resolve service](/blog/aspnet-core-unable-to-resolve-service) |
| **IOptions vs Snapshot vs Monitor** | [IOptions guide](/blog/aspnet-core-ioptions-snapshot-monitor) |
| **Keyed services** | [FromKeyedServices](/blog/keyed-services-aspnet-core-fromkeyedservices) |

## What DI does (one-minute map)

The built-in container registers services in `Program.cs`, resolves constructor parameters, and disposes scoped/singleton disposables. Lifetime rules and anti-patterns live on the [DI article](/blog/aspnet-core-dependency-injection) — not this index.

---
title: ".NET Framework vs .NET Core vs .NET 10"
description: ".NET Framework, .NET Core, and current .NET are not three competing frameworks. What each name means, which versions still get patches, and which TargetFramework to pick in 2026."
date: "2026-09-18"
updated: "2026-09-18"
category: "architecture"
tags: [".NET", ".NET Framework", ".NET Core", "ASP.NET Core"]
related:
  - dotnet-interview-questions-answers
  - azure-app-service-aspnet-core
  - docker-dotnet-angular-local
  - clean-architecture-aspnet-core
faq:
  - q: "Is .NET Core the same as .NET?"
    a: ".NET Core was the name through version 3.1. Starting with .NET 5, Microsoft dropped the Core suffix. .NET 8, .NET 9, and .NET 10 are that line. They are not the old .NET Framework."
  - q: "When do .NET 8 and .NET 9 go out of support?"
    a: "Microsoft's support policy lists both as ending on November 10, 2026. After that date there are no new security fixes. .NET 10 is the current long-term release, supported until November 14, 2028."
  - q: "Should a new ASP.NET Core API target .NET Framework?"
    a: "No. .NET Framework 4.8 is Windows-only and does not run ASP.NET Core. New APIs target net10.0. Stay on net8.0 only if a host you do not control forces it, and plan the move before November 10, 2026."
---

People still say ".NET Core" for a project that is `net8.0` or `net10.0`. The interview answer is the naming, then the support date. The project answer is the `TargetFramework`.

Hub: [Architecture](/learning/architecture). Broader question bank: [.NET interview questions](/blog/dotnet-interview-questions-answers).

## Real-world analogy

.NET Framework is a house that only exists on one street. The street is Windows. .NET Core was the same family building houses on other streets, and they used a different family name so nobody mixed up the keys. From .NET 5 onward they dropped the extra name. People still say "Core" the way a town keeps an old street sign. The sign is not the address. The address is the `TargetFramework` in the project file.

## Worked example

A contract says ".NET Core 8." The csproj says `net8.0`. There is no product called .NET Core 8. The runtime that gets security fixes is .NET 8, and Microsoft's support policy ends that on November 10, 2026, the same day as .NET 9. A new API in this repo's shape targets `net10.0`, which is the current long-term release through November 14, 2028. Leaving `netcoreapp3.1` in an old project is not a style choice. That runtime left support in December 2022, and no one is patching it.

## The three names

| Name you see | What it actually is | New app? |
|---|---|---|
| .NET Framework 4.x | Windows component. ASP.NET MVC and Web API on System.Web. Last major is 4.8. | No |
| .NET Core 1.x, 2.x, 3.1 | Cross-platform rewrite. The brand stopped here. 3.1 left support in December 2022. | No |
| .NET 5 and later | Same line as .NET Core, without the word Core. Current long-term release is .NET 10. | Yes |

`.NET 5` was the rename, not a new product from scratch. If a job post says ".NET Core" and the file says `net8.0`, they mean this line.

## What is still patched

Dates below are from Microsoft's support policy, checked September 18, 2026. Confirm them on [the .NET support policy](https://dotnet.microsoft.com/en-us/platform/support/policy) and the [lifecycle table](https://learn.microsoft.com/en-us/lifecycle/products/microsoft-net-and-net-core) before you pin a runtime. Microsoft also published the November cutoff on [the .NET blog](https://devblogs.microsoft.com/dotnet/dotnet-8-9-end-of-support/).

| Version | Kind | End of support |
|---|---|---|
| .NET 6 | Old LTS | November 2024. No patches. |
| .NET 8 | LTS, maintenance | November 10, 2026 |
| .NET 9 | Standard term, maintenance | November 10, 2026 |
| .NET 10 | LTS, active | November 14, 2028 |

.NET Framework 4.8 is not a row on that table. It follows the Windows release it ships with. That is not a reason to start an API on it. ASP.NET Core does not run on Framework.

A project on `net8.0` still runs after November 10, 2026. It just stops receiving fixes. That is the risk, not a compiler error on the morning after.

## What to put in the csproj

```xml
<TargetFramework>net10.0</TargetFramework>
```

Use `net8.0` only when Azure App Service, a customer image, or a library you cannot replace is still on 8, and you have a date to move. Do not add a second target "just in case" unless you actually test both. Multi-targeting is a library concern, not an API you deploy once.

`net5.0`, `net6.0`, and `netcoreapp3.1` should not appear in a new project. If an old solution still has them, the migration is a framework change plus a smoke test, not a rewrite. Most ASP.NET Core code moves. System.Web code does not. That is the real Framework to .NET gap: `HttpContext`, authentication modules, and config files, not `if` statements.

## How this shows up in the wild

- Docker images should be `mcr.microsoft.com/dotnet/aspnet:10.0`, not `3.1` and not a floating `latest`. Local setup: [Docker with Angular](/blog/docker-dotnet-angular-local).
- App Service has to offer the runtime you publish. A `net10.0` publish on a stack that only has 8 fails at startup. [Azure App Service](/blog/azure-app-service-aspnet-core).
- NuGet packages that say they support `.NET Standard 2.0` still load. Packages that only support `net48` do not, unless you replace them.

Ecom stack already on this line: [Ecom_NET10](/work/ecom-net10).

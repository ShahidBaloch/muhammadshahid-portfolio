---
title: "ASP.NET Core Config File Guide: appsettings.json vs localappsettings.json"
description: "What the ASP.NET Core config file actually is — appsettings.json, appsettings.Development.json, user secrets, local.settings.json, and why localappsettings.json is usually the wrong name."
date: "2026-09-03"
updated: "2026-09-07"
category: "architecture"
tags: ["ASP.NET Core", "Configuration", "appsettings", "Azure", ".NET"]
related:
  - aspnet-core-ioptions-snapshot-monitor
  - azure-app-service-aspnet-core
---

People search **config file**, **appsettings.json**, and **localappsettings.json** when a setting works on one laptop and dies in Azure. The file name in the search box is often wrong. ASP.NET Core does not load a file called `localappsettings.json` unless you add it yourself.

This is the config map I use on healthcare, SaaS, and eCommerce APIs: which files exist, which ones you invent, and where secrets actually belong. Deploy-slot and portal overlays are in [Azure App Service](/blog/azure-app-service-aspnet-core). How C# consumes those values is [IOptions vs IOptionsSnapshot vs IOptionsMonitor](/blog/aspnet-core-ioptions-snapshot-monitor). This page is the files on disk.

## What “config file” means in ASP.NET Core

When people search **config file**, they usually mean `appsettings.json` plus its environment overlay — not `web.config`, not a desktop JSON file, and not `local.appsettings.json` spelled from memory. The host only reads files you put on the configuration pipeline. A JSON file in the project folder does nothing until `CreateBuilder` (or `AddJsonFile`) loads it.

## There is no default `localappsettings.json`

ASP.NET Core’s host looks for:

1. `appsettings.json`
2. `appsettings.{Environment}.json` — usually `Development`, `Staging`, or `Production`
3. User secrets in Development
4. Environment variables
5. Command-line args

That is `CreateDefaultBuilder` / `WebApplication.CreateBuilder` order. **Last source wins.**

`localappsettings.json` is not in that list. Teams type it when they mean one of these:

| What they meant | Real file | Used by |
| --- | --- | --- |
| Local-only ASP.NET Core settings | `appsettings.Development.json` or `appsettings.Local.json` (you add this) | Web API / MVC |
| Secrets on a laptop | User secrets (`secrets.json`) | Web API in Development |
| Azure Functions local config | `local.settings.json` | Functions runtime |
| Azure App Service overlay | Application settings in the portal / Bicep | Deployed API |

If you create `localappsettings.json` and never call `AddJsonFile("localappsettings.json")`, the host ignores it. The “config file” you edited was never in the pipeline.

## The files I actually commit

**`appsettings.json`** holds non-secret defaults: log levels, feature names, connection-string *keys* (not values), CORS policy names. It ships to every environment.

**`appsettings.Development.json`** holds laptop-safe overrides: `localhost` URLs, a local SQL name, Serilog to the console. It can be committed if it contains no secrets. Many teams still leak a shared SQL password here — that is a process failure, not a framework one.

I do **not** commit production connection strings, IdentityServer client secrets, or Stripe keys in any JSON file.

```json
{
  "ConnectionStrings": {
    "Default": "Server=localhost,1433;Database=clinic_dev;Trusted_Connection=True;TrustServerCertificate=True"
  },
  "IdentityServer": {
    "Authority": "https://localhost:5001"
  }
}
```

That Development snippet is fine. The same shape with a production password is not.

## Optional: `appsettings.Local.json` (the honest local file)

Some teams want a file that is never committed and never named “Development,” because two developers share a repo and different SQL instances. I add:

```csharp
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);
```

Place it **after** `appsettings.{Environment}.json` and **before** environment variables if you want laptop JSON to lose to Azure settings later. Add `appsettings.Local.json` to `.gitignore`.

That file is what people are reaching for when they search **localappsettings.json**. Name it `appsettings.Local.json` so it matches the rest of the stack. Do not invent a third spelling unless the whole team already uses it.

```gitignore
appsettings.Local.json
appsettings.*.Local.json
```

## User secrets beat another JSON file for passwords

For a connection string you must not commit, Development should use [user secrets](https://learn.microsoft.com/en-us/aspnet/core/security/app-secrets):

```bash
dotnet user-secrets set "ConnectionStrings:Default" "Server=.;Database=clinic_dev;..."
```

Secrets live outside the repo (`%APPDATA%\Microsoft\UserSecrets\...` on Windows). They load only when `Environment` is Development. Production never sees them — which is the point.

If a teammate clones the repo and the API dies on startup because `ConnectionStrings:Default` is missing, that is correct. Fail fast. Do not “fix” it by committing a shared password into `appsettings.json`.

## Azure Functions: `local.settings.json`, not `localappsettings.json`

Functions local config is **`local.settings.json`**. Values map to environment variables at runtime. The file is gitignored by the Functions templates for a reason.

Do not copy that file into an ASP.NET Core Web API project and expect `IConfiguration` to read it. Different host, different convention. If a search for `localappsettings.json` came from a Functions sample with a typo, start with `local.settings.json` and the Functions docs — not a new file in the API.

## What production actually reads

On Azure App Service I treat JSON as **defaults only**. Real values come from Application settings / Key Vault references. Double-underscore nesting matches JSON:

- JSON `IdentityServer:Authority` → `IdentityServer__Authority`
- JSON `Cors:AllowedOrigins:0` → `Cors__AllowedOrigins__0`

A laptop `appsettings.Development.json` never deploys as the production source of truth. If staging inherited a production connection string because a slot setting was wrong, that is [the App Service article](/blog/azure-app-service-aspnet-core) — not a missing `localappsettings.json`.

## Fail if the config file is incomplete

Silent `null` configuration is how healthcare APIs boot, serve 200s, and then fail on the first token or the first SQL call.

```csharp
var authority = builder.Configuration["IdentityServer:Authority"]
    ?? throw new InvalidOperationException("IdentityServer:Authority is not configured.");
```

Required keys: connection string, authority, CORS origins, blob container. Optional keys: feature flags with a documented default.

## Checklist I use on a new API

- [ ] `appsettings.json` has structure and safe defaults only
- [ ] `appsettings.Development.json` has localhost URLs, no production secrets
- [ ] Secrets use user secrets or a gitignored `appsettings.Local.json` you actually `AddJsonFile`
- [ ] You did **not** add `localappsettings.json` unless the team already loads that exact name
- [ ] Functions local config stays in `local.settings.json`
- [ ] Azure / Docker inject environment variables; JSON does not win over them
- [ ] Startup throws when a required key is missing
- [ ] `.gitignore` covers local override files

## Bottom line

The ASP.NET Core **config file** is `appsettings.json` plus `appsettings.{Environment}.json`. **`localappsettings.json` is not a framework file.** If you need a private laptop overlay, add `appsettings.Local.json` and register it, or use user secrets. If you are on Azure Functions, the local file is `local.settings.json`.

If a setting works on your machine and vanishes after deploy, the host is reading a different source — not a misspelled JSON filename. Bring the environment name and the App Service application-settings list; I will tell you which layer won.

If you want a second pair of eyes on configuration for an ASP.NET Core API before it hits a staging slot, [contact me](/contact).

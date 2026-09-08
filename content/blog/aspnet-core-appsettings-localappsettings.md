---
title: "What is the ASP.NET Core config file?"
description: "ASP.NET Core config files explained — appsettings.json, appsettings.{Environment}.json, user secrets, and why localappsettings.json is not a real framework file."
date: "2026-09-03"
updated: "2026-09-08"
category: "architecture"
tags: ["ASP.NET Core", "Configuration", "appsettings", "Azure", ".NET"]
related:
  - aspnet-core-ioptions-snapshot-monitor
  - azure-app-service-aspnet-core
faq:
  - q: "What is the ASP.NET Core config file?"
    a: "The host loads appsettings.json, then appsettings.{Environment}.json, then user secrets in Development, then environment variables. Last source wins. A JSON file in the project does nothing until CreateBuilder or AddJsonFile loads it."
  - q: "Is localappsettings.json a real ASP.NET Core file?"
    a: "No. ASP.NET Core does not load localappsettings.json unless you add it yourself. Teams usually mean appsettings.Development.json, user secrets, a gitignored appsettings.Local.json, or Azure Functions local.settings.json."
  - q: "Where should local secrets go?"
    a: "User secrets in Development, or a gitignored appsettings.Local.json that you actually register with AddJsonFile. Do not commit production connection strings in any JSON file."
---

## Definition

The **ASP.NET Core config file** is not one file — it is a layered configuration pipeline. The host loads `appsettings.json`, then `appsettings.{Environment}.json`, then user secrets (Development only), then environment variables. **Last source wins.** A JSON file sitting in the project folder does nothing until `WebApplication.CreateBuilder` or `AddJsonFile` registers it.

People search **config file**, **appsettings.json**, and **localappsettings.json** when a setting works on one laptop and dies in Azure. The file name in the search box is often wrong.

## Analogy

Configuration is a stack of transparencies on a light table:

```text
Bottom (lowest priority)          Top (wins)
────────────────────────          ──────────
appsettings.json                  environment variables
appsettings.Development.json      command-line args
user secrets / appsettings.Local
```

Each layer can paint over the layer below. Azure Application Settings sit on top of everything you committed. That is why a laptop value vanishes after deploy — a higher layer replaced it, not because the JSON file was misspelled.

## Routing

**"What is the config file?"** → stay here.

**`localappsettings.json` search** → [There is no default localappsettings.json](#there-is-no-default-localappsettingsjson).

**How C# reads config** → [IOptions vs IOptionsSnapshot vs IOptionsMonitor](/blog/aspnet-core-ioptions-snapshot-monitor).

**Azure deploy slots and portal overlays** → [Azure App Service](/blog/azure-app-service-aspnet-core).

**Data Protection key ring config** → [No XML encryptor found](/blog/aspnet-core-data-protection-xml-encryptor).

**Architecture topic map** → [architecture hub](/learning/architecture).

## Details

This is the config map I use on healthcare, SaaS, and eCommerce APIs: which files exist, which ones you invent, and where secrets actually belong.

### What "config file" means in ASP.NET Core

When people search **config file**, they usually mean `appsettings.json` plus its environment overlay — not `web.config`, not a desktop JSON file, and not `local.appsettings.json` spelled from memory. The host only reads files you put on the configuration pipeline.

### There is no default `localappsettings.json`

ASP.NET Core's host looks for:

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

If you create `localappsettings.json` and never call `AddJsonFile("localappsettings.json")`, the host ignores it.

### The files I actually commit

**`appsettings.json`** holds non-secret defaults: log levels, feature names, connection-string *keys* (not values), CORS policy names. It ships to every environment.

**`appsettings.Development.json`** holds laptop-safe overrides: `localhost` URLs, a local SQL name, Serilog to the console. It can be committed if it contains no secrets.

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

### Optional: `appsettings.Local.json` (the honest local file)

Some teams want a file that is never committed and never named "Development," because two developers share a repo and different SQL instances. I add:

```csharp
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);
```

Place it **after** `appsettings.{Environment}.json` and **before** environment variables if you want laptop JSON to lose to Azure settings later. Add `appsettings.Local.json` to `.gitignore`.

That file is what people are reaching for when they search **localappsettings.json**. Name it `appsettings.Local.json` so it matches the rest of the stack.

```gitignore
appsettings.Local.json
appsettings.*.Local.json
```

### User secrets beat another JSON file for passwords

For a connection string you must not commit, Development should use [user secrets](https://learn.microsoft.com/en-us/aspnet/core/security/app-secrets):

```bash
dotnet user-secrets set "ConnectionStrings:Default" "Server=.;Database=clinic_dev;..."
```

Secrets live outside the repo (`%APPDATA%\Microsoft\UserSecrets\...` on Windows). They load only when `Environment` is Development. Production never sees them — which is the point.

If a teammate clones the repo and the API dies on startup because `ConnectionStrings:Default` is missing, that is correct. Fail fast.

### Azure Functions: `local.settings.json`, not `localappsettings.json`

Functions local config is **`local.settings.json`**. Values map to environment variables at runtime. The file is gitignored by the Functions templates for a reason.

Do not copy that file into an ASP.NET Core Web API project and expect `IConfiguration` to read it. Different host, different convention.

### What production actually reads

On Azure App Service I treat JSON as **defaults only**. Real values come from Application settings / Key Vault references. Double-underscore nesting matches JSON:

- JSON `IdentityServer:Authority` → `IdentityServer__Authority`
- JSON `Cors:AllowedOrigins:0` → `Cors__AllowedOrigins__0`

A laptop `appsettings.Development.json` never deploys as the production source of truth.

### Fail if the config file is incomplete

Silent `null` configuration is how healthcare APIs boot, serve 200s, and then fail on the first token or the first SQL call.

```csharp
var authority = builder.Configuration["IdentityServer:Authority"]
    ?? throw new InvalidOperationException("IdentityServer:Authority is not configured.");
```

Required keys: connection string, authority, CORS origins, blob container. Optional keys: feature flags with a documented default.

### Checklist I use on a new API

- [ ] `appsettings.json` has structure and safe defaults only
- [ ] `appsettings.Development.json` has localhost URLs, no production secrets
- [ ] Secrets use user secrets or a gitignored `appsettings.Local.json` you actually `AddJsonFile`
- [ ] You did **not** add `localappsettings.json` unless the team already loads that exact name
- [ ] Functions local config stays in `local.settings.json`
- [ ] Azure / Docker inject environment variables; JSON does not win over them
- [ ] Startup throws when a required key is missing
- [ ] `.gitignore` covers local override files

## If an interviewer asks

**"How does ASP.NET Core configuration work? What is the load order?"**

**Strong answer:** `appsettings.json` first, then `appsettings.{Environment}.json`, then user secrets in Development, then environment variables, then command-line args. Last source wins. `localappsettings.json` is not a framework file — teams mean `appsettings.Development.json`, user secrets, or a custom `appsettings.Local.json` they register with `AddJsonFile`. Production secrets belong in environment variables or Key Vault, not committed JSON. Fail fast at startup when required keys are missing.

**Weak answer:** "We put everything in appsettings.json."

## Related reading

- [IOptions vs IOptionsSnapshot vs IOptionsMonitor](/blog/aspnet-core-ioptions-snapshot-monitor)
- [Deploying ASP.NET Core to Azure App Service](/blog/azure-app-service-aspnet-core)
- [Architecture hub](/learning/architecture)

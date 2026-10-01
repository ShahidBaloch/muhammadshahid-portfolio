---
title: "Azure Key Vault Secrets in ASP.NET Core Configuration"
description: "Wire Azure Key Vault into ASP.NET Core configuration — AddAzureKeyVault, secret name mapping, reload/sentinel patterns, leak-prevention with Serilog, Key Vault references vs App Settings, and rotation habits. Pairs with Managed Identity; not a full App Service deploy rewrite."
date: "2026-10-01"
category: "azure"
tags: ["ASP.NET Core", "Azure Key Vault", "Configuration", "Security", "C#"]
related:
  - aspnet-core-appsettings-localappsettings
  - azure-app-service-aspnet-core
  - aspnet-core-ioptions-snapshot-monitor
  - serilog-pii-redaction-healthcare-aspnet-core
faq:
  - q: "How do I use Azure Key Vault secrets in ASP.NET Core configuration?"
    a: "Add the Azure Key Vault configuration provider with AddAzureKeyVault (or the Secrets client + custom provider), authenticate with DefaultAzureCredential / Managed Identity, and map secret names to configuration keys. Prefer RBAC Key Vault Secrets User for the app identity."
  - q: "Why not put all secrets in App Service application settings?"
    a: "App Settings work for simple cases but sprawl, lack centralized rotation, and tempt copying secrets across slots. Key Vault centralizes secret storage, access auditing, and rotation while config still binds to IOptions."
  - q: "Does AddAzureKeyVault reload secrets automatically?"
    a: "You can enable reload with a sentinel or polling options depending on package version. Design for explicit rotation events; do not assume every secret change instantly rebinds all singletons."
---

**Azure Key Vault secrets in ASP.NET Core configuration** means treating Key Vault as a configuration source: secret values flow into `IConfiguration` / `IOptions` the same way appsettings do, without baking passwords into source control or casually dumping them into every App Setting.

```text
Key Vault (RBAC: Secrets User)
        │  DefaultAzureCredential / Managed Identity
        ▼
Configuration builder (AddAzureKeyVault)
        │
        ▼
IOptions<SmtpOptions> / ConnectionStrings  →  app services
```

Metaphor: appsettings is your **recipe card**; Key Vault is the **locked spice cabinet**. The cook still uses the same measuring spoons (`IOptions`), but the saffron is not left on the counter.

**New to this** → stay here for provider setup, naming, reload, and leak habits. **Config layering** → [appsettings primer](/blog/aspnet-core-appsettings-localappsettings). **Options monitor** → [IOptions snapshot/monitor](/blog/aspnet-core-ioptions-snapshot-monitor). **MI for vault access** → Managed Identity companion (W12). **PII in logs** → [Serilog redaction](/blog/serilog-pii-redaction-healthcare-aspnet-core).

Search intent for **azure key vault asp.net core** is how-to: `AddAzureKeyVault`, name mapping, reload, and not leaking secret values.

## Why appsettings alone is not enough in Azure

`appsettings.json` is fine for non-secrets. For production credentials:

- Git history never forgets a committed connection string.
- Copy-paste across Dev/Test/Prod App Settings drifts.
- Rotation requires touching every app that duplicated the secret.
- Auditors ask who accessed the payment API key — Key Vault diagnostics answer; a plain App Setting usually does not.

App Service **Key Vault references** (syntax in App Settings) are a valid middle path — covered below. The configuration provider path gives the app direct, version-aware access and works on hosts beyond App Service.

## AddAzureKeyVault and secret name mapping (`--` to `:`)

Package:

```bash
dotnet add package Azure.Extensions.AspNetCore.Configuration.Secrets
dotnet add package Azure.Identity
```

Program setup:

```csharp
using Azure.Identity;

var builder = WebApplication.CreateBuilder(args);

var vaultUri = builder.Configuration["KeyVault:Uri"];
if (!string.IsNullOrWhiteSpace(vaultUri))
{
    builder.Configuration.AddAzureKeyVault(
        new Uri(vaultUri),
        new DefaultAzureCredential());
}

var app = builder.Build();
```

### Naming rules that bite people

Key Vault secret **names** allow letters, numbers, and hyphens — not `:` or `__`.

ASP.NET Core hierarchical keys use `:` (or `__` in environment variables). The provider maps:

| Key Vault secret name | Configuration key |
|---|---|
| `ConnectionStrings--AppDb` | `ConnectionStrings:AppDb` |
| `Smtp--ApiKey` | `Smtp:ApiKey` |
| `Stripe--WebhookSecret` | `Stripe:WebhookSecret` |

Double hyphen `--` becomes section delimiter `:`.

```csharp
builder.Services.Configure<SmtpOptions>(
    builder.Configuration.GetSection("Smtp"));

public sealed class SmtpOptions
{
    public string Host { get; set; } = "";
    public string ApiKey { get; set; } = ""; // bound from Smtp--ApiKey
}
```

**Do not** invent a second naming scheme per environment. Document the convention in the repo README.

### Optional: prefix and manager

For shared vaults:

```csharp
builder.Configuration.AddAzureKeyVault(
    new Uri(vaultUri),
    new DefaultAzureCredential(),
    new AzureKeyVaultConfigurationOptions
    {
        // Manager can filter prefixes / reload — check current package API
        ReloadInterval = TimeSpan.FromMinutes(30)
    });
```

Pin package docs for your version — option type names have evolved. The idea stays: control which secrets load and how often they refresh.

## Reload and sentinel patterns

Secrets rotate. Long-lived `IOptions<T>` (singleton bind once) will **not** see updates unless you use `IOptionsMonitor<T>` / `IOptionsSnapshot<T>` appropriately ([monitor guide](/blog/aspnet-core-ioptions-snapshot-monitor)).

Patterns:

1. **Polling reload interval** on the Key Vault provider — simple; beware throttling and startup cost on huge vaults.
2. **Sentinel secret** — app watches one `Sentinel` value; when operators bump it after rotating real secrets, reload triggers. Reduces chatty list/get.
3. **Restart on rotate** — blunt but honest for connection strings that cannot hot-swap safely (some SQL auth modes, pooled clients).

```csharp
public sealed class StripeClientFactory(IOptionsMonitor<StripeOptions> options)
{
    public StripeClient Create() => new(options.CurrentValue.WebhookSecret);
}
```

Prefer monitor for secrets that must flip without downtime. Prefer restart for "tear down all pools" cases — document which.

## Never logging secret values (Serilog habits)

Configuration dumps, `ToString()` on options, and exception messages are how keys die.

Rules I enforce:

- Never `Log.Information("Config: {@Config}", configuration.AsEnumerable())` in production.
- Destructure options with **destructuring policies** that exclude `ApiKey`, `Password`, `Secret`, `ConnectionString`.
- Use [Serilog PII redaction](/blog/serilog-pii-redaction-healthcare-aspnet-core) habits for healthcare — secrets are a subclass of sensitive data.
- When logging Key Vault errors, log **secret name**, not value; log correlation id.

```csharp
// Bad
_logger.LogDebug("SMTP key {Key}", smtp.ApiKey);

// Good
_logger.LogDebug("SMTP options loaded for host {Host}", smtp.Host);
```

Health checks should prove "secret resolvable" without printing it — e.g., non-empty length check in Development only, or a vault get permission check that records success/fail.

## Key Vault references vs App Settings

**App Service Key Vault reference** in an App Setting:

```text
@Microsoft.KeyVault(SecretUri=https://myvault.vault.azure.net/secrets/Smtp--ApiKey/)
```

Pros: App Service resolves at platform level; app code still reads `IConfiguration["Smtp:ApiKey"]` if you map names carefully; identity is the App Service MI.

Pros of **AddAzureKeyVault in process**:

- Works similarly on Container Apps, VMs, local (with credential).
- Version and reload control in app.
- Same mental model across hosts.

Cons of in-process: app identity needs vault access; startup depends on vault availability unless you cache/fallback carefully.

I often use **references for connection strings on App Service** and **provider for app-owned feature secrets** — but pick one story per team to avoid dual sources fighting.

## Local DefaultAzureCredential path

Locally:

1. Leave `KeyVault:Uri` empty → rely on user secrets / `appsettings.Development.json` for fake keys.
2. Or set URI and `az login` so Dev uses the shared Dev vault (preferred when secrets are integration keys you should not duplicate).

```json
// appsettings.Development.json
{
  "Smtp": {
    "Host": "localhost",
    "ApiKey": "dev-only-not-real"
  }
}
```

User secrets for personal overrides — habits from the [appsettings primer](/blog/aspnet-core-appsettings-localappsettings). Never commit real vault URIs with embedded keys (URIs alone are fine; keys are not in URIs if you use RBAC properly).

## Rotation habits

1. Create a **new secret version** in Key Vault (do not delete first).
2. Bump sentinel or wait for reload / restart apps per runbook.
3. Verify dependents (web + workers + Functions).
4. Disable old version after soak.
5. Record rotation in change log for auditors.

For SQL passwords (if you still have any — prefer MI): rotation is harder because of pool lifetime — schedule maintenance window.

Automate rotation with Azure features where the secret consumer supports it; do not pretend every third-party API key auto-rotates without app cooperation.

## Checklist

1. Vault uses RBAC; app identity has **Secrets User** only.
2. `KeyVault:Uri` in environment config; no secrets in git.
3. Secret names use `--` hierarchy; bind to options sections.
4. Consumers use `IOptionsMonitor` where hot reload matters.
5. Serilog redaction excludes secret properties.
6. Local Dev works offline with user secrets when vault is optional.
7. Runbook documents rotation + restart requirements.
8. Diagnostics enabled on vault for get/list audit.
9. Separate read (runtime) and write (pipeline) identities.
10. Fail fast at startup if required secrets missing in Production.

## Pitfalls

- **Loading hundreds of unused secrets** at startup — filter/prefix.
- **Granting Secrets Officer to the web app** — write access unused by runtime.
- **Logging configuration on boot** for "debugging Azure" — leaks into App Insights.
- **Assuming Key Vault soft-delete is a backup strategy for app data** — it is not your database backup.
- **Mixing secret names across casing** — Key Vault names are case-sensitive; config keys usually case-insensitive — be consistent.
- **Putting certificates and secrets stories in one tangled post** — certs often need different providers; keep secrets clear here.

## Verification

1. Remove `Smtp:ApiKey` from App Settings; store `Smtp--ApiKey` in vault; restart; hit a path that sends mail (or a dry-run options endpoint in Dev that prints **host only**).
2. Deny vault network temporarily → confirm Production fails closed with clear startup log (no stack with secret material).
3. Rotate secret version; confirm monitor-based client picks up within reload interval **or** document restart.
4. Grep logs after a deliberate failed SMTP auth — ensure API key not present.
5. `az keyvault secret show` as a human admin works; as the app identity, only get/list allowed.

## Code: dual-mode configuration builder

```csharp
public static void AddAppConfiguration(this WebApplicationBuilder builder)
{
    builder.Configuration
        .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
        .AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.json",
            optional: true, reloadOnChange: true)
        .AddEnvironmentVariables()
        .AddUserSecrets<Program>(optional: true);

    var vaultUri = builder.Configuration["KeyVault:Uri"];
    if (string.IsNullOrWhiteSpace(vaultUri))
        return;

    if (!builder.Environment.IsDevelopment() ||
        builder.Configuration.GetValue("KeyVault:UseInDevelopment", false))
    {
        builder.Configuration.AddAzureKeyVault(
            new Uri(vaultUri),
            new DefaultAzureCredential());
    }
}
```

## If an interviewer asks

**"How are secrets managed in your ASP.NET Core apps on Azure?"**  
Key Vault + Managed Identity, configuration provider or App Service references, options binding, redacted logs, least-privilege RBAC, documented rotation.

**"Key Vault vs App Settings?"**  
App Settings for non-secret config and simple hosts; Key Vault for centralized secrets, audit, and rotation. References combine both.


## Naming cookbook for shared vaults

Prefix secrets by app when multiple apps share a vault:

- `clinicapi--Smtp--ApiKey`
- `clinicworker--Stripe--WebhookSecret`

Then filter with a secret manager / prefix option so the API does not load worker secrets into its configuration root. Shared vaults without prefixes become unreadable within a year.

## Startup fail-fast vs soft degrade

For required secrets (DB, auth signing keys), fail startup if missing in Production. For optional integrations (marketing SMTP), bind options and disable the feature when empty — log a warning once. Never half-start with a null API key that crashes on the first user action with a confusing 500.



## Version pinning and soft delete

Enable Key Vault soft delete and purge protection in production subscriptions. When someone deletes `Smtp--ApiKey` by mistake, recovery beats an incident. Application code should request the latest enabled version unless you intentionally pin a version URI during a staged rotation.

Document whether your App Service Key Vault references pin versions — mixed teams often half-pin and wonder why rotation did nothing.


## Related

**Related:** [Appsettings](/blog/aspnet-core-appsettings-localappsettings) · [App Service](/blog/azure-app-service-aspnet-core) · [IOptions monitor](/blog/aspnet-core-ioptions-snapshot-monitor) · [Serilog PII](/blog/serilog-pii-redaction-healthcare-aspnet-core) · Managed Identity (W12)

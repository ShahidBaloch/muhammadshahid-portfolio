---
title: "Managed Identity for ASP.NET Core on Azure (SQL, Blob, Key Vault)"
description: "Passwordless Managed Identity for ASP.NET Core on Azure — system vs user-assigned overview, EF Core + Azure SQL, BlobClient with DefaultAzureCredential, Key Vault RBAC, and local dual-mode config. Not a Blob upload UX rewrite."
date: "2026-10-01"
category: "azure"
tags: ["ASP.NET Core", "Azure", "Managed Identity", "Key Vault", "EF Core"]
related:
  - azure-app-service-aspnet-core
  - azure-blob-aspnet-core-uploads
  - aspnet-core-appsettings-localappsettings
  - entra-id-angular-aspnet-core
faq:
  - q: "What is Managed Identity for ASP.NET Core on Azure?"
    a: "Azure assigns an Entra ID identity to your App Service (or other host). The app acquires tokens for Azure SQL, Blob Storage, and Key Vault without storing passwords or connection-string secrets in configuration."
  - q: "System-assigned vs user-assigned Managed Identity — which should I use?"
    a: "System-assigned is simplest for one app, one identity. User-assigned shines when multiple apps share one identity or you need to rotate/move identity independently of the App Service lifecycle. Most greenfield single APIs start system-assigned."
  - q: "Does Managed Identity replace Entra ID login for Angular users?"
    a: "No. MI authenticates the *application* to Azure resources. End-user sign-in for the Angular SPA is a separate Entra ID / JWT topic."
---

**Managed Identity for ASP.NET Core on Azure** means your App Service (or Container App) presents an Entra ID identity to Azure SQL, Blob Storage, and Key Vault — no SQL passwords, no storage account keys, no secret connection strings in App Settings.

```text
Local laptop                         Azure App Service
──────────────                       ─────────────────
DefaultAzureCredential               System/User Managed Identity
  Visual Studio / Az CLI / ...         │
  └─ tokens for cloud resources        └─ tokens for SQL / Blob / Key Vault
```

Metaphor: MI is a **badge issued to the app itself**, not to a human. Your Angular users still sign in separately ([Entra ID Angular + ASP.NET Core](/blog/entra-id-angular-aspnet-core)). The badge opens the doors to Azure data plane resources.

**New to this** → stay here for SQL, Blob, and Key Vault wiring. **App Service deploy basics** → [Azure App Service ASP.NET Core](/blog/azure-app-service-aspnet-core). **Blob upload UX** → [Blob uploads](/blog/azure-blob-aspnet-core-uploads) (connection style changes here; UX does not). **Key Vault as config provider** → companion [Key Vault secrets post](/blog/azure-key-vault-secrets-aspnet-core) (W16).

Search intent for **managed identity asp.net core** is end-to-end passwordless access: turn on identity, grant RBAC/AAD roles, change connection patterns, and keep local Dev working.

## System-assigned vs user-assigned (overview)

| | System-assigned | User-assigned |
|---|---|---|
| Lifecycle | Tied to the resource; deleted with it | Independent; assign to many resources |
| Ops mental model | "This web app's identity" | "This workload identity shared by API + worker" |
| When I pick it | Single App Service API | Multiple apps, slot swap discipline, or shared Key Vault access |

Deep comparison belongs in a sibling vs post. For this how-to: enable **system-assigned** on App Service unless you already know you need shared identity.

Portal: App Service → Identity → System assigned → On.  
CLI sketch:

```bash
az webapp identity assign \
  --name my-api \
  --resource-group rg-prod
```

Capture the **principal object id** — you will grant it roles on SQL, Storage, and Key Vault.

## App Service identity + Azure SQL AAD auth with EF Core

### 1. Enable Microsoft Entra auth on the SQL server

On the Azure SQL server, set an Entra admin and allow Azure AD authentication. Create a contained user for the app identity in the database:

```sql
CREATE USER [my-api] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [my-api];
ALTER ROLE db_datawriter ADD MEMBER [my-api];
-- migrations job may need ddl roles separately — prefer a deploy identity
```

Use the App Service name for system-assigned, or the user-assigned identity name.

### 2. Passwordless connection string

```text
Server=tcp:myserver.database.windows.net,1433;
Initial Catalog=mydb;
Encrypt=True;
TrustServerCertificate=False;
Authentication=Active Directory Default;
```

`Active Directory Default` uses the same credential chain as `DefaultAzureCredential` in many setups. For explicit Azure.Identity control with Microsoft.Data.SqlClient, you can also supply an access token interceptor — but the connection-string authentication mode is what most App Service + EF Core teams ship first.

### 3. EF Core registration

```csharp
builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("AppDb"));
});
```

No password in `ConnectionStrings__AppDb`. In App Service configuration, store only the passwordless string. Locally, you either:

- Use a local SQL / Docker SQL with a normal connection string via [local appsettings](/blog/aspnet-core-appsettings-localappsettings), or
- Use `DefaultAzureCredential` against a Dev Azure SQL where your user is a contained user.

Dual-mode pattern:

```csharp
var cs = builder.Configuration.GetConnectionString("AppDb")
    ?? throw new InvalidOperationException("Missing ConnectionStrings:AppDb");

builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlServer(cs));
```

`appsettings.Development.json` points at local SQL with `User Id`/`Password` or Trusted Connection. Production App Settings override with `Authentication=Active Directory Default`.

## BlobClient with DefaultAzureCredential

Do **not** rewrite your upload UX from [Blob uploads](/blog/azure-blob-aspnet-core-uploads). Change **how the client authenticates**.

```csharp
using Azure.Identity;
using Azure.Storage.Blobs;

builder.Services.AddSingleton(_ =>
{
    var uri = new Uri(builder.Configuration["Storage:BlobServiceUri"]
        ?? throw new InvalidOperationException("Storage:BlobServiceUri missing"));
    return new BlobServiceClient(uri, new DefaultAzureCredential());
});
```

App Setting example:

```text
Storage__BlobServiceUri=https://mystorage.blob.core.windows.net/
```

Grant the app identity a data-plane role on the storage account or container, typically:

- `Storage Blob Data Contributor` for read/write uploads
- `Storage Blob Data Reader` for read-only workers

Avoid account keys and SAS in production app config when MI is available. SAS still has a place for **browser-direct upload** time-bombed URLs — that is a deliberate UX pattern, not a substitute for the API's own credentials.

## Key Vault RBAC roles for the app identity

For secrets the app reads at runtime (or via configuration provider):

1. Prefer **RBAC** on Key Vault (not legacy access policies) for new vaults.
2. Grant the app identity `Key Vault Secrets User` (get/list secrets) — not Administrator.
3. Separate **deploy** identities that set secrets from **runtime** identities that only read.

```csharp
using Azure.Identity;
using Azure.Security.KeyVault.Secrets;

builder.Services.AddSingleton(_ =>
{
    var vaultUri = new Uri(builder.Configuration["KeyVault:Uri"]
        ?? throw new InvalidOperationException("KeyVault:Uri missing"));
    return new SecretClient(vaultUri, new DefaultAzureCredential());
});
```

For configuration-provider integration (`AddAzureKeyVault`), see the dedicated Key Vault configuration post — this page stops at "identity can read secrets." Do not grant the web app `Key Vault Administrator` "to make it work."

## Local DefaultAzureCredential chain

`DefaultAzureCredential` tries several sources in order (simplified): environment variables, workload identity, managed identity, Visual Studio, Azure CLI, Azure PowerShell, etc.

Local habits that reduce pain:

1. `az login` with an account that has Dev SQL / Dev Key Vault access.
2. Or set `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_CLIENT_SECRET` only for a **Dev sp** in a user-secret store — never commit.
3. Exclude awkward sources in CI if needed:

```csharp
var credential = new DefaultAzureCredential(new DefaultAzureCredentialOptions
{
    ExcludeInteractiveBrowserCredential = true,
    // ExcludeManagedIdentityCredential = true // on pure local if MI probe hangs
});
```

On App Service, MI is present; the chain finds it. On a laptop, CLI or VS credentials usually win.

## Dual-mode config for local vs cloud

| Setting | Development | Production (App Service) |
|---|---|---|
| SQL | Local Docker / LocalDB connection string | Passwordless Azure SQL string |
| Blob | Azurite + key **or** Dev storage + your user AAD | BlobServiceUri + MI |
| Key Vault | Optional; user secrets for secrets | Vault URI + MI; config provider |

Use environment-specific config files and App Settings overlays — habits from [appsettings / localappsettings](/blog/aspnet-core-appsettings-localappsettings). Never branch on `if (env.IsDevelopment()) new SqlConnection("pwd=...")` scattered through code; keep it in configuration.

## Failure modes and diagnostics

| Symptom | Likely cause | Fix direction |
|---|---|---|
| `Login failed for user '<token-identified principal>'` | DB user missing or wrong name | `CREATE USER ... FROM EXTERNAL PROVIDER` matching identity name |
| `DefaultAzureCredential failed to retrieve a token` | Local chain empty / MI not enabled | `az login` or enable Identity blade |
| Blob `AuthorizationPermissionMismatch` | Wrong RBAC role or scope | Grant data contributor on account/container |
| Key Vault `Forbidden` | Access policy vs RBAC confusion | Align vault permission model; grant Secrets User |
| Hang on startup locally | MI endpoint probed on non-Azure | Exclude MI credential in local options |

Enable Azure SDK logging briefly in Dev:

```csharp
using Azure.Core.Diagnostics;
using var _ = AzureEventSourceListener.CreateConsoleLogger();
```

Do not leave verbose credential logging on in production — tokens and headers can leak into log sinks.

## Rollout checklist

1. Enable system-assigned (or attach user-assigned) identity on App Service.
2. Create Azure SQL Entra user for that identity; grant least-privilege DB roles.
3. Switch connection string to passwordless; remove SQL passwords from App Settings.
4. Point `BlobServiceClient` at HTTPS URI with `DefaultAzureCredential`; grant Blob data role.
5. Point Key Vault clients / config provider at vault URI; grant Secrets User only.
6. Verify local Dev still boots (local SQL + optional Azurite).
7. Smoke test: migrate (deploy identity), read/write row, upload blob, read one secret.
8. Delete old keys/passwords after monitoring window — do not leave "backup" secrets in config forever.
9. Document which identity name ops must re-grant when cloning environments.

## Pitfalls

- **Granting portal Owner to the app identity** — overkill and dangerous; use data-plane roles.
- **Forgetting slot identities** — staging slots can have separate system-assigned identities; grant both or use user-assigned shared across slots.
- **Mixing SAS tutorials with MI** — fine for browser upload UX; wrong as the API's standing credential.
- **Assuming Angular Entra login equals MI** — different principals, different purposes.
- **Putting MI object ids in source control as if they were secrets** — object ids are identifiers; the secret is the ability to *be* that identity at runtime.

## Verification

1. Kudu / SSH on App Service: not required if you can hit a health endpoint that opens EF + lists one blob + reads a non-sensitive secret metadata call.
2. Azure Activity / diagnostic logs: confirm token acquisition failures if any.
3. SQL: `SELECT SUSER_SNAME();` via a temporary authenticated admin path to confirm Entra user mapping during bring-up.
4. Remove the old SQL password App Setting; confirm the app still connects after restart.
5. From a locked-down network, confirm the app never needed the storage account key.

## If an interviewer asks

**"How do you connect ASP.NET Core to Azure SQL without passwords?"**  
Enable Managed Identity on App Service, create an Entra user in the database for that identity, use `Authentication=Active Directory Default` (or token-based SqlClient), and keep local Dev on a separate connection string.

**"Is DefaultAzureCredential safe in production?"**  
Yes when running on Azure with MI; it selects MI. Locally it uses developer credentials. Exclude interactive browser in server processes. Prefer explicit options in hardened hosts.


## App Service slots and identity gotchas

Deployment slots can each have their own system-assigned identity. If staging cannot read Key Vault or SQL after a swap rehearsal, check whether you granted roles only to the production slot identity. User-assigned identities attached to both slots avoid this class of surprise.

Also verify the SQL Entra user name matches the identity display name you think it does — renaming an App Service does not always rename the database user you created last quarter.

## Minimal Program.cs dual registration sketch

```csharp
builder.Services.AddSingleton(sp =>
{
    var cfg = sp.GetRequiredService<IConfiguration>();
    var uri = new Uri(cfg["Storage:BlobServiceUri"]!);
    return new BlobServiceClient(uri, new DefaultAzureCredential());
});

builder.Services.AddDbContext<AppDbContext>((sp, opts) =>
{
    opts.UseSqlServer(sp.GetRequiredService<IConfiguration>().GetConnectionString("AppDb"));
});
```

Keep credential construction boring and centralized so every new Azure client does not invent a different chain.


## Related

**Related:** [Azure App Service](/blog/azure-app-service-aspnet-core) · [Blob uploads](/blog/azure-blob-aspnet-core-uploads) · [Appsettings](/blog/aspnet-core-appsettings-localappsettings) · [Entra ID Angular](/blog/entra-id-angular-aspnet-core) · [Key Vault Secrets](/blog/azure-key-vault-secrets-aspnet-core)

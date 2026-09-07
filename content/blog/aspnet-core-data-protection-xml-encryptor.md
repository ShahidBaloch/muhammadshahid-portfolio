---
title: "No XML encryptor found in ASP.NET Core Data Protection"
description: "No XML encryptor found. This may indicate that your key ring is not being persisted correctly — Docker, App Service scale-out, antiforgery cookies, and the XML encryptor that is not a JWT signing cert."
date: "2026-09-07"
category: "architecture"
tags: ["ASP.NET Core", "Azure", "Data Protection", "Docker", "Security"]
related:
  - azure-app-service-aspnet-core
  - identityserver4-openiddict-migration-checklist
  - aspnet-core-appsettings-localappsettings
---

**No XML encryptor found. This may indicate that your key ring is not being persisted correctly.** That warning (and the login/antiforgery failures that follow) is ASP.NET Core **Data Protection**, not JWT bearer validation and not IdentityServer’s signing certificate. IDX10503 stays in [the signature article](/blog/aspnet-core-idx10503-jwt-signature). App Service slots and `appsettings` stay in [Azure App Service](/blog/azure-app-service-aspnet-core) and the [config file map](/blog/aspnet-core-appsettings-localappsettings). This URL is the **key ring**.

I hit this on a clinic admin that worked on one App Service instance and logged people out as soon as we turned on scale-out. Cookies looked fine in Chrome. Instance B could not unprotect what instance A wrote.

## What Data Protection is protecting

ASP.NET Core Data Protection encrypts payload the host must read later on **this** app (or farm):

- Authentication cookies (if you use cookie auth)
- Antiforgery tokens
- Some Identity tokens and temp data
- Anything you call `IDataProtectionProvider.CreateProtector(...)` for

It is **not** `AddJwtBearer` issuer signing. A JWT signed with a symmetric key or an RSA cert can validate on every machine without a Data Protection key ring. Teams conflate the two because both say “keys” in logs.

## Why the default dies in Docker and App Service

Out of the box, keys land on the local disk (`%LOCALAPPDATA%\ASP.NET\DataProtection-Keys` on Windows, a folder under the app user on Linux). That folder is:

- **Ephemeral** in containers — recycle the pod, keys vanish
- **Per instance** on App Service scale-out — instance A’s keys are not on instance B
- **Not writable** in some locked-down images — then you get **No XML encryptor found** because Data Protection cannot persist or wrap the ring

One instance: login works. Two instances or a swap: half the POSTs fail antiforgery, cookie auth 401s, or users bounce between logged-in and logged-out.

## “No XML encryptor found” vs “key not found in the key ring”

| Log / symptom | Meaning |
| --- | --- |
| **No XML encryptor found** | The ring cannot be persisted or wrapped (folder, blob, or certificate/Key Vault encryptor missing) |
| **The key was not found in the key ring** | A payload was protected with a key this instance does not have (scale-out, swap, new container) |
| Antiforgery **400** after a working GET | Token was issued on A, posted to B |

Fix the store **and** the XML encryptor. A shared folder of **plaintext** XML keys is better than ephemeral keys and worse than keys wrapped with a certificate or Key Vault.

## What I actually configure

For Azure App Service / containers I persist to **Blob Storage** and wrap with **Key Vault**:

```csharp
builder.Services.AddDataProtection()
    .SetApplicationName("clinic-admin")
    .PersistKeysToAzureBlobStorage(blobUriWithSasOrManagedIdentity)
    .ProtectKeysWithAzureKeyVault(keyIdentifier, tokenCredential);
```

`SetApplicationName` must be **identical** on every instance of this app. A staging slot that uses a different name cannot read production cookies — which is what you want for slots, and a foot-gun if you copy settings blindly.

On a single Linux VM or a Compose stack with a volume:

```csharp
builder.Services.AddDataProtection()
    .SetApplicationName("clinic-admin")
    .PersistKeysToFileSystem(new DirectoryInfo("/keys"))
    .ProtectKeysWithCertificate(cert);
```

The `/keys` directory must be a **volume**, not the image layer. `ProtectKeysWithCertificate` is the XML encryptor the warning is named after. Without it, keys sit as XML on disk; anyone with the volume can unprotect cookies.

Do not point two **different** products at the same application name and blob. Marketplace auction and search APIs each get their own name.

## Docker: the folder in the image is a trap

```yaml
# wrong — keys die when the container dies
# (no volume)

# right
volumes:
  - dataprotection-keys:/keys
```

Then `PersistKeysToFileSystem(new DirectoryInfo("/keys"))`. If the process cannot write `/keys`, you get **No XML encryptor found** at startup or first protect. Run the container as a user that owns that directory, or use Blob + Key Vault and skip local files.

App Service on Linux has the same trap: the wwwroot disk is not a durable shared ring across instances. Blob persistence is the default I write into Bicep for any API that uses cookies or antiforgery.

## What I check when scale-out “breaks login”

1. How many instances? If 1, you have not seen the bug yet.
2. Is `IDataProtectionProvider` using the default disk path? Search `AddDataProtection` — if missing, you are on defaults.
3. Do logs mention **XML encryptor** or **key was not found**? Different fixes.
4. Are you debugging JWT 401s? Decode the token. If signature/audience fail, leave this article.
5. Did a slot swap change `ApplicationName` or the blob container?

Weak answer: “stick to one instance.” Strong answer: **shared persisted ring + XML encryptor**, same application name, cookies only for the app that owns that name.

## Related reading

- [Deploying ASP.NET Core to Azure App Service](/blog/azure-app-service-aspnet-core)
- [IdentityServer4 to OpenIddict checklist](/blog/identityserver4-openiddict-migration-checklist) (signing certs are a different key)
- [ASP.NET Core config file](/blog/aspnet-core-appsettings-localappsettings)
- [Architecture hub](/learning/architecture)

If antiforgery 400s started the day you scaled out an ASP.NET Core + Angular host, [send the hosting shape](/contact) — instance count and where keys live, not the JWT middleware.

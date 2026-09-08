---
title: "No XML encryptor found in ASP.NET Core Data Protection"
description: "Fix No XML encryptor found in ASP.NET Core Data Protection — key ring persistence for Docker, App Service scale-out, antiforgery cookies, and the XML encryptor that is not JWT signing."
date: "2026-09-07"
updated: "2026-09-08"
category: "architecture"
tags: ["ASP.NET Core", "Azure", "Data Protection", "Docker", "Security"]
related:
  - azure-app-service-aspnet-core
  - identityserver4-openiddict-migration-checklist
  - aspnet-core-appsettings-localappsettings
faq:
  - q: "What does No XML encryptor found mean in ASP.NET Core?"
    a: "Data Protection has nowhere durable to persist the key ring, so antiforgery and auth cookies break after recycle or scale-out. It is not a JWT signing certificate error."
  - q: "Is Data Protection the same as JWT signing?"
    a: "No. JWT uses TokenValidationParameters or JWKS. Data Protection encrypts cookies and antiforgery payloads. IDX10503 is a different URL."
  - q: "Why do cookies fail after App Service scale-out?"
    a: "Each instance minted its own key ring. Persist keys to Blob or Redis and share an XML encryptor. Docker without a volume has the same bug."
---

## Definition

**ASP.NET Core Data Protection** encrypts payloads the host must read later on the same app (or farm): authentication cookies, antiforgery tokens, temp data, and anything you call `IDataProtectionProvider.CreateProtector(...)` for. It is **not** JWT bearer signing.

**No XML encryptor found. This may indicate that your key ring is not being persisted correctly.** That warning means Data Protection cannot persist or wrap the key ring — the folder is missing, unwritable, or the certificate/Key Vault encryptor is not configured.

## Analogy

Data Protection is a shared safe in a bank vault:

```text
Instance A writes cookie  →  encrypts with key in the safe
Instance B reads cookie   →  needs the SAME safe + combination

Default (ephemeral disk):
  Instance A has safe #1 in its desk drawer
  Instance B has safe #2 in its desk drawer
  → cookie from A is gibberish to B

Fixed (Blob + Key Vault):
  Both instances share one safe in the vault
  → cookies survive scale-out and container recycle
```

JWT signing is a different safe — one that every machine can verify with a public key. Do not conflate the two because both say "keys" in logs.

## Routing

**"No XML encryptor found" warning** → stay here.

**JWT signature / IDX10503 errors** → [JWT signature article](/blog/aspnet-core-idx10503-jwt-signature) — different system.

**App Service slots and deploy config** → [Azure App Service](/blog/azure-app-service-aspnet-core).

**Config file naming (`localappsettings.json`)** → [ASP.NET Core config file](/blog/aspnet-core-appsettings-localappsettings).

**IdentityServer signing cert migration** → [IdentityServer4 to OpenIddict checklist](/blog/identityserver4-openiddict-migration-checklist).

**Architecture topic map** → [architecture hub](/learning/architecture).

## Details

I hit this on a clinic admin that worked on one App Service instance and logged people out as soon as we turned on scale-out. Cookies looked fine in Chrome. Instance B could not unprotect what instance A wrote.

### What Data Protection is protecting

ASP.NET Core Data Protection encrypts payload the host must read later on **this** app (or farm):

- Authentication cookies (if you use cookie auth)
- Antiforgery tokens
- Some Identity tokens and temp data
- Anything you call `IDataProtectionProvider.CreateProtector(...)` for

### Why the default dies in Docker and App Service

Out of the box, keys land on the local disk (`%LOCALAPPDATA%\ASP.NET\DataProtection-Keys` on Windows, a folder under the app user on Linux). That folder is:

- **Ephemeral** in containers — recycle the pod, keys vanish
- **Per instance** on App Service scale-out — instance A's keys are not on instance B
- **Not writable** in some locked-down images — then you get **No XML encryptor found**

One instance: login works. Two instances or a swap: half the POSTs fail antiforgery, cookie auth 401s, or users bounce between logged-in and logged-out.

### "No XML encryptor found" vs "key not found in the key ring"

| Log / symptom | Meaning |
| --- | --- |
| **No XML encryptor found** | The ring cannot be persisted or wrapped (folder, blob, or certificate/Key Vault encryptor missing) |
| **The key was not found in the key ring** | A payload was protected with a key this instance does not have (scale-out, swap, new container) |
| Antiforgery **400** after a working GET | Token was issued on A, posted to B |

Fix the store **and** the XML encryptor. A shared folder of **plaintext** XML keys is better than ephemeral keys and worse than keys wrapped with a certificate or Key Vault.

### What I actually configure

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

The `/keys` directory must be a **volume**, not the image layer. `ProtectKeysWithCertificate` is the XML encryptor the warning is named after.

Do not point two **different** products at the same application name and blob.

### Docker: the folder in the image is a trap

```yaml
# wrong — keys die when the container dies
# (no volume)

# right
volumes:
  - dataprotection-keys:/keys
```

Then `PersistKeysToFileSystem(new DirectoryInfo("/keys"))`. If the process cannot write `/keys`, you get **No XML encryptor found** at startup or first protect.

App Service on Linux has the same trap: the wwwroot disk is not a durable shared ring across instances. Blob persistence is the default I write into Bicep for any API that uses cookies or antiforgery.

### What I check when scale-out "breaks login"

1. How many instances? If 1, you have not seen the bug yet.
2. Is `IDataProtectionProvider` using the default disk path? Search `AddDataProtection` — if missing, you are on defaults.
3. Do logs mention **XML encryptor** or **key was not found**? Different fixes.
4. Are you debugging JWT 401s? Decode the token. If signature/audience fail, leave this article.
5. Did a slot swap change `ApplicationName` or the blob container?

Weak answer: "stick to one instance." Strong answer: **shared persisted ring + XML encryptor**, same application name.

## If an interviewer asks

**"What is ASP.NET Core Data Protection and why do cookies break after scale-out?"**

**Strong answer:** Data Protection encrypts cookies and antiforgery tokens so the server can read them later. By default keys live on local disk — ephemeral in Docker, per-instance on App Service scale-out. Instance A protects with its key ring; instance B cannot unprotect. Fix: persist the key ring to Blob Storage or a shared volume, wrap with a certificate or Key Vault (the XML encryptor), and use the same `SetApplicationName` on every instance. This is separate from JWT signing — JWT validates with a public key on any machine.

**Weak answer:** "Add more App Service instances and use sticky sessions."

## Related reading

- [Deploying ASP.NET Core to Azure App Service](/blog/azure-app-service-aspnet-core)
- [IdentityServer4 to OpenIddict checklist](/blog/identityserver4-openiddict-migration-checklist)
- [ASP.NET Core config file](/blog/aspnet-core-appsettings-localappsettings)
- [Architecture hub](/learning/architecture)

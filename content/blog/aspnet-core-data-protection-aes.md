---
title: "ASP.NET Core Data Protection vs AES vs Password Hashing"
description: "Choose ASP.NET Core Data Protection, AES-GCM, or a password hash for the data you have. This page is only that split, not a storage implementation."
date: "2026-10-03"
category: "security"
tags: ["ASP.NET Core", "Data Protection", "AES", "Cryptography", "C#"]
faq:
  - q: "Should I use ASP.NET Core Data Protection or AES to encrypt data?"
    a: "Use Data Protection for data only your ASP.NET Core app must read back: cookie payloads, antiforgery, and short-lived opaque tokens. Use AES-GCM when another system must decrypt the bytes, or when you need a documented layout you store in a column. Do not use either one to store passwords."
  - q: "Does Data Protection use AES?"
    a: "The stack encrypts with authenticated encryption, but the payload format, key rotation, and purpose strings are the framework's. You do not pick a mode or a nonce. Treating the protected string as raw AES you can decrypt in Python will fail, and that is the feature."
  - q: "How does this differ from the XML encryptor error post?"
    a: "That post fixes key-ring persistence when the host cannot find an XML encryptor (Docker, scale-out, lost keys). This page is the design choice: Data Protection versus application-level AES-GCM, and which data belongs in which."
---

**ASP.NET Core Data Protection**, **AES-GCM**, and password hashing are three different tools, and this page is which one to pick. Nonce, AAD, and column layout are [EF Core AES encryption](/blog/ef-core-aes-encryption-interceptor).

```text
Opaque export token, same app only
    --> IDataProtector.Protect  --> key ring (blob) wrapped by Key Vault

Column a Python job must read
    --> AesGcm  --> nonce || tag || ciphertext, key from Key Vault

Password
    --> PasswordHasher (not AES, not Data Protection)
```

**New to this** - stay here for the split. **Key ring errors** - [XML encryptor / key persistence](/blog/aspnet-core-data-protection-xml-encryptor). **Where the wrapping key lives** - [Key Vault configuration](/blog/azure-key-vault-secrets-aspnet-core) and [managed identity](/blog/managed-identity-aspnet-core-azure).

## When do you use ASP.NET Core Data Protection versus AES?

Search intent for **asp.net core data protection aes encrypt** is a how-to that keeps two APIs apart. Readers have a token, a cookie, or a column, and a sample that calls `Aes.Create()` with a key in `appsettings.json`. They need the right API and a production key story.

This page is not the troubleshooting guide for "No XML encryptor configured," and it is not how Identity hashes passwords. If the plaintext is a password or an API secret, stop encrypting it and hash it or put it in a secret store.

## When does this choice apply?

ASP.NET Core on .NET 8 or later, more than one instance (App Service scale-out, containers), data classified as "the app hid this" versus "another system must read this." Local development can use the ephemeral key ring. Production cannot: a new container that generates new keys cannot unprotect yesterday's cookie, and that is the outage people mislabel as an AES bug.

## How do you protect payloads only this app reads?

> **Watch:** One purpose string for the whole app means any unprotect can read every feature. A worker that does not share SetApplicationName and the same key ring fails only in the worker.

Register one application name so every instance shares a purpose isolation boundary. Persist the key ring somewhere all instances can read. Protect the keys at rest with Key Vault when you are on Azure. `DefaultAzureCredential` avoids a certificate password in config when the host has a managed identity.

```csharp
builder.Services.AddDataProtection()
    .SetApplicationName("clinic-portal")
    .PersistKeysToAzureBlobStorage(new Uri(builder.Configuration["DataProtection:BlobUri"]!), new DefaultAzureCredential())
    .ProtectKeysWithAzureKeyVault(new Uri(builder.Configuration["DataProtection:KeyId"]!), new DefaultAzureCredential());
```

The blob URI and key id are configuration, not literals in source. The blob holds key files. Key Vault holds the key that encrypts those files. That Key Vault key is not the key you would pass to `AesGcm`, and you should not export it into a string "to also do AES."

Create a protector per feature. The purpose string is a permission boundary inside the process:

```csharp
public sealed class ExportLinkService(IDataProtectionProvider provider)
{
    private readonly ITimeLimitedDataProtector _protector =
        provider.CreateProtector("Clinic.ExportLinks.v1").ToTimeLimitedDataProtector();

    public string Create(Guid exportId) =>
        _protector.Protect(exportId.ToString("D"), TimeSpan.FromMinutes(15));

    public Guid Read(string token)
    {
        var raw = _protector.Unprotect(token, out _);
        return Guid.ParseExact(raw, "D");
    }
}
```

`Clinic.ExportLinks.v1` will not unprotect a token created with `Clinic.PasswordReset.v1`. A stolen export token cannot be replayed as a reset token. When the payload format changes, change the purpose (`v2`) rather than trying to migrate ciphertext you do not control. Old tokens die with their lifetime, which is why export links should be time-limited.

Catch `CryptographicException` and return 400 or 404. Do not log the token. Do not include the exception message in the Problem Details body; it can echo key ids or payload fragments depending on the failure.

Data Protection is the right tool for:

- values inside cookies you issue (the auth cookie stack already does this)
- antiforgery
- opaque ids in a query string that only this app must understand
- short-lived download or email-action tokens

It is the wrong tool for:

- a column a data warehouse or a Java service selects and decrypts
- encrypting large files (use a key wrap plus a streaming scheme you have reviewed, not `Protect` on a 200 MB PDF)
- passwords, refresh-token secrets you only need to verify, or anything that should be a one-way hash
- hiding data from the same app's database administrators while the app still has the key ring. That is access control and admin separation, not a purpose string

Key rotation is the framework's job while the key ring is intact. If you delete the blob, every protected payload is garbage. Back up the key ring the way you back up the only copy of a master key. The XML encryptor post is what you read when the ring exists but the process cannot decrypt the key files.

## How do you encrypt a column with AES-GCM?

> **Watch:** ECB or a static IV makes identical plaintexts identical ciphertext. Generate a fresh 12-byte nonce per value and store it with the ciphertext.

`Aes.Create()` defaults are a trap if you then switch to ECB or reuse an IV. For stored fields, use `AesGcm` (AEAD). You need a 32-byte key for AES-256 and a 12-byte nonce that is unique per encryption under that key. Reusing a nonce with the same key breaks the authenticity guarantee. Generate the nonce with `RandomNumberGenerator` for every write. Store it with the ciphertext. It is not a secret.

```csharp
public static byte[] Encrypt(ReadOnlySpan<byte> plaintext, ReadOnlySpan<byte> key)
{
    var nonce = new byte[12];
    RandomNumberGenerator.Fill(nonce);
    var cipher = new byte[plaintext.Length];
    var tag = new byte[16];
    using var aes = new AesGcm(key, tag.Length);
    aes.Encrypt(nonce, plaintext, cipher, tag);

    var packed = new byte[nonce.Length + tag.Length + cipher.Length];
    nonce.CopyTo(packed, 0);
    tag.CopyTo(packed, nonce.Length);
    cipher.CopyTo(packed, nonce.Length + tag.Length);
    return packed;
}

public static byte[] Decrypt(ReadOnlySpan<byte> packed, ReadOnlySpan<byte> key)
{
    var nonce = packed[..12];
    var tag = packed.Slice(12, 16);
    var cipher = packed[28..];
    var plain = new byte[cipher.Length];
    using var aes = new AesGcm(key, tag.Length);
    aes.Decrypt(nonce, cipher, tag, plain);
    return plain;
}
```

Pass the tenant id and the row id as associated data when those columns are stored in the clear beside the blob. Copying tenant A's ciphertext onto tenant B's row then fails decrypt. Use the same bytes on write and read.

```csharp
var aad = Encoding.UTF8.GetBytes($"{tenantId:N}:{rowId:N}");
aes.Encrypt(nonce, plaintext, cipher, tag, aad);
aes.Decrypt(nonce, cipher, tag, plain, aad);
```

Load `key` from Key Vault or from a key your KMS unwrapped. Do not read it from `appsettings.json`. Do not derive it from a password with a single SHA-256 unless you are building a toy. If a human passphrase is unavoidable, use `Rfc2898DeriveBytes` with a high iteration count and a stored salt, and prefer not to be in that situation on a server.

Associated data (`Encrypt` overload that takes AAD) should include the tenant id and the row id when those are stored in the clear next to the blob. Then an attacker who copies ciphertext from tenant A onto tenant B's row fails authentication. Data Protection's purpose string is the equivalent idea; AES does not do it unless you pass AAD.

Rotation is now your job. Store a key id next to the blob (`kv1`). Decrypt with the key id that wrote the row. New writes use `kv2`. A background job rewrites old rows. There is no `IDataProtector` magic in this path. If you do not want that job, you wanted Data Protection.

Map `AuthenticationTagMismatchException` to a data-integrity failure, log the row id, and do not return the plaintext of a different row. Never catch and return the original ciphertext as if it were fine.

## Which patterns fail review?

> **Watch:** Do not encrypt passwords with either API. Data Protection is not a password hash, and a protected string is not an access check.

**ECB or a static IV.** Identical plaintexts become identical ciphertext. Patient flags and "true/false" columns light up. Authenticated encryption with a fresh nonce does not.

**Encrypt-then-forget-the-tag.** CBC without a MAC lets an attacker splice blocks. If you cannot explain why you are not using `AesGcm`, do not ship the helper.

**One purpose for the whole app** (`CreateProtector("App")`). Any code that can unprotect anything can unprotect everything. Split purposes by feature.

**Protecting a JWT you also sign.** Signing is integrity for a token other services verify with a public key. Data Protection is for tokens only you unwrap. Wrapping a JWT in `Protect` and also validating it as a JWT is two designs fighting.

**Tenant id inside the protected payload only.** Still authorize on the server from the signed-in tenant. A protected string is not an ACL. Anyone who has the token holds the payload until it expires.

## Where does the key live?

| Approach | You manage | Good for |
|---|---|---|
| Data Protection + blob + Key Vault wrap | Ring backup, purpose strings | Cookies, opaque app tokens |
| AES-GCM + Key Vault key id per row | Nonces, rotation job, AAD | Columns other stacks decrypt |
| Identity `PasswordHasher` | Work factor | Passwords only |
| Certificate encryption (`X509`) | Cert rollover | Rare interop; do not reach for it because the class name sounds safer |

Give the API identity `get` and `unwrap` on the Key Vault key, not a blanket key-management role. Developers do not get production unwrap. Local dev uses a dev key ring and a dev AES key in user secrets, not the production key "so I can repro."

## What fails in review?

- Calling `Aes.Create()`, setting `Key` from a short password's UTF-8 bytes, and shipping it. The key length will throw, or worse, you pad the password into a key and commit it.
- Storing the nonce in a second column and forgetting it on update, then reusing the previous nonce for a new value.
- Using Data Protection in a console worker that did not call `SetApplicationName` and did not point at the same blob. Unprotect fails in the worker only. That looks like a bad token. It is a different key ring.
- Logging `Protect` output next to the plaintext id during debug and leaving the log level at Debug in production.
- Rolling your own "AES wrapper" that catches all exceptions and returns null. Callers will treat tampering as "no row."
- Fixing a lost key ring by switching the feature to AES without a migration story. Old cookies and tokens are already dead. Say so.

## How do you verify purpose strings and nonces?

1. Protect an export id, unprotect it in a second process that shares the blob and the Key Vault key. Expect the same GUID. Repeat with a process that has a different `SetApplicationName` and expect a cryptographic failure.
2. Unprotect an export token with the password-reset protector. It must fail.
3. Wait past the time limit (or pass a lifetime of one second in a test) and expect failure.
4. For AES-GCM, encrypt the same plaintext twice. The packed blobs must differ (fresh nonce). Tamper with one byte. `Decrypt` must throw, not return garbage.
5. Copy a blob onto a row with different AAD (tenant id). Decrypt must fail if you wired associated data.
6. Confirm production config has no `Key = "..."`. Confirm a new slot can read a token written by the old slot (shared ring). That is the scale-out test the XML encryptor article assumes you wanted.

## How do you record the choice per field?

Write the choice next to the field: "export query token: Data Protection, 15 minutes, purpose Clinic.ExportLinks.v1" or "national id column: AES-GCM, key id column, AAD tenant+row, rotated in Key Vault." If you cannot finish the sentence, you are not ready to call `Encrypt`. An ADR is the right place to freeze it so the next sample that pastes ECB does not get merged.


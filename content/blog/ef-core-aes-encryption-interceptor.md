---
title: "EF Core AES Encryption Interceptor for Selected Fields"
description: "EF Core AES encryption interceptor using AES-GCM: a key id, an HMAC blind index, and restoring plaintext so the next save does not wrap ciphertext."
date: "2026-10-03"
category: "security"
tags: ["EF Core", "AES-GCM", "ASP.NET Core", "Encryption", "SQL Server"]
related:
  - azure-key-vault-secrets-aspnet-core
  - aspnet-core-rbac-guide
  - ef-core-nplus1-include-vs-assplitquery
  - prevent-bola-idor-aspnet-core
faq:
  - q: "Does AES field encryption replace SQL Server TDE?"
    a: "No. TDE protects files at rest from someone who steals the disk. Field encryption protects selected columns from anyone who can read the table but not the key, including a broader set of database readers. You can use both. Neither protects values that are already in logs or in app memory."
  - q: "Can I filter rows in SQL by the plaintext value after I encrypt the column?"
    a: "Not usefully. The ciphertext is non-deterministic if you implement AES-GCM correctly, so equality in SQL will not match. Add a separate HMAC blind index for equality lookups, and accept that you cannot range-scan the secret."
  - q: "Why are people told to avoid a hand-rolled AES mode?"
    a: "ECB leaks patterns. CBC without an authentication tag does not detect tampering. Use AES-GCM (or another AEAD) with a unique nonce per encryption and a key from a secret store, not a password typed into source."
---

**An EF Core AES encryption interceptor** stores selected properties as AES-GCM ciphertext. The key never lives in the table, and the `DbContext` still works with plaintext in memory because the interceptor encrypts on the way to SQL and decrypts on the way back.

```text
Application code sees plaintext on the entity
    |
    |  materialization interceptor: ciphertext -> plaintext
    v
Change tracker (plaintext snapshot)
    |
    |  SavingChanges: plaintext -> enc:v1:{keyId}:...
    v
SQL column (ciphertext only)
    |
    +-- optional HMAC column for equality search (not reversible)
```

This is application-level encryption of specific columns. It is the wrong tool for "encrypt the whole database," and it is the right tool when a national id or similar secret should not be readable by every principal who has `SELECT` on the table.

**Where the key lives** -> [Key Vault](/blog/azure-key-vault-secrets-aspnet-core). **Who can call the feature** -> [RBAC](/blog/aspnet-core-rbac-guide).

Search intent for **ef core aes encryption interceptor** is a how-to that survives the two bugs that make most samples unsafe: a mode with no authentication, and a change tracker that keeps ciphertext after save or double-encrypts it.

## Name the threat before you encrypt a column

Write down what you are defending against. Field encryption helps when the database backup, a replica, or a support login can read columns and must not learn those values. It does not help when:

- The attacker runs code inside the app process (they can read the key and the plaintext).
- You log the entity, put the value in a telemetry property, or return it from an API the caller was not supposed to call. Authorization still matters. See [BOLA](/blog/prevent-bola-idor-aspnet-core).
- You need the database engine to `WHERE`, `ORDER BY`, or join on the secret. The engine sees opaque text.

Prefer a random 32-byte data key in Key Vault (or a wrapped DEK, if you are ready for envelope encryption). Do not derive that key by stuffing a passphrase through `Encoding.UTF8.GetBytes`. If you ever have only a passphrase, use a real KDF and a salt; a vault-held random key is the path this article assumes.

Do not commit a key, do not put one in `appsettings.json` that ships to the client, and do not invent a sample key "for now." Load bytes at startup and fail to boot if they are missing or not 32 bytes. This article shows the configuration names only.

AES-GCM is the mode. It needs a 12-byte nonce that is unique per encryption under the same key, and a 16-byte tag. `AesGcm` in .NET checks the tag on decrypt and throws if the column was edited. ECB is unacceptable. Unauthenticated CBC is not this design. The obsolete `AesGcm` constructor that hides the tag size should not be used; pass the tag size explicitly (16).

## Store a version and a key id in the ciphertext

> **Watch:** Reuse a nonce under one key and GCM stops authenticating. Use a random 12-byte nonce every call, and do not use the same key for AES and HMAC.

Store a version and a key id in the column so a later key is not a flag day you cannot read:

```text
enc:v1:{keyId}:{base64(nonce)}:{base64(tag)}:{base64(ciphertext)}
```

`keyId` selects which 32-byte key decrypts. Keep the previous key loaded while old rows exist. Encrypt new writes with the current id only.

```csharp
public interface IFieldCipher
{
    string Encrypt(string plaintext);
    string Decrypt(string stored);
    string BlindIndex(string plaintext);
}

public sealed class AesGcmFieldCipher : IFieldCipher
{
    private const int NonceSize = 12;
    private const int TagSize = 16;
    private readonly IReadOnlyDictionary<string, byte[]> _keys;
    private readonly string _currentKeyId;
    private readonly byte[] _lookupKey;

    public AesGcmFieldCipher(
        IReadOnlyDictionary<string, byte[]> keys,
        string currentKeyId,
        byte[] lookupKey)
    {
        _keys = keys;
        _currentKeyId = currentKeyId;
        _lookupKey = lookupKey;
        if (!keys.TryGetValue(currentKeyId, out var key) || key.Length != 32)
            throw new InvalidOperationException("Current field-encryption key is missing.");
        if (lookupKey.Length != 32)
            throw new InvalidOperationException("Lookup key must be 32 bytes.");
    }

    public string Encrypt(string plaintext)
    {
        var key = _keys[_currentKeyId];
        var nonce = RandomNumberGenerator.GetBytes(NonceSize);
        var plain = Encoding.UTF8.GetBytes(plaintext);
        var cipher = new byte[plain.Length];
        var tag = new byte[TagSize];
        using (var aes = new AesGcm(key, TagSize))
            aes.Encrypt(nonce, plain, cipher, tag);
        return string.Join(':',
            "enc", "v1", _currentKeyId,
            Convert.ToBase64String(nonce),
            Convert.ToBase64String(tag),
            Convert.ToBase64String(cipher));
    }

    public string Decrypt(string stored)
    {
        var parts = stored.Split(':');
        if (parts.Length != 6 || parts[0] != "enc" || parts[1] != "v1")
            throw new CryptographicException("Unrecognized ciphertext.");
        if (!_keys.TryGetValue(parts[2], out var key))
            throw new CryptographicException("Unknown key id.");
        var nonce = Convert.FromBase64String(parts[3]);
        var tag = Convert.FromBase64String(parts[4]);
        var cipher = Convert.FromBase64String(parts[5]);
        var plain = new byte[cipher.Length];
        using (var aes = new AesGcm(key, TagSize))
            aes.Decrypt(nonce, cipher, tag, plain);
        return Encoding.UTF8.GetString(plain);
    }

    public string BlindIndex(string plaintext)
    {
        using var hmac = new HMACSHA256(_lookupKey);
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(plaintext.Trim().ToUpperInvariant()));
        return Convert.ToHexString(hash);
    }
}
```

The lookup key is a different 32-byte secret. Reusing the AES key as an HMAC key couples two jobs. `BlindIndex` is deterministic on purpose so SQL can equality-match `NationalIdLookup`. It leaks equality (identical secrets share a hash). It must not be used as reversible encryption. Normalize the input the same way at write and at query time or lookups miss.

Size the column. A short secret grows by the prefix, the nonce, the tag, and base64 overhead. `nvarchar(512)` is a reasonable starting point for short identifiers; measure the longest value you accept and add margin. Do not use the plaintext max length. `nvarchar(max)` as a habit makes the column unattractive to index and easy to overfill.

## Encrypt on save, decrypt on read, and restore the tracker

> **Watch:** If you forget to restore plaintext after save, the next update wraps enc:v1 inside another enc:v1. Do not log the entity.

A value converter is the smaller tool when one or two properties need encryption: EF applies it at the database boundary and the snapshot can stay plaintext. Use a converter if that is all you need. An interceptor is justified when many entity types must pass through one cipher, or when you must coordinate a blind-index column with the ciphertext. The interceptor has a sharp edge: values you put on `CurrentValue` are the values the change tracker keeps. If you leave ciphertext there, the next line of the request and the next `SaveChanges` operate on ciphertext (and will encrypt it again).

![SavingChanges writes enc:v1 ciphertext; SavedChanges must put plaintext back or the next save wraps it](/images/blog/ef-core-aes-encryption-interceptor-restore.png)

The interceptor below only knows `Patient`. The lookup column is the HMAC, not a second copy of the secret.

```csharp
public sealed class Patient
{
    public Guid Id { get; set; }
    public string? NationalId { get; set; }
    public string? NationalIdLookup { get; set; }
}
```

```csharp
public sealed class FieldEncryptionInterceptor : SaveChangesInterceptor, IMaterializationInterceptor
{
    private readonly IFieldCipher _cipher;
    private readonly ConditionalWeakTable<DbContext, List<Pending>> _pending = new();

    public FieldEncryptionInterceptor(IFieldCipher cipher) => _cipher = cipher;

    public object InitializedInstance(MaterializationInterceptionData data, object entity)
    {
        if (entity is Patient patient && patient.NationalId is { Length: > 0 } stored)
            patient.NationalId = _cipher.Decrypt(stored);
        return entity;
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        var context = eventData.Context ?? throw new InvalidOperationException();
        var list = new List<Pending>();
        foreach (var entry in context.ChangeTracker.Entries<Patient>())
        {
            if (entry.State is not (EntityState.Added or EntityState.Modified))
                continue;
            var prop = entry.Property(p => p.NationalId);
            if (entry.State == EntityState.Modified && !prop.IsModified)
                continue;
            if (prop.CurrentValue is not { Length: > 0 } plain)
                continue;
            if (plain.StartsWith("enc:v1:", StringComparison.Ordinal))
                throw new InvalidOperationException("Refusing to encrypt ciphertext.");
            list.Add(new Pending(entry, plain));
            prop.CurrentValue = _cipher.Encrypt(plain);
            entry.Property(p => p.NationalIdLookup).CurrentValue = _cipher.BlindIndex(plain);
        }
        if (list.Count > 0)
            _pending.Add(context, list);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    public override async ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData,
        int result,
        CancellationToken cancellationToken = default)
    {
        var saved = await base.SavedChangesAsync(eventData, result, cancellationToken);
        Restore(eventData.Context);
        return saved;
    }

    public override async Task SaveChangesFailedAsync(
        DbContextErrorEventData eventData,
        CancellationToken cancellationToken = default)
    {
        Restore(eventData.Context);
        await base.SaveChangesFailedAsync(eventData, cancellationToken);
    }

    private void Restore(DbContext? context)
    {
        if (context is null || !_pending.TryGetValue(context, out var list))
            return;
        foreach (var pending in list)
        {
            pending.Entry.Property(p => p.NationalId).CurrentValue = pending.Plaintext;
            pending.Entry.Property(p => p.NationalId).OriginalValue = pending.Plaintext;
            pending.Entry.Property(p => p.NationalId).IsModified = false;
        }
        _pending.Remove(context);
    }

    private sealed record Pending(EntityEntry<Patient> Entry, string Plaintext);
}
```

Register the cipher and the interceptor as singletons. The interceptor holds no per-request state of its own; the `ConditionalWeakTable` keys pending restores by `DbContext`. Do not resolve a scoped interceptor from pooled context options captured at startup.

```csharp
builder.Services.AddSingleton<IFieldCipher>(_ =>
{
    var current = builder.Configuration["FieldEncryption:CurrentKeyId"]
        ?? throw new InvalidOperationException("FieldEncryption:CurrentKeyId is missing.");
    var material = builder.Configuration[$"FieldEncryption:Keys:{current}"]
        ?? throw new InvalidOperationException("Current field-encryption key is missing.");
    var lookup = builder.Configuration["FieldEncryption:LookupKey"]
        ?? throw new InvalidOperationException("FieldEncryption:LookupKey is missing.");
    var keys = new Dictionary<string, byte[]>(StringComparer.Ordinal)
    {
        [current] = Convert.FromBase64String(material)
    };
    return new AesGcmFieldCipher(keys, current, Convert.FromBase64String(lookup));
});

builder.Services.AddSingleton<FieldEncryptionInterceptor>();
builder.Services.AddDbContext<ClinicDbContext>((sp, options) =>
{
    options.UseSqlServer(builder.Configuration.GetConnectionString("Clinic"));
    options.AddInterceptors(sp.GetRequiredService<FieldEncryptionInterceptor>());
});
```

Load every key id that still appears in stored rows, not only `CurrentKeyId`. The values are base64 from Key Vault. There is no sample key in this article.

Only `Added` entities, and `Modified` entities whose secret actually changed, are rewritten. Touching every `Unchanged` patient on an unrelated save would rewrite the table and race with other writers.

`StartsWith("enc:v1:")` is a backstop against double encryption, not a parser. Decrypt still requires the full six-part form.

After a successful save, EF's snapshot would otherwise become the ciphertext that was written. `Restore` puts plaintext back into current and original and clears the modified flag so the context remains usable for the rest of the request. On failure, restore before the caller retries, or the retry encrypts ciphertext.

Blind-index columns are plaintext hashes. They are still secrets in the sense that they are stable identifiers. Do not return `NationalIdLookup` from APIs. Do grant it an ordinary index so equality search is a seek:

```csharp
modelBuilder.Entity<Patient>()
    .HasIndex(p => p.NationalIdLookup);
```

Query through the hash, then decrypt happens in materialization of the rows you actually loaded:

```csharp
var hash = _cipher.BlindIndex(nationalId);
var match = await _db.Patients.SingleOrDefaultAsync(p => p.NationalIdLookup == hash, ct);
```

There is no safe `WHERE NationalId == @plain` once the column is non-deterministic ciphertext.

## Backfill existing plaintext before you fail closed

> **Watch:** Contains and query filters on the secret column do not search plaintext. Search the blind index. A key in a string literal, including in tests, is still key material.

An interceptor that assumes every value is already `enc:v1` will throw on legacy plaintext, which is what you want the day cutover finishes, and what you do not want during the migration. Do not half-detect plaintext by "try decrypt, else return as-is" in production forever. That path will return attacker-supplied ciphertext errors as data, or worse, treat arbitrary strings as national ids.

Backfill in a job: read batches of rows whose `NationalId` does not start with the prefix, encrypt, write the blind index, commit. Run it before you flip the app to fail closed. Keep the job idempotent (skip prefixed values). After cutover, `Decrypt` throwing `CryptographicException` on a bad column is a 500 and an incident, not a blank field. A blank field hides tampering.

Column encryption also changes migrations. Widening `NationalId` is a normal migration. Dropping the plaintext column before the backfill finishes is not recoverable. Take a backup you have practiced restoring, then backfill.

## What makes this encryption unsafe?

- **Nonce reuse under one key.** GCM stops being authenticating encryption if a nonce repeats. Use a random 12-byte nonce from `RandomNumberGenerator` every call. Do not use a counter you reset on process start unless you have a design that cannot repeat, and do not use the key id as the nonce.
- **Logging `plaintext` or the entity.** Structured logging of `Patient` will undo the feature. Log the patient id.
- **Query filters and `Contains` on the secret.** They either cannot be translated or they translate against ciphertext. Both are bugs. Search the hash.
- **Including the secret in a covering index or in `ToQueryString()` samples pasted into tickets.** The SQL parameter will be ciphertext if you encrypted first, or plaintext if a test helper queries wrong. Treat query logs as sensitive during the rollout.
- **Key material in the interceptor as a C# string literal**, including tests that "will be replaced." Tests can use an ephemeral key generated in the test process. They should still not print it.
- **Forgetting `SavedChanges` restore** and watching the next update write `enc:v1:...` wrapped inside another `enc:v1`. The prefix guard should throw; if it does, you found this bug.
- **One key for AES and HMAC.** Split them.
- **Assuming this meets a compliance control you have not read.** Some regimes want a specific module, customer-managed keys, or hold-your-own-key patterns this interceptor does not implement. The code is a column control, not a certification.

## How do you verify the table holds ciphertext?

1. Insert a patient and read the row with a raw SQL client. The national id column starts with `enc:v1:` and does not contain the plaintext. The lookup column is hex, not the id.
2. Load the same row with EF. The property on the entity is plaintext. Save an unrelated change. The ciphertext in SQL does not change (no rewrite of unchanged secrets).
3. Change the national id, save, and confirm the key id, nonce, and blind index all change, and the in-memory entity is still plaintext afterward.
4. Flip a byte in the stored ciphertext. The next materialization throws. The API does not return the leftover string.
5. Two different plaintexts do not share a blind index; the same plaintext does, even though the ciphertext differs.
6. A test generates keys with `RandomNumberGenerator.GetBytes(32)` and never reads them from the repo.
7. The domain or API project has no copy of the key. Configuration points at Key Vault, and startup fails when the secret is absent.

Ship the backfill and the raw-SQL check before you point production traffic at the interceptor. The feature is done when a DBA looking at the table still cannot read the secret.


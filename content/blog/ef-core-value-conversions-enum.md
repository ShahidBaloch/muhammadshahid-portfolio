---
title: "EF Core Value Conversions for Enums and VOs"
description: "HasConversion maps an EmailAddress or enum to one SQL column. LINQ cannot query into a JSON blob you stuffed in that conversion."
date: "2026-09-07"
category: "ef-core"
tags: ["EF Core", "Architecture", "DDD", "C#"]
related:
  - ef-core-bulk-update-executeupdate
  - clean-architecture-aspnet-core
  - ef-core-sql-performance
faq:
  - q: "How do I store an enum as a string in EF Core?"
    a: "Property(e => e.Status).HasConversion<string>(). Analysts read Pending instead of 0. Keep a max length. Do not change the conversion after you have production rows without a migration plan."
  - q: "Can I query into a value object stored as JSON?"
    a: "Not with a simple HasConversion. EF treats the column as a blob. Use OwnsOne, or SQL Server JSON mapping, if you filter on inner properties."
  - q: "Will EF create a table for EmailAddress?"
    a: "It might if you leave it as an owned entity by convention. HasConversion to string keeps one NVARCHAR column. That is what I want for email and money."
---

I do not want a `string Email` on `User` if the domain already has an `EmailAddress` that rejects junk at construction. SQL Server still needs `NVARCHAR`. **`HasConversion`** is how I keep the CLR type and a single column.

This is not a Clean Architecture folder tour — that is [the architecture post](/blog/clean-architecture-aspnet-core). It is the mapping that stops EF from turning a value object into a surprise table.

## Map a value object to one column

```csharp
public readonly record struct EmailAddress
{
    public string Value { get; }

    public EmailAddress(string value)
    {
        if (string.IsNullOrWhiteSpace(value) || !value.Contains('@', StringComparison.Ordinal))
        {
            throw new ArgumentException("Invalid email.", nameof(value));
        }

        Value = value.Trim();
    }
}
```

```csharp
modelBuilder.Entity<User>()
    .Property(u => u.Email)
    .HasConversion(
        v => v.Value,
        v => new EmailAddress(v))
    .HasMaxLength(256);
```

Reads construct `EmailAddress` again. Invalid rows in a legacy table will throw on materialize — I fix the data or use a conversion that allows a fallback only on a migration window, not as a permanent silent swallow.

## Enums as strings

```csharp
modelBuilder.Entity<Encounter>()
    .Property(e => e.Status)
    .HasConversion<string>()
    .HasMaxLength(32);
```

Support can read `Submitted` in SSMS. Integer enums are smaller; I still prefer strings on healthcare status columns unless the table is enormous and measured. Changing a conversion on a live table is a migration, not a Friday config edit.

## What LINQ cannot do

```csharp
// Will not translate if Settings is a converted JSON string
db.Users.Where(u => u.Settings.Theme == "Dark")
```

EF sees a primitive. It cannot reach `.Theme`. If you must filter on pieces of the object, **do not** use a JSON `HasConversion`. Use `OwnsOne`, or EF Core’s JSON column mapping, so SQL Server sees properties. [ExecuteUpdate](/blog/ef-core-bulk-update-executeupdate) on a converted column sets the whole value, not an inner field.

I do not serialize an entire `Patient` graph into a converted column to “stay DDD.” That is a blob that cannot be indexed honestly. Keep the value object small: email, money, a code.

If EF just created a table for `EmailAddress`, [contact me](/contact). The conversion (or `OwnsOne` with `ToJson`) is the fix, not another entity.

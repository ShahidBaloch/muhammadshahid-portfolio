---
title: "Value Objects in EF Core: OwnsOne and HasConversion"
description: "Implement DDD value objects in .NET as C# records. Map with EF Core using OwnsOne for owned entities and HasConversion for primitive properties."
date: "2026-10-07"
category: "entity-framework"
tags: ["Value Objects", "EF Core", "DDD", ".NET", "Domain-Driven Design"]
---

## Why Use Value Objects

Without value objects, business concepts like money, addresses, and identifiers are represented as primitive types scattered throughout the codebase. A method signature like `void ProcessPayment(decimal amount, string currency, string customerId)` has no type safety — nothing stops a caller from passing the currency where the customerId goes. A bug that is invisible until production.

Value objects solve this by encapsulating the concept, its validation, and its behaviour into a single type. `ProcessPayment(Money amount, CustomerId customerId)` is self-documenting and type-safe.

Microsoft's [EF Core documentation on owned types](https://learn.microsoft.com/en-us/ef/core/modeling/owned-entities) covers how to map value objects with `OwnsOne` and `OwnsMany`.

## Project Layout

```text
src/
├── Clinic.Domain/
│   └── Shared/
│       ├── Money.cs                         # record Money(decimal Amount, string Currency)
│       ├── Address.cs                       # record Address(string Street, string City, string PostCode)
│       └── PatientId.cs                     # record struct PatientId(Guid Value)
└── Clinic.Data/
    └── Configuration/
        ├── MoneyConfiguration.cs            # OwnsOne<Money>(p => p.Fee, b => { ... })
        └── AddressConfiguration.cs          # OwnsOne<Address>(p => p.HomeAddress, b => { ... })
```

Value object definitions live in Domain. EF Core mapping lives in Data/Infrastructure. Domain has no EF Core reference.

---

## Implementing Value Objects as C# Records

C# records provide structural equality by default — two records with the same property values are equal. This matches the definition of a value object exactly.

```csharp
// Money: value equality, immutability, validation, and behaviour in one place
public record Money(decimal Amount, string Currency)
{
    // Validation in primary constructor body
    public Money
    {
        if (Amount < 0)
            throw new ArgumentOutOfRangeException(nameof(Amount), "Amount cannot be negative");
        if (string.IsNullOrWhiteSpace(Currency) || Currency.Length != 3)
            throw new ArgumentException("Currency must be a 3-letter ISO code");
        Currency = Currency.ToUpperInvariant(); // Normalise
    }
    
    public static Money GBP(decimal amount) => new(amount, "GBP");
    public static Money USD(decimal amount) => new(amount, "USD");
    public static Money Zero(string currency) => new(0, currency);
    
    public Money Add(Money other)
    {
        GuardSameCurrency(other);
        return this with { Amount = Amount + other.Amount };
    }
    
    public Money Subtract(Money other)
    {
        GuardSameCurrency(other);
        return this with { Amount = Amount - other.Amount };
    }
    
    public Money Multiply(decimal factor) => this with { Amount = Amount * factor };
    
    public bool IsGreaterThan(Money other)
    {
        GuardSameCurrency(other);
        return Amount > other.Amount;
    }
    
    private void GuardSameCurrency(Money other)
    {
        if (Currency != other.Currency)
            throw new InvalidOperationException(
                $"Cannot operate on {Currency} and {other.Currency}");
    }
    
    public override string ToString() => $"{Amount:F2} {Currency}";
}

// Address value object — multiple fields
public record Address(
    string Line1,
    string Line2,
    string City,
    string PostCode,
    string Country)
{
    public Address
    {
        if (string.IsNullOrWhiteSpace(Line1)) throw new ArgumentException("Line1 required");
        if (string.IsNullOrWhiteSpace(City)) throw new ArgumentException("City required");
        if (string.IsNullOrWhiteSpace(PostCode)) throw new ArgumentException("PostCode required");
    }
    
    public string FullAddress => $"{Line1}, {City}, {PostCode}, {Country}";
}
```

---

## Mapping Value Objects with EF Core

EF Core offers two approaches: `OwnsOne` for multi-column value objects and `HasConversion` for single-column value objects.

### OwnsOne: Multi-Column Value Objects

Use `OwnsOne` when the value object has multiple properties that should each be stored in their own column.

```csharp
public class OrderConfiguration : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.HasKey(o => o.Id);
        
        // Map Money to two columns in the Orders table
        builder.OwnsOne(o => o.Total, money =>
        {
            money.Property(m => m.Amount)
                .HasColumnName("TotalAmount")
                .HasPrecision(18, 2)
                .IsRequired();
            
            money.Property(m => m.Currency)
                .HasColumnName("TotalCurrency")
                .HasMaxLength(3)
                .IsRequired();
        });
        
        // Map Address to prefixed columns
        builder.OwnsOne(o => o.ShippingAddress, addr =>
        {
            addr.Property(a => a.Line1).HasColumnName("ShippingLine1").HasMaxLength(200);
            addr.Property(a => a.City).HasColumnName("ShippingCity").HasMaxLength(100);
            addr.Property(a => a.PostCode).HasColumnName("ShippingPostCode").HasMaxLength(20);
            addr.Property(a => a.Country).HasColumnName("ShippingCountry").HasMaxLength(2);
        });
    }
}
```

Resulting schema:
```sql
Orders table:
  Id, CustomerId, Status,
  TotalAmount, TotalCurrency,          -- Money stored inline
  ShippingLine1, ShippingCity, ...     -- Address stored inline
```

**OwnsMany** for collections of value objects:
```csharp
// Order has multiple addresses (billing, shipping, delivery notes)
builder.OwnsMany(o => o.AdditionalAddresses, addr =>
{
    addr.ToTable("OrderAddresses");
    addr.WithOwner().HasForeignKey("OrderId");
    addr.Property<int>("Id"); // Shadow key
    addr.HasKey("Id");
});
```

---

### HasConversion: Single-Column Value Objects

Use `HasConversion` when the value object can be serialised to a single database column value.

```csharp
// Strongly-typed ID value object
public record CustomerId(Guid Value)
{
    public static CustomerId New() => new(Guid.NewGuid());
    public static CustomerId From(Guid value) => new(value);
    public override string ToString() => Value.ToString();
}

// Map CustomerId to a UNIQUEIDENTIFIER column
builder.Property(o => o.CustomerId)
    .HasConversion(
        customerId => customerId.Value,     // To database: unwrap
        value => new CustomerId(value));     // From database: wrap

// JSON serialisation for complex value objects into a single column
builder.Property(o => o.Metadata)
    .HasConversion(
        meta => JsonSerializer.Serialize(meta, JsonOptions),
        json => JsonSerializer.Deserialize<OrderMetadata>(json, JsonOptions)!);
```

**EF Core 8+: Complex types** (no key, owned inline — cleaner than OwnsOne for simple cases):

```csharp
// Mark as complex type (EF Core 8+)
[ComplexType]
public record Money(decimal Amount, string Currency);

// No configuration needed — EF Core maps inline automatically
// Orders table gets Amount and Currency columns directly
```

---

## OwnsOne vs HasConversion: Which to Use?

| Scenario | Use |
|---|---|
| Value object has 2+ properties worth indexing | `OwnsOne` (columns are independently queryable) |
| Value object maps to a single primitive (ID, enum, code) | `HasConversion` (single column, simpler) |
| You want to query on individual fields (`WHERE TotalAmount > 100`) | `OwnsOne` |
| The value is opaque to the database (JSON blob) | `HasConversion` to JSON |
| EF Core 8+ with simple value object | `[ComplexType]` attribute |

---

## When a Value Object Should Become an Entity

A value object is the wrong choice when:

**The object has a lifecycle independent of its owner**: If a `Promotion` was once assigned to an order but the order no longer references it, and you still need to query all promotions, it needs an identity — it is an entity.

**The object is referenced by multiple aggregates**: If two orders reference the same `ShippingAddress` and you want to update it in one place and have both orders reflect the change, it needs an identity.

**The object needs its own audit trail**: If you need to track when an address was created and by whom, independently of the order, it is an entity.

**Rule of thumb**: If you find yourself asking "which one is it?" about two objects with identical values, it is an entity. If "they are the same value" is always the right answer, it is a value object.

---

## When to Use Value Objects

- Any business concept that is defined by its attributes, not its identity (Money, Address, DateRange, PhoneNumber, EmailAddress)
- Strongly-typed IDs to prevent passing the wrong ID type (`CustomerId` vs `OrderId`)
- Validated primitives where raw types allow invalid state (`EmailAddress` that rejects invalid formats)

## When NOT to Use Value Objects

- Objects that must be tracked individually over time (use entities)
- Objects that need their own table and relationships (EF Core `OwnsOne` in a single table has limits)
- When the EF Core mapping complexity outweighs the domain clarity benefit (simple lookup tables do not need value objects)

## Trade-offs

| Benefit | Cost / Risk |
|---|---|
| Type-safe business concepts — wrong argument order is a compile error | More types to maintain |
| Validation centralised in one place | EF Core configuration is more complex than scalar columns |
| Behaviour (arithmetic, formatting) lives with the data | Records are immutable — updating requires creating new instances |
| Eliminates primitive obsession | Can be over-applied — not every string needs a value object |

---

## If an Interviewer Asks...

**"How do you map a value object like Money to EF Core?"**

For a multi-field value object like Money (amount + currency), I use `OwnsOne` in the entity configuration — it maps each field to a column in the same table. For single-field value objects like strongly-typed IDs, I use `HasConversion` to convert between the record type and the underlying primitive. In EF Core 8, the `[ComplexType]` attribute handles simple cases without any configuration. The key principle is that value objects have no separate table and no surrogate key — they are stored inline with their owner.

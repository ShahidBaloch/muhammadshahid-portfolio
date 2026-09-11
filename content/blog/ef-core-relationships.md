---
title: "EF Core Relationships: One-to-One, One-to-Many, Many-to-Many"
description: "Map one-to-one, one-to-many, and many-to-many in EF Core — owned types vs FK, skip-level n-n vs a join entity with payload, delete behavior, and the Angular DTOs I actually return."
date: "2026-09-11"
updated: "2026-09-12"
category: "ef-core"
tags: ["EF Core", "SQL Server", "ASP.NET Core", ".NET", "C#"]
related:
  - ef-core-interview-questions
  - ef-core-nplus1-include-vs-assplitquery
  - ef-core-global-query-filters-soft-delete
  - ef-core-asnotracking-vs-identity-resolution
faq:
  - q: "How do I map a one-to-many relationship in EF Core?"
    a: "Collection on the parent, FK on the child, HasMany/WithOne. Required vs optional is nullability on the FK — that decision leaks into Angular create forms."
  - q: "When is many-to-many a join entity instead of a skip navigation?"
    a: "When the link has payload: AssignedAt, role, isPrimary. A payload-free n-n can stay a skip-level navigation and let EF hide the join table."
  - q: "Owned type or a one-to-one entity?"
    a: "OwnsOne when the child has no independent identity (clinic address). Separate entity + unique FK when you query the child alone or it outlives the parent."
  - q: "Should I cascade delete healthcare FKs?"
    a: "Default to Restrict until you have an explicit wipe story. Silent Cascade on a clinic delete is a compliance incident, not a convenience."
---

**EF Core relationships** are how C# navigations become SQL foreign keys. The mapping is the contract: required vs optional, who owns the FK, and whether a many-to-many link is just a pair of ids or a row with its own data.

```text
Clinic 1 ──< Provider          one-to-many (FK on Provider)
Clinic 1 ──  ClinicProfile     one-to-one  (unique FK or OwnsOne)
Provider *──* Specialty        many-to-many (skip or join entity)
```

**New to this** → stay here. **Merging a PR** → [one-to-many](#one-to-many--the-default). **On-call / interview** → [many-to-many](#many-to-many--skip-navigation-vs-join-entity) · [owned vs 1-1](#one-to-one-vs-owned-types) · [if an interviewer asks](#if-an-interviewer-asks).

Search **many to many entity relationship** or **relationship entity** and most tutorials stop at `HasMany` with a happy path. Production APIs fail on the next questions: does the join have a timestamp, can a child exist without a parent, and what does Angular receive — a graph or a DTO.

This page is the mapping I use on healthcare and marketplace APIs. Interview narration of the same decisions lives on [EF Core interview questions](/blog/ef-core-interview-questions). N+1 from walking those navigations is [Include vs AsSplitQuery](/blog/ef-core-nplus1-include-vs-assplitquery).

## Mental model

Think of a **clinic org chart**, not an ERD tool.

- **One-to-many** is a manager with a team. Every clinician badge has one `ClinicId`. You never store “the clinic’s people” as a second copy of the same rows.
- **One-to-one** is a locker assigned to one person. Either the locker *is* part of the person (`OwnsOne` address) or it is a separate thing with a unique key (a billing profile you query by NPI).
- **Many-to-many** is clinicians and specialties. If the only fact is “Sara is a cardiologist,” EF can hide the join table. If you also store *who assigned that specialty and when*, the join is a first-class entity.

If you cannot name the FK column, you do not have a relationship yet — you have two classes that happen to sit in the same solution.

## One-to-many — the default

Most ASP.NET Core APIs are this shape: a clinic has many providers; an order has many lines.

```csharp
public sealed class Clinic
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public ICollection<Provider> Providers { get; set; } = new List<Provider>();
}

public sealed class Provider
{
    public Guid Id { get; set; }
    public Guid ClinicId { get; set; }          // FK — required
    public Clinic Clinic { get; set; } = null!;
    public string FullName { get; set; } = "";
}

protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    modelBuilder.Entity<Provider>(e =>
    {
        e.HasOne(p => p.Clinic)
            .WithMany(c => c.Providers)
            .HasForeignKey(p => p.ClinicId)
            .OnDelete(DeleteBehavior.Restrict);

        e.HasIndex(p => p.ClinicId);
    });
}
```

**When to use:** the child cannot make sense without the parent in this product (a provider always belongs to a clinic).

**When not to:** you are about to `Include(c => c.Providers)` on a clinic **list** endpoint. That is an N+1 or cartesian waiting to happen. Project:

```csharp
var rows = await db.Clinics.AsNoTracking()
    .Select(c => new ClinicListDto(
        c.Id,
        c.Name,
        c.Providers.Count))
    .ToListAsync(ct);
```

Optional one-to-many is a **nullable FK** (`Guid? ClinicId`). Angular then cannot assume `clinicId` is present on create. I make that explicit in OpenAPI rather than discovering it in QA.

## One-to-one vs owned types

Two different intents share the phrase “one-to-one.”

### Owned type — the child is not a thing

A clinic mailing address is not queried by id. It dies with the clinic.

```csharp
public sealed class Address
{
    public string Line1 { get; set; } = "";
    public string City { get; set; } = "";
    public string PostalCode { get; set; } = "";
}

public sealed class Clinic
{
    public Guid Id { get; set; }
    public Address Address { get; set; } = new();
}

modelBuilder.Entity<Clinic>().OwnsOne(c => c.Address);
```

EF stores address columns on `Clinics` (or a table you configure). There is no `Addresses` DbSet. **Do not** `OwnsOne` a `Patient` — patients have identity, appointments, and their own lifecycle.

### True one-to-one — unique FK

A clinic has at most one billing profile, and ops look up that profile by NPI without loading the clinic.

```csharp
public sealed class BillingProfile
{
    public Guid Id { get; set; }
    public Guid ClinicId { get; set; }
    public Clinic Clinic { get; set; } = null!;
    public string Npi { get; set; } = "";
}

modelBuilder.Entity<BillingProfile>(e =>
{
    e.HasOne(b => b.Clinic)
        .WithOne(c => c.BillingProfile)
        .HasForeignKey<BillingProfile>(b => b.ClinicId)
        .OnDelete(DeleteBehavior.Restrict);

    e.HasIndex(b => b.ClinicId).IsUnique();
    e.HasIndex(b => b.Npi).IsUnique();
});
```

**When to use owned:** value object, no independent queries, no other table points at it.

**When to use a 1-1 entity:** you filter, unique-index, or authorize the child on its own.

## Many-to-many — skip navigation vs join entity

### Payload-free — let EF hide the join

```csharp
public sealed class Provider
{
    public Guid Id { get; set; }
    public ICollection<Specialty> Specialties { get; set; } = new List<Specialty>();
}

public sealed class Specialty
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public ICollection<Provider> Providers { get; set; } = new List<Provider>();
}

modelBuilder.Entity<Provider>()
    .HasMany(p => p.Specialties)
    .WithMany(s => s.Providers);
```

EF creates `ProviderSpecialty` (or a name you set with `UsingEntity`). Angular never sees that table. I return `string[] specialtyNames` on the provider DTO.

### Payload on the link — first-class join entity

“Who assigned cardiology, and when?” is not a skip navigation.

```csharp
public sealed class ProviderSpecialty
{
    public Guid ProviderId { get; set; }
    public Guid SpecialtyId { get; set; }
    public Provider Provider { get; set; } = null!;
    public Specialty Specialty { get; set; } = null!;
    public DateTimeOffset AssignedAt { get; set; }
    public Guid AssignedByUserId { get; set; }
    public bool IsPrimary { get; set; }
}

modelBuilder.Entity<ProviderSpecialty>(e =>
{
    e.HasKey(x => new { x.ProviderId, x.SpecialtyId });

    e.HasOne(x => x.Provider)
        .WithMany(p => p.ProviderSpecialties)
        .HasForeignKey(x => x.ProviderId)
        .OnDelete(DeleteBehavior.Restrict);

    e.HasOne(x => x.Specialty)
        .WithMany(s => s.ProviderSpecialties)
        .HasForeignKey(x => x.SpecialtyId)
        .OnDelete(DeleteBehavior.Restrict);
});
```

**When to use skip n-n:** the link is only “these two exist together.” Catalog tags, feature flags on a tenant.

**When not to:** the join has a date, a role, a quantity, or an audit user. Marketplace “seller in category” almost always grows `ApprovedAt`. Start with the join entity if you can already name that column in a standup.

Updating skip-level many-to-many from Angular is awkward (replace the whole collection). A join entity is an explicit `POST /api/providers/{id}/specialties` — easier to authorize and to audit.

## When I do not map a navigation at all

A `CreatedByUserId` on an order does not need `public User CreatedBy { get; set; }`. A shadow FK or a Guid column is enough. Navigations you never query still tempt `Include` and serialize cycles.

```csharp
public sealed class Order
{
    public Guid Id { get; set; }
    public Guid ClinicId { get; set; }
    public Guid CreatedByUserId { get; set; } // no User navigation
}
```

JSON cycles from walking both directions are [object cycle detected](/blog/aspnet-core-json-object-cycle). Lists should still [project](/blog/ef-core-nplus1-include-vs-assplitquery), not return the graph.

## Delete behavior I actually ship

| Behavior | Meaning | I use it when |
|---|---|---|
| `Restrict` | SQL refuses the delete if children exist | Healthcare FKs, money, anything auditable |
| `Cascade` | Delete children with the parent | Owned-like dependents you truly own (order lines) |
| `SetNull` | Child remains, FK cleared | Optional association (provider leaves a team) |

`Cascade` on `Clinic` → `Encounter` is how a “remove test clinic” button wipes production visits. I set `Restrict` and expose an explicit admin wipe that logs row counts.

## Angular contract

Do not leak join tables or circular graphs to the SPA.

```csharp
public sealed record ProviderDetailDto(
    Guid Id,
    string FullName,
    Guid ClinicId,
    string ClinicName,
    IReadOnlyList<SpecialtyDto> Specialties);

public sealed record SpecialtyDto(Guid Id, string Name, bool IsPrimary);
```

The handler maps `ProviderSpecialties` → `SpecialtyDto`. The form posts specialty ids (and `isPrimary`), not an EF entity.

## If an interviewer asks

**"How do you map many-to-many in EF Core?"**

**Strong answer:** Skip-level `HasMany`/`WithMany` when the join has no payload. The moment the link has `AssignedAt` or a role, introduce a join entity with a composite key and `Restrict` deletes. Do not `Include` both collections on a list endpoint — project to a DTO. Owned types (`OwnsOne`) are for value objects without identity, not for a fake 1-1 that you query by NPI.

**Weak answer:** "I add a junction table class for every n-n" or "I Include everything so Angular has the graph."

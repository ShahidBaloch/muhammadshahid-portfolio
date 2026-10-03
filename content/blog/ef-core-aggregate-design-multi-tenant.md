---
title: "EF Core Aggregate Design for Multi-Tenant SaaS"
description: "EF Core aggregate design for multi-tenant SaaS: one root per save, TenantId stamped by that root, and no second aggregate in the transaction."
date: "2026-10-03"
category: "ef-core"
tags: ["EF Core", "ASP.NET Core", "Multi-Tenancy", "DDD", "C#"]
faq:
  - q: "What is an aggregate in EF Core for a multi-tenant app?"
    a: "An aggregate is a cluster of entities you load and save together so a business rule stays true. In a SaaS database the root carries TenantId, children are reached through the root, and a transaction does not try to update two roots that belong to different consistency rules."
  - q: "Should every table be its own aggregate?"
    a: "No. Tables follow storage. Aggregates follow invariants. A note that cannot exist without an appointment, and whose limit is enforced by the appointment, stays inside that aggregate. A growing collection you query on its own is usually its own root."
  - q: "How does this differ from global query filters and the multi-tenancy overview?"
    a: "Query filters hide rows. The multi-tenancy overview covers resolution and database-per-tenant versus shared schema. This page is how to draw the consistency boundary so tenant data and business rules survive inside EF Core mappings."
---

**EF Core aggregate design for a multi-tenant SaaS app** is the set of rows you must change in one transaction so a rule stays true for one tenant. The aggregate root is the only object your application service loads and saves. Tenant id is part of that boundary, not a column you remember at the end.

![The appointment aggregate holds the root and its notes in one SaveChanges; the invoice aggregate stores only AppointmentId](/images/blog/ef-core-aggregate-design-multi-tenant.png)

**New to this** - stay here for the model. **Filters** - [global query filters](/blog/ef-core-global-query-filters-soft-delete). **Tenant resolution and database layout** - [multi-tenancy beyond query filters](/blog/multi-tenancy-aspnet-core-beyond-query-filters). **Publishing the fact** - [transactional outbox](/blog/transactional-outbox-ef-core).

## How should you design an EF Core aggregate for multi-tenant SaaS?

Search intent for **ef core aggregate design multi tenant** is a how-to. The reader has a shared-schema SaaS database, a few large `DbSets`, and bugs that look like "sometimes clinic B can attach a note to clinic A's appointment" or "the status changed but the audit row did not." They want a modeling rule that EF Core will actually enforce, not a glossary.

This page shows one aggregate, the mapping, the repository boundary, and the tenant invariants. It does not re-explain `HasQueryFilter` line by line, and it does not ask you to introduce a domain-event framework before you have a boundary.

## When does an aggregate earn its cost?

Shared-schema SQL, EF Core 8 or later, ASP.NET Core, tenant id already resolved on the request (claim, header you validated, or a membership lookup). Database-per-tenant still wants aggregates; you just leak less across tenants if the connection itself is pinned. The design below assumes the dangerous case: one database, many tenants, global filters that a teammate can disable.

If the feature is a single table with no invariant beyond "columns are non-null," a rich aggregate is ceremony. Use it when a rule spans children: "at most 20 notes," "cannot cancel after a signed encounter," "two staff cannot both be the primary clinician."

## How do you pick the boundary before the tables?

> **Watch:** A class with public setters and a service that copies a DTO is not an aggregate. A rule that exists only in Angular will be skipped by the next client.

An aggregate is a consistency boundary. Inside it, rules are true after every save. Across aggregates, they are true eventually, via an event or a later job.

Ask:

1. What must be true when this transaction commits, or the business is wrong right now?
2. What can be slightly stale (a search index, an invoice total copied for reporting)?
3. How big is the graph if I load it every time I touch one field?

Appointment with a capped note list is one aggregate. Appointment plus every historical invoice, plus the patient demographic record, plus the clinic settings row, is a transaction you will lock and a graph you will load by accident. Patient can be its own root. Invoice can be its own root that stores `AppointmentId` as a value, not as a navigation you lazy-load.

Child entities do not get repositories. If `AppointmentNote` has `INoteRepository.Get(id)`, callers will update the note and skip the cap, the tenant check, and the status rule that live on `Appointment`.

## How do you model the root so callers cannot skip the rule?

> **Watch:** Loading children by a GUID without TenantId is how another tenant's rows show up. Do not lazy-load a navigation the serializer will touch.

```csharp
public sealed class Appointment
{
    private readonly List<AppointmentNote> _notes = new();

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public AppointmentStatus Status { get; private set; }
    public IReadOnlyCollection<AppointmentNote> Notes => _notes;

    public void AddNote(string text, Guid authorId)
    {
        if (Status == AppointmentStatus.Cancelled)
            throw new InvalidOperationException("Cannot note a cancelled appointment.");
        if (string.IsNullOrWhiteSpace(text))
            throw new ArgumentException("Note text is required.", nameof(text));
        if (_notes.Count >= 20)
            throw new InvalidOperationException("Note limit reached.");

        var note = AppointmentNote.Create(text.Trim(), authorId);
        note.AssignTenant(TenantId);
        _notes.Add(note);
    }

    public void Cancel()
    {
        if (Status == AppointmentStatus.Completed)
            throw new InvalidOperationException("Completed appointments stay completed.");
        Status = AppointmentStatus.Cancelled;
    }
}

public sealed class AppointmentNote
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid AppointmentId { get; private set; }
    public string Text { get; private set; } = "";
    public Guid AuthorId { get; private set; }

    public static AppointmentNote Create(string text, Guid authorId) =>
        new()
        {
            Id = Guid.NewGuid(),
            Text = text,
            AuthorId = authorId
        };

    internal void AssignTenant(Guid tenantId) => TenantId = tenantId;
}
```

`TenantId` on the note is deliberate duplication. A filter on the root does not filter a query that starts at `DbSet<AppointmentNote>`. If notes are mapped as entities, stamp `TenantId` in the repository when the root is saved, and give notes a composite guard. Owned types avoid a second `DbSet` and are the better default when you never query notes without the appointment.

Private setters and a private collection stop a controller from doing `appointment.Notes.Add(...)`. EF Core can still use the backing field. Map it explicitly so this is not folklore.

## How do you map the aggregate and stamp TenantId?

```csharp
public sealed class ClinicDbContext : DbContext
{
    private readonly Guid _tenantId;
    public DbSet<Appointment> Appointments => Set<Appointment>();

    public ClinicDbContext(DbContextOptions<ClinicDbContext> options, ITenantContext tenant)
        : base(options) => _tenantId = tenant.TenantId;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Appointment>(b =>
        {
            b.HasKey(a => a.Id);
            b.Property(a => a.TenantId).IsRequired();
            b.Property(a => a.Status).HasConversion<string>().HasMaxLength(32);
            b.HasQueryFilter(a => a.TenantId == _tenantId);

            b.HasMany(a => a.Notes)
                .WithOne()
                .HasForeignKey(n => n.AppointmentId)
                .OnDelete(DeleteBehavior.Cascade);

            b.Navigation(a => a.Notes)
                .HasField("_notes")
                .UsePropertyAccessMode(PropertyAccessMode.Field);

            b.HasIndex(a => new { a.TenantId, a.Id }).IsUnique();
        });

        modelBuilder.Entity<AppointmentNote>(b =>
        {
            b.HasKey(n => n.Id);
            b.Property(n => n.TenantId).IsRequired();
            b.Property(n => n.Text).HasMaxLength(2000);
            b.HasQueryFilter(n => n.TenantId == _tenantId);
            b.HasIndex(n => new { n.TenantId, n.AppointmentId });
        });
    }
}
```

The unique index includes `TenantId` even though `Id` is a GUID. It documents the real identity in a shared database and keeps a future human-readable key honest. Do not use a unique index on `Appointment.Id` alone as your only tenant story; authorization still happens in the query.

The child tenant is stamped inside `AddNote`, not from the request body. Never accept `TenantId` from JSON. The claim on the request wins, and a missing appointment is a 404 so you do not reveal another tenant's id.

```csharp
public async Task AddNoteAsync(Guid appointmentId, string text, Guid authorId, CancellationToken ct)
{
    var appointment = await db.Appointments
        .Include(a => a.Notes)
        .SingleOrDefaultAsync(a => a.Id == appointmentId, ct)
        ?? throw new NotFoundException();

    appointment.AddNote(text, authorId);
    await db.SaveChangesAsync(ct);
}
```

One `SaveChangesAsync` commits the appointment and its notes. Do not call `SaveChanges` once per note. Do not open a second `DbContext` to "also update the dashboard aggregate" in the same method and pretend you have one transaction. If the dashboard is another root, write an outbox record in this save and let a worker update the dashboard.

## How do you change a second aggregate?

> **Watch:** Updating every appointment for a tenant in one transaction is a batch, not one aggregate. Map rule failures to 409 or 422, and a wrong tenant to 404.

Cancelling an appointment may need to release a room hold. If both roots must change or neither must, you have drawn the boundary in the wrong place and they might be one aggregate, or you need a process manager that can compensate. If the room hold can catch up a second later, publish `AppointmentCancelled` in the same transaction as the cancel (outbox) and let the room aggregate handle it.

Do not `Include` across aggregates "to be safe." You will lock more rows than the invariant needs and you will make tenant filters look like they work while a single `IgnoreQueryFilters()` somewhere dumps the graph.

`IgnoreQueryFilters()` is a support back door. It is how a background job that "fixes notes" reads every tenant. Ban it in application code. If a worker must scan tenants, it should open a context per tenant with that tenant's id, not one context with filters off.

## What changes between shared schema and database per tenant?

Database per tenant makes a missing filter less fatal because the connection points at one database. You still want aggregates: the bugs are invariant bugs, not only leak bugs. Do not stamp a random `TenantId` and also point at a tenant database without checking they match. A mis-routed connection plus a body-supplied id is still a leak.

Shared schema: every entity you can query needs the filter and the column. Owned collections that have no `DbSet` are safer than entity children. If reporting needs SQL across notes, give them the tenant column anyway and accept the entity mapping with a filter.

Migrations: a global query filter is not a constraint. Add the index and the foreign key. A filter does not stop a raw SQL report or a second app with the same login.

## What fails in review?

- An "aggregate" class that is only the EF entity with public setters and a service that sets properties from the DTO. There is no invariant in code, so there is no aggregate.
- Loading children with a separate query that forgets `TenantId` because "the id is a GUID." Always go through the root or through a filtered set.
- Lazy loading proxies on the root, so touching `Patient.Appointments` pulls another tenant's data the moment a filter is wrong, and it does it inside a serializer.
- Putting `TenantId` only on the root and then querying `AppointmentNotes` in a minimal API for a grid. The grid is a second model. Build it from a query that still filters tenant, and do not let that query call `AddNote`.
- Enforcing the 20-note rule only in Angular. The API will be called without Angular.
- A transaction that updates every appointment for a tenant "as one aggregate." That is a batch. Batches have different failure and lock behavior. Model them as a job that loads roots one at a time.
- Catching domain `InvalidOperationException` and returning 500. Map rule failures to 409 or 422 with a problem body. Map "wrong tenant" to 404.

## How do you verify the boundary and the tenant?

1. As tenant A, add notes through the API until the 21st fails with your conflict response. Confirm the database has 20 notes and all of them have tenant A's id.
2. As tenant B, `GET` tenant A's appointment id. Expect 404, including a direct note id if you exposed one.
3. In a test, call `IgnoreQueryFilters` only to assert the back door is not used by production services (a architecture test that scans for the method name is enough).
4. Cancel a completed appointment. The status in SQL does not change. The rule threw before `SaveChanges`.
5. Save one note and confirm a single transaction (SQL profiler or a test double that counts `SaveChangesAsync`). An outbox row, if you write one, is in that same commit.
6. Run the same tests against a context constructed with tenant B's id and be sure the model filter parameter is not a stale captured tenant from a pooled `DbContext`. If you pool contexts, re-set tenant per request or do not pool a context that captured `ITenantContext` in the constructor incorrectly. Context pooling and a scoped tenant are a known foot-gun: the pool reuses the instance. Prefer `AddDbContext` (not pool) when the filter closes over a scoped tenant, or set the tenant id on each instance in an interceptor that reads the current request. This is the check that fails in production after you "optimize" the context.

## What is this pattern not?

It is not a requirement to add MediatR, a generic repository, or a layer per noun. A root class with methods, an EF mapping, and an application method that loads one root and saves once is the whole pattern. Add events when a second root must react. Until then, a second `SaveChanges` on a second root inside the HTTP request is the bug you are designing away.


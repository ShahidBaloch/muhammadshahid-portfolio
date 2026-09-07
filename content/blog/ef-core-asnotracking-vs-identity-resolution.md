---
title: "AsNoTracking vs Identity Resolution in EF Core"
description: "AsNoTracking can allocate more memory when the same Patient is on every row. When I use AsNoTrackingWithIdentityResolution on ASP.NET Core reads."
date: "2026-09-07"
category: "ef-core"
tags: ["EF Core", "Performance", "Memory", "ASP.NET Core"]
related:
  - ef-core-nplus1-include-vs-assplitquery
  - ef-core-cartesian-explosion-multiple-include
  - ef-core-sql-performance
faq:
  - q: "Does AsNoTracking always use less memory?"
    a: "No. Without identity resolution, EF new’s a Category or Patient object for every row even when the database id is the same. Tracking (or AsNoTrackingWithIdentityResolution) reuses one instance per key."
  - q: "When should I use AsNoTrackingWithIdentityResolution?"
    a: "Read-only queries that Include a many-to-one (appointments → patient, products → category) and return a large page. Skip it on flat DTO projections that never Include."
  - q: "Is this the same as cartesian explosion?"
    a: "No. Cartesian explosion is extra SQL rows from two collection Includes. Identity resolution is extra CLR objects after the rows arrive."
---

Read-only handlers should default to `AsNoTracking()`. That advice is still right for a projected grid. It is **wrong** as a religion when you `Include` a many-to-one and the same `Patient` appears on every appointment in the page.

Without the change tracker, EF Core **does not reuse** instances by primary key. Ten thousand catalog rows and five categories become ten thousand `Category` objects. GC pays for it. The JSON can still look fine because you serialize `product.Category.Name`.

This is **not** [N+1](/blog/ef-core-nplus1-include-vs-assplitquery) (extra round-trips) and **not** [cartesian explosion](/blog/ef-core-cartesian-explosion-multiple-include) (multiplied JOIN rows). The SQL can be one cheap statement. Memory is the tax.

## The clinic list that allocated twice

A provider portal loaded today’s appointments with the patient navigation, no tracking, page size 200. Five clinics share a small set of patients who book repeatedly. SQL Server returned 200 rows. The heap held 200 `Patient` instances, many with the same `Id`.

```csharp
var appointments = await db.Appointments
    .Include(a => a.Patient)
    .AsNoTracking()
    .Where(a => a.ClinicId == clinicId && a.Start >= start && a.Start < end)
    .ToListAsync(ct);
```

Tracked queries would have given you **one** `Patient` per id for that context. `AsNoTracking` skipped that dictionary on purpose — faster for unique rows, wasteful when the reference repeats.

## Use identity resolution on that shape

```csharp
var appointments = await db.Appointments
    .Include(a => a.Patient)
    .AsNoTrackingWithIdentityResolution()
    .Where(a => a.ClinicId == clinicId && a.Start >= start && a.Start < end)
    .ToListAsync(ct);
```

EF still will not track for `SaveChanges`. It **will** keep a short-lived identity map while materializing the result so `appointment.Patient` is the same CLR object when `PatientId` matches.

I use this on:

- Appointment or encounter lists that `Include` `Patient` / `Provider`
- Catalog pages that `Include` `Category` or `Seller`
- Any read that returns an **entity graph** with a repeated reference

## Prefer a projection instead

If Angular only needs names, do not Include the graph:

```csharp
var rows = await db.Appointments
    .AsNoTracking()
    .Where(a => a.ClinicId == clinicId)
    .Select(a => new AppointmentRowDto(a.Id, a.Patient.FullName, a.Start))
    .ToListAsync(ct);
```

No identity map. No duplicated `Patient` instances. This is the default I want on list APIs. Identity resolution is the fallback when a teammate already shipped an entity graph and you cannot change the contract this sprint.

## When not to use it

- Flat queries with no `Include` — the dictionary is overhead
- Rows that are already unique (one entity per key, no repeated references)
- Write paths — you want tracking, not a no-tracking identity map

Do not “fix” a fat JOIN with identity resolution. If SSMS shows `lines × events` rows, read the cartesian post. Identity resolution runs **after** those rows have already crossed the network.

## How this differs from a PUT tracking error

“Another instance with the same key is already being tracked” on a PUT is a **write** bug: you loaded an entity, then `Update`’d a second instance from the Angular body. That story is in [EF Core interview questions](/blog/ef-core-interview-questions). This URL is **reads**.

If a read-only ASP.NET Core endpoint is allocating copies of the same patient on every row, [contact me](/contact). A dump of the Include list plus working-set delta is enough to choose projection vs identity resolution.

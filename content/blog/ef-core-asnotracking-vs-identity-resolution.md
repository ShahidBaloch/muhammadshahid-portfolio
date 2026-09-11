---
title: "AsNoTracking vs Identity Resolution in EF Core"
description: "AsNoTracking vs identity resolution in EF Core: when no-tracking duplicates Patient objects on every row, and when AsNoTrackingWithIdentityResolution fixes read-only Includes."
date: "2026-09-07"
updated: "2026-09-12"
category: "ef-core"
tags: ["EF Core", "Performance", "Memory", "ASP.NET Core"]
related:
  - ef-core-nplus1-include-vs-assplitquery
  - ef-core-cartesian-explosion-multiple-include
  - ef-core-sql-performance
faq:
  - q: "When should I use AsNoTracking in EF Core?"
    a: "On read-only queries — list endpoints, reports, anything that will not call SaveChanges on those entities. Default for projected DTOs. Skip it on PUT/PATCH load-mutate-save paths."
  - q: "Does AsNoTracking always use less memory?"
    a: "No. Without identity resolution, EF new’s a Category or Patient object for every row even when the database id is the same. Tracking (or AsNoTrackingWithIdentityResolution) reuses one instance per key."
  - q: "When should I use AsNoTrackingWithIdentityResolution?"
    a: "Read-only queries that Include a many-to-one (appointments → patient, products → category) and return a large page. Skip it on flat DTO projections that never Include."
  - q: "Is this the same as cartesian explosion?"
    a: "No. Cartesian explosion is extra SQL rows from two collection Includes. Identity resolution is extra CLR objects after the rows arrive."
---

**`AsNoTracking()`** tells EF Core not to track entities for `SaveChanges` — and it also skips the identity map. Without that map, the same `PatientId` on two hundred appointment rows becomes two hundred separate `Patient` objects in memory. **`AsNoTrackingWithIdentityResolution()`** restores key-based instance reuse during materialization without turning change tracking back on.

```text
AsNoTracking (no identity map)     AsNoTrackingWithIdentityResolution

  appt1 → Patient#1                  appt1 → Patient(A) ─┐
  appt2 → Patient#2 (same Id)        appt2 → Patient(A) ─┘ same CLR object
  appt3 → Patient#3                  appt3 → Patient(B)
  200 rows → 200 Patient objects     200 rows → ~40 Patient objects
```

**New to this** → stay here. **Merging a PR** → [clinic list](#the-clinic-list-that-allocated-twice). **On-call / interview** → [identity resolution](#use-identity-resolution-on-that-shape) · [if an interviewer asks](#if-an-interviewer-asks).

**Terms used here:** **Identity map** = EF's short-lived dictionary that reuses one CLR object per primary key while materializing a result. **Change tracker** = the structure that tracks entities for `SaveChanges` (identity resolution borrows the idea without enabling writes). **Materialization** = turning SQL rows into .NET objects after the query returns.

Picture a **photocopy**: `AsNoTracking()` hands the reader a copy and does not keep the original on the desk — cheap for a one-off list. Tracking keeps the original so you can write in the margins and `SaveChanges` files it. The trap is two hundred appointment rows that each **re-print the same patient page** because plain `AsNoTracking` skipped the identity map. `AsNoTrackingWithIdentityResolution()` keeps one master copy and two hundred pointers. A DTO `Select` never prints the patient page at all — usually the better API.

Read-only handlers should default to `AsNoTracking()` on projected grids. That advice is still right there. It is wrong as a religion when you `Include` a many-to-one and the same `Patient` appears on every appointment in the page. The SQL can be one cheap statement. Memory is the tax.

This is not [N+1](/blog/ef-core-nplus1-include-vs-assplitquery) (extra round-trips) and not [cartesian explosion](/blog/ef-core-cartesian-explosion-multiple-include) (multiplied JOIN rows).

## When should I use AsNoTracking?

**`AsNoTracking()`** is the default I want on **reads**: list endpoints, exports, anything that will not call `SaveChanges` on those instances. It skips the change tracker. It is the wrong default on a PUT that loads an entity, mutates it, and saves — you want tracking there.

```csharp
// List / report — yes
var rows = await db.Orders.AsNoTracking()
    .Where(o => o.TenantId == tenantId)
    .Select(o => new OrderListItemDto(o.Id, o.Status, o.Total))
    .ToListAsync(ct);

// PUT load-mutate-save — no (keep tracking)
var order = await db.Orders.FirstAsync(o => o.Id == id, ct);
order.Status = body.Status;
await db.SaveChangesAsync(ct);
```

Use **`AsNoTrackingWithIdentityResolution()`** when the read still returns an entity graph with a repeated many-to-one (`Include` patient on 200 appointments). Use a **projection** when Angular only needs names.

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

## If an interviewer asks

*Does `AsNoTracking` always use less memory than tracking?*

**30-second answer:** No. Tracking keeps an identity map so repeated foreign keys share one `Patient` instance. Plain `AsNoTracking` skips that map on purpose — faster when every row is unique, wasteful when the same reference repeats across a page.

**Strong answer:** I'd project the grid to a DTO when Angular only needs names — one SQL statement, no duplicated navigations, no identity map overhead. If the handler already returns an entity graph with `Include` on a many-to-one, I'd switch to `AsNoTrackingWithIdentityResolution()`. I'd confirm with a memory snapshot or working-set delta on a realistic page size, not demo data with two patients. I would not use identity resolution to fix cartesian explosion — that is row multiplication in SQL, fixed with split queries or fewer Includes.

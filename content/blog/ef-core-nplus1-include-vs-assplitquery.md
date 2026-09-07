---
title: "EF Core N+1 vs Include vs AsSplitQuery"
description: "EF Core N+1 is extra round-trips in a loop. Include fixes that. AsSplitQuery is for a different bug. How I tell them apart on ASP.NET Core APIs."
date: "2026-08-15"
updated: "2026-09-07"
category: "ef-core"
tags: ["EF Core", "SQL Server", "Performance", "ASP.NET Core"]
related:
  - ef-core-cartesian-explosion-multiple-include
  - ef-core-sql-performance
  - ef-core-asnotracking-vs-identity-resolution
faq:
  - q: "What is the EF Core N+1 problem?"
    a: "You run one query for a list, then one query per row when you touch a navigation in a loop. Fifty appointments become fifty-one SQL round-trips. The JSON still looks right."
  - q: "Does Include fix N+1?"
    a: "Yes for a reference or one collection you actually need. It does not mean Include two collections on the same query. That is cartesian explosion."
  - q: "When do I use AsSplitQuery?"
    a: "When you truly need two collection Includes. Split query is not the N+1 fix. N+1 is too many queries. Cartesian explosion is one query that multiplied rows."
---

![EF Core N+1 vs Include: one list query plus a query per row, versus a single Include or projection](/images/blog/ef-core-nplus1-roundtrips.png)

The Angular schedule loaded fifty appointments. SQL Server showed **fifty-one** commands. That is **N+1**: one query for the list, then one query per row when the handler touches `appointment.Patient`.

This page is that bug. It is **not** [cartesian explosion](/blog/ef-core-cartesian-explosion-multiple-include). Cartesian is one fat JOIN when you `Include` two collections. N+1 is **too many round-trips**. If the dashboard is “generally slow,” start at the [EF Core SQL performance](/blog/ef-core-sql-performance) checklist.

## How N+1 shows up

```csharp
var appointments = await db.Appointments
    .Where(a => a.ClinicId == clinicId && a.Start >= from && a.Start < to)
    .OrderBy(a => a.Start)
    .Take(50)
    .ToListAsync(ct);

foreach (var row in appointments)
{
    dto.Add(new AppointmentRow(row.Id, row.Patient.FullName, row.Start));
}
```

Demo data: two patients, nobody notices. Production: fifty lazy loads (or fifty explicit loads) while Angular waits. Application Insights shows SQL dependency count, not one slow statement.

I see the same shape on order lists that touch `Seller`, claim lists that touch `Provider`, and marketplace search that hydrates `Category` in a loop after `ToList`.

## Confirm it before you Include the world

1. Log commands in Development (`RelationalEventId.CommandExecuted`).
2. Count statements for **one** HTTP request — not duration of the first `SELECT`.
3. If count ≈ `1 + pageSize`, you have N+1.

If count is **one** and SSMS row count is `lines × events`, stop. That is cartesian explosion. Do not “fix” it by adding another `Include`.

## Fix 1: project the screen (usually the right fix)

List endpoints should not return entity graphs.

```csharp
var rows = await db.Appointments
    .AsNoTracking()
    .Where(a => a.ClinicId == clinicId && a.Start >= from && a.Start < to)
    .OrderBy(a => a.Start)
    .Select(a => new AppointmentRowDto(
        a.Id,
        a.Patient.FullName,
        a.Start,
        a.Status))
    .Take(50)
    .ToListAsync(ct);
```

One SQL statement. SQL Server joins `Patient` once. Angular gets four fields. No tracker. This is what I merge for grids.

## Fix 2: Include when you truly need the graph

Detail pages, or a handler that must mutate `Patient` in the same request:

```csharp
var appointments = await db.Appointments
    .Include(a => a.Patient)
    .AsNoTracking()
    .Where(a => a.ClinicId == clinicId)
    .Take(50)
    .ToListAsync(ct);
```

`Include` a **reference** (`Patient`) is a JOIN, not N+1. `Include` **one** collection (`Lines`) is also not cartesian explosion. Cartesian starts at **two collection** Includes on the same query.

Do not `Include` six navigations “so N+1 cannot happen.” You will trade round-trips for a JOIN product. That failure lives on the [cartesian explosion](/blog/ef-core-cartesian-explosion-multiple-include) URL.

## Fix 3: AsSplitQuery is not the N+1 hammer

`AsSplitQuery` tells EF to load collections in **separate** SELECTs instead of one multiplied JOIN. Use it when you already decided two collections belong on one request:

```csharp
var claim = await db.Claims
    .AsSplitQuery()
    .Include(c => c.ServiceLines)
    .Include(c => c.StatusEvents)
    .AsNoTracking()
    .SingleAsync(c => c.Id == claimId, ct);
```

That is three round-trips **on purpose**. It is the opposite of “I had N+1 and I wanted fewer queries.” If you only needed patient names on a list, split query is ceremony. Prefer the projection.

Split queries can see a consistency window between statements. On SQL Server I rely on [read committed snapshot](/blog/sql-server-deadlocks-snapshot-isolation) or wrap the split in a transaction when the two collections must match one snapshot.

## When I leave a loop in place

Rare: a follow-up query that cannot be expressed as a JOIN (a different database, an HTTP call). Then I batch IDs:

```csharp
var patientIds = appointments.Select(a => a.PatientId).Distinct().ToArray();
var patients = await db.Patients
    .AsNoTracking()
    .Where(p => patientIds.Contains(p.Id))
    .ToDictionaryAsync(p => p.Id, ct);
```

Two queries, not `1 + N`. Still not `Include` of two collections.

## Quick map

| What you see | Name | This URL? |
|---|---|---|
| `1 + pageSize` SQL commands | N+1 | Yes |
| One command, row count ≈ `A × B` | Cartesian explosion | [Other post](/blog/ef-core-cartesian-explosion-multiple-include) |
| One clinic fast, hub clinic times out | Parameter sniffing | [Sniffing post](/blog/ef-core-sql-server-parameter-sniffing) |
| Same `Patient` is two CLR objects on a read | Identity resolution | [AsNoTracking post](/blog/ef-core-asnotracking-vs-identity-resolution) |

Interview narration for concurrency tokens and query filters is [EF Core interview questions](/blog/ef-core-interview-questions), not this page.

If an ASP.NET Core list endpoint is issuing one SQL command per grid row, [contact me](/contact). A command count from Application Insights plus the handler is enough to choose projection vs Include.

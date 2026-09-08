---
title: "EF Core Optimistic Concurrency with RowVersion"
description: "EF Core optimistic concurrency with RowVersion: map SQL Server rowversion as a concurrency token, return 409 on conflict, and stop last-write-wins on encounters."
date: "2026-09-07"
category: "ef-core"
tags: ["EF Core", "SQL Server", "Concurrency", "ASP.NET Core"]
related:
  - ef-core-interview-questions
  - sql-server-deadlocks-snapshot-isolation
  - aspnet-core-api-validation
faq:
  - q: "How do I stop lost updates in EF Core?"
    a: "Map a SQL Server rowversion as a concurrency token. GET returns it. PUT sends it back. The second save throws DbUpdateConcurrencyException — map that to 409, not 500."
  - q: "Can I use DateTime instead of rowversion?"
    a: "You can mark LastModified as a concurrency token. The app must update it on every save. Two writes in the same millisecond can slip through. rowversion is the database’s job."
  - q: "Does snapshot isolation fix lost updates?"
    a: "No. RCSI stops readers blocking writers. Two PUTs still need a concurrency token or you keep last-write-wins."
---

**Optimistic concurrency** in EF Core adds a token column to the `WHERE` clause of every UPDATE. If another writer already saved, zero rows match and EF throws `DbUpdateConcurrencyException`. SQL Server **`rowversion`** is the token I map — the database maintains it; the app sends back what it read on GET.

```text
Two clinicians, same encounter, no token     With RowVersion token

  Tab A: PATCH status = Reviewed             Tab A: PATCH + rowVersion v1 → OK (v2)
  Tab B: PATCH status = Closed               Tab B: PATCH + rowVersion v1 → 0 rows
  Tab B wins silently                        API returns 409, Angular refreshes
```

**New to this** → stay here. **Merging a PR** → [map the token](#map-the-token). **On-call / interview** → [GET then PUT](#get-then-put) · [if an interviewer asks](#if-an-interviewer-asks).

**Terms used here:** **Concurrency token** = a column EF includes in the UPDATE `WHERE` to detect stale writes. **`IsRowVersion()`** = fluent mapping for SQL Server `rowversion` / `timestamp`. **`DbUpdateConcurrencyException`** = EF's signal that the token did not match — map to HTTP 409, not 500.

Two clinicians had the same encounter open. Both patched `status`. The second save silently overwrote the first. That is a **lost update**, not a deadlock.

The interview prompt is [EF Core interview questions](/blog/ef-core-interview-questions). [RCSI / snapshot isolation](/blog/sql-server-deadlocks-snapshot-isolation) is the **blocking** article — it will not save you from two writers on the same encounter.

## Map the token

```csharp
public class Encounter
{
    public Guid Id { get; set; }
    public EncounterStatus Status { get; set; }
    public byte[] RowVersion { get; set; } = [];
}
```

```csharp
modelBuilder.Entity<Encounter>()
    .Property(e => e.RowVersion)
    .IsRowVersion();
```

`[Timestamp]` on `byte[]` is the attribute form. I prefer fluent so it shows up next to the rest of the mapping. SQL Server maintains the value. You do not set it in C# except to send back what you read.

## GET then PUT

The Angular editor stores `rowVersion` from GET (Base64 in JSON). PUT sends it with the body. The API copies it onto the tracked entity before `SaveChanges`:

```csharp
var encounter = await db.Encounters
    .FirstAsync(e => e.Id == id, ct);

encounter.Status = body.Status;
db.Entry(encounter).Property(e => e.RowVersion).OriginalValue = body.RowVersion;

try
{
    await db.SaveChangesAsync(ct);
}
catch (DbUpdateConcurrencyException)
{
    throw new ConcurrencyConflictException(id);
}
```

The UPDATE looks like `WHERE [Id] = @id AND [RowVersion] = @token`. If clinic A already saved, clinic B’s token matches zero rows. EF throws. I do **not** return 500. [ProblemDetails](/blog/aspnet-core-api-validation) with 409 is the contract the interceptor and the SPA already understand.

Prove it with two tests against **real SQL** (Testcontainers). In-memory provider is a liar for rowversion.

## When not to use pessimistic locks

`UPDLOCK` for the lifetime of an Angular tab means a clinician went to coffee and locked the encounter. I do not do that on SPA products. Optimistic + 409 + “reload” is the product behavior.

Writer/writer deadlocks on **different** rows under read committed are a locking problem — RCSI. Writer/writer on the **same** row without a token is last-write-wins — this page.

## DateTime tokens

`.IsConcurrencyToken()` on `LastModified` works if every code path stamps it. Clock resolution and a missed assignment are why I still want `rowversion` on Encounter, Order, and FeeSchedule headers. Use a datetime token only when you cannot add a column this release.

## If an interviewer asks

*Two Angular tabs load the same encounter. Both PATCH `status`. Last write wins. How do you fix it?*

**30-second answer:** Map SQL Server `rowversion` as a concurrency token. GET returns it. PUT sends it back. Second save throws `DbUpdateConcurrencyException` — return 409 so the SPA can refresh.

**Strong answer:** I'd use `.IsRowVersion()` on a `byte[]` property, copy the token from the PUT body onto `OriginalValue` before `SaveChanges`, and map the exception to ProblemDetails with 409. I'd prove it with two integration tests against real SQL — InMemory provider lies about rowversion. I would not use pessimistic `UPDLOCK` for SPA tabs left open over coffee. RCSI fixes reader/writer blocking, not two writers on the same row without a token.

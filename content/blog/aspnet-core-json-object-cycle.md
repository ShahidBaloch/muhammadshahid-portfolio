---
title: "A Possible Object Cycle Was Detected in ASP.NET Core JSON"
description: "Fix System.Text.Json object cycle detected in ASP.NET Core — EF navigation graphs, why ReferenceHandler.Preserve breaks Angular, and DTO projection that actually ships."
date: "2026-09-07"
updated: "2026-09-08"
category: "architecture"
tags: ["ASP.NET Core", "System.Text.Json", "JSON", "Angular", "EF Core", "APIs"]
related:
  - aspnet-core-global-exception-handling
  - ef-core-asnotracking-vs-identity-resolution
  - aspnet-core-api-validation
faq:
  - q: "How do I fix a possible object cycle was detected?"
    a: "Stop returning EF entities. Project to a DTO that does not walk both directions of a navigation. The cycle is the serializer, not the HTTP pipeline."
  - q: "Should I enable ReferenceHandler.Preserve for Angular?"
    a: "Almost never. Preserve emits $id/$ref that Angular HTTP clients do not expect. Shape the DTO instead."
  - q: "Is a JSON cycle the same as EF identity resolution?"
    a: "No. Identity resolution is two CLR objects for one row on a read. A JSON cycle is a graph that loops. Different articles."
---

## Definition

**A possible object cycle was detected** is System.Text.Json telling you the object graph loops — A references B, B references A — or the depth exceeds 32. In ASP.NET Core APIs this almost always means you returned an **EF Core entity** whose navigations point both ways: `Encounter.Patient` and `Patient.Encounters`.

## Analogy

Serializing an EF entity graph is like giving someone directions through a building with a revolving door between two rooms:

```text
Room A (Encounter)  →  door  →  Room B (Patient)
Room B (Patient)    →  door  →  Room A (Encounters[])
                              ↑
                         you are here forever
```

System.Text.Json walks the graph until it recognizes the loop. Angular never asked for the full building tour — it wanted one room's address.

## Routing

**"Possible object cycle was detected" log line** → stay here.

**500 mapping to ProblemDetails** → [global exception handling](/blog/aspnet-core-global-exception-handling).

**400 validation envelopes** → [API validation](/blog/aspnet-core-api-validation).

**Two CLR objects for one row (not a cycle)** → [AsNoTracking vs identity resolution](/blog/ef-core-asnotracking-vs-identity-resolution).

**EF query performance after removing Includes** → [EF Core SQL performance](/blog/ef-core-sql-performance).

**Architecture topic map** → [architecture hub](/learning/architecture).

## Details

### What the exception actually says

```text
System.Text.Json.JsonException: A possible object cycle was detected.
This can either be due to a cycle or if the object depth is larger than
the maximum allowed depth of 32.
```

Two different bugs share that message:

1. **A real cycle** — A → B → A
2. **A tree deeper than 32** — rare unless you nested DTOs by accident

Read the inner exception's path (`$.patient.encounters[0].patient...`). That path is the fix list.

### Why Angular APIs hit this on Friday deploys

The controller looked innocent:

```csharp
[HttpGet("{id:guid}")]
public async Task<Encounter> Get(Guid id, CancellationToken ct) =>
    await _db.Encounters
        .Include(e => e.Patient)
        .ThenInclude(p => p.Encounters)
        .FirstAsync(e => e.Id == id, ct);
```

`Include` made the JSON honest. Demo data had one encounter per patient. Production had twelve. The serializer walked `Encounter → Patient → Encounters → Encounter` and threw.

I see the same shape on marketplace orders (`Order → Seller → Orders`) and fee schedules (`FeeLine → Schedule → Lines`).

### Weak fix: `ReferenceHandler.Preserve`

```csharp
builder.Services.AddControllers()
    .AddJsonOptions(o =>
        o.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.Preserve);
```

This emits `$id` / `$ref` metadata. **Angular `HttpClient` does not rehydrate that into a graph.** Use Preserve only when the **same process** or a client you wrote to understand `$id` is the consumer.

`ReferenceHandler.IgnoreCycles` skips the looping property and returns `null` there. You hide data Angular needed and you still shipped an entity. I treat it as a bandage for a hotfix hour, not a contract.

### Strong fix: stop serializing entities

Project to a DTO the Angular screen actually binds:

```csharp
[HttpGet("{id:guid}")]
public async Task<EncounterDetailDto> Get(Guid id, CancellationToken ct) =>
    await _db.Encounters
        .AsNoTracking()
        .Where(e => e.Id == id)
        .Select(e => new EncounterDetailDto(
            e.Id,
            e.Status,
            e.Patient.FullName,
            e.Patient.ClinicId))
        .FirstAsync(ct);
```

No reverse navigation in the JSON. No cycle. Smaller payload. The SQL can drop the extra `Include` you only added so the serializer would not NRE.

If the screen needs a list of related encounters, return **`EncounterSummaryDto[]`** with ids and dates — not `Patient.Encounters` as full entities.

### Other fixes that are sometimes right

**`[JsonIgnore]` on the reverse navigation** when you must return an entity for a short-lived internal tool:

```csharp
public sealed class Patient
{
    public Guid Id { get; set; }
    [JsonIgnore]
    public ICollection<Encounter> Encounters { get; set; } = [];
}
```

That is a landmine for the next endpoint that *should* list encounters. Prefer DTOs.

**`MaxDepth`** only if you proved the graph is a deep tree, not a cycle.

**Newtonsoft `ReferenceLoopHandling.Ignore`** is the same IgnoreCycles story with a different package.

### How this shows up as a 500 Angular cannot parse

Uncaught `JsonException` in the formatter becomes an unhandled 500. If your exception middleware is correct, Angular gets ProblemDetails with a generic title — **not** the cycle sentence. Developers paste "possible object cycle" from **server logs**, not from the HTTP body.

### Checklist when the log shows a cycle

1. Copy the JSON path from the exception
2. Find the pair of navigations that point at each other
3. Replace the return type with a DTO (or a dedicated list DTO)
4. Remove `Include`s that existed only to fill the entity for JSON
5. Confirm Angular's interface matches the DTO — no leftover `$id`
6. Do not set `ReferenceHandler.Preserve` on the public API "to make it work"

## If an interviewer asks

**"How do you fix 'a possible object cycle was detected' in ASP.NET Core?"**

**Strong answer:** Stop returning EF entities with bidirectional navigations. Project to a DTO that includes only the fields the client needs — no reverse navigation. `ReferenceHandler.Preserve` emits `$id`/`$ref` that Angular does not understand; `IgnoreCycles` hides data. The real fix is shaping the contract. Use `Select` projection so you can also drop unnecessary `Include`s and shrink the SQL.

**Weak answer:** "Enable ReferenceHandler.Preserve globally."

## Related reading

- [ASP.NET Core global exception handling](/blog/aspnet-core-global-exception-handling)
- [API validation and error envelopes](/blog/aspnet-core-api-validation)
- [EF Core AsNoTracking vs identity resolution](/blog/ef-core-asnotracking-vs-identity-resolution)
- [EF Core SQL performance](/blog/ef-core-sql-performance)

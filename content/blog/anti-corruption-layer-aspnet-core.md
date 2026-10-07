---
title: "Anti-Corruption Layer in ASP.NET Core"
description: "An anti-corruption layer in ASP.NET Core translates partner and legacy models at the edge so domain types, errors, and Angular fields stay yours."
date: "2026-10-03"
category: "architecture"
tags: ["ASP.NET Core", "DDD", "Integration", "C#", "Architecture"]
related:
  - mediatr-cqrs-aspnet-core
  - api-design-principles
  - azure-event-grid-aspnet-core
  - aspnet-core-api-validation
faq:
  - q: "What is an anti-corruption layer in ASP.NET Core?"
    a: "It is a module at the edge of your app that translates another system's models into types you own, and translates them back on the way out. Partner DTOs and legacy schemas stop at that module. They do not become your entities."
  - q: "Is an AutoMapper profile an anti-corruption layer?"
    a: "Only if the mapping encodes real decisions: renamed concepts, different enums, dropped fields, and default rules. A profile that copies same-named properties one-to-one is a convenience, and it still lets their model define yours."
  - q: "Where should the anti-corruption layer live?"
    a: "The port (interface returning your types) lives in the application core. The translator and the HTTP client live in infrastructure. Domain projects do not reference partner contracts."
---

**An anti-corruption layer in ASP.NET Core** is the translation boundary between a model you do not control (a payer API, a legacy SOAP service, a partner webhook) and the domain model you do. Their names, enums, and failure codes die in the adapter. The rest of the app sees your language.

```text
Partner HTTP / webhook payload
    v
Infrastructure adapter  (client + translator)
    |  their DTO  -->  your command / value object
    v
Application port  IEligibilityReader
    v
Domain + EF Core entities you designed
    ^
    |  your command  -->  their request DTO
Outbound adapter
```

The metaphor in Evans is political on purpose. The other model is not evil. It is foreign. If you let it annex your entities, every partner release becomes a migration of your database.

**Use-case shape** -> [MediatR and CQRS](/blog/mediatr-cqrs-aspnet-core). **Your own HTTP contracts** -> [API design principles](/blog/api-design-principles). **Inbound events** -> [Event Grid webhooks](/blog/azure-event-grid-aspnet-core).

Search intent for **anti-corruption layer asp.net core** is a how-to: where the code sits, what a translation looks like when the concepts do not match, and how you test the boundary without standing up the partner.

## When does this app need an anti-corruption layer?

Add an anti-corruption layer when a system outside your deploy owns the schema:

- A payer or bank returns status codes that are not your statuses.
- A legacy database uses nullable strings and sentinel dates (`1900-01-01`) for meaning your domain would model as a discriminated union.
- A partner webhook posts its aggregate, and the field names leak into your Angular client if you pass the JSON through.
- You integrate two bounded contexts inside the same company and they already disagree about what "Order" means.

You do not need one for your own `Order` entity mapped to your own `OrderDto` on the way to Angular. That is an API contract. Keep it in the web project. Calling every mapping an anti-corruption layer hides the ones that protect you from a vendor.

You also do not need one as a second copy of a database you fully control. If both sides are yours and released together, a shared kernel or a simple DTO is cheaper. The layer pays for itself when the other side ships on a calendar you do not control.

## Project layout

The port lives in Application. The adapter and vendor DTO live in Infrastructure. The domain project must not reference either Infrastructure or the vendor package.

```text
src/
├── Clinic.Domain/
│   └── Patients/
│       └── PatientId.cs
├── Clinic.Application/
│   └── Eligibility/
│       └── IEligibilityReader.cs          # port — only type other layers import
├── Clinic.Infrastructure/
│   └── Payer/
│       ├── PayerEligibilityAcl.cs         # HttpClient + Translate()
│       └── PayerEligibilityDto.cs         # their JSON shape — never leaves this folder
└── Clinic.Web/
    └── Program.cs                          # AddHttpClient<IEligibilityReader, PayerEligibilityAcl>
```

A second payer becomes `Clinic.Infrastructure/Payer2/Payer2EligibilityAcl.cs` behind the same `IEligibilityReader`. The domain and application projects do not change.

## Shape the port so the domain never sees the partner

> **Watch:** A method that deserializes the partner JSON straight into your entity is a client, not a translation. Their next rename becomes your migration.

```csharp
public enum CoverageState { Active, Terminated, Unknown }

public readonly record struct CoverageDecision(
    CoverageState State,
    DateOnly? EffectiveFrom,
    string PayerReference);

public interface IEligibilityReader
{
    Task<CoverageDecision> GetAsync(PatientId patient, DateOnly asOf, CancellationToken ct);
}
```

`PatientId` and `CoverageDecision` are yours. Nothing in that file is named after the vendor. The application service depends on `IEligibilityReader`. Infrastructure implements it.

```csharp
public sealed class PayerEligibilityAcl : IEligibilityReader
{
    private readonly HttpClient _http;
    private readonly IPayerClock _clock;

    public PayerEligibilityAcl(HttpClient http, IPayerClock clock)
    {
        _http = http;
        _clock = clock;
    }

    public async Task<CoverageDecision> GetAsync(
        PatientId patient, DateOnly asOf, CancellationToken ct)
    {
        using var response = await _http.GetAsync(
            $"/eligibility?member={Uri.EscapeDataString(patient.ExternalMemberNo)}&asOf={asOf:yyyy-MM-dd}",
            ct);

        if (response.StatusCode == HttpStatusCode.NotFound)
            return new CoverageDecision(CoverageState.Unknown, null, "");

        response.EnsureSuccessStatusCode();

        var raw = await response.Content.ReadFromJsonAsync<PayerEligibilityDto>(ct)
            ?? throw new PayerContractException("Empty eligibility body.");

        return Translate(raw, asOf);
    }

    internal static CoverageDecision Translate(PayerEligibilityDto raw, DateOnly asOf)
    {
        var state = raw.StatusCode switch
        {
            "A1" => CoverageState.Active,
            "T9" => CoverageState.Terminated,
            "P0" => CoverageState.Unknown,
            _ => CoverageState.Unknown
        };

        DateOnly? from = raw.EffectiveOn is { Length: > 0 } text
            && DateOnly.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)
            ? parsed
            : null;

        if (state == CoverageState.Active && from is { } start && start > asOf)
            state = CoverageState.Unknown;

        return new CoverageDecision(state, from, raw.TraceId ?? "");
    }
}

sealed record PayerEligibilityDto(string? StatusCode, string? EffectiveOn, string? TraceId);
```

`Translate` is `internal` so a test project can hit it without HTTP. The vendor DTO is `sealed` and file-local, or lives in an `Infrastructure/Payer` folder that the domain project does not reference. `PayerContractException` is how a shape you do not understand surfaces. Do not let `JsonException` bubble as a 500 with the vendor body attached; catch it at the adapter and throw your exception with the trace id only.

The rules in `Translate` are the layer. `A1` means active only in this payer's book. The next payer gets a different adapter behind the same `IEligibilityReader`, not an `if (payer == ...)` in the domain.

Register it explicitly:

```csharp
builder.Services.AddHttpClient<IEligibilityReader, PayerEligibilityAcl>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Payer:BaseUrl"]!);
    client.Timeout = TimeSpan.FromSeconds(5);
});
```

Timeouts belong on the adapter's client. A domain service should not know that this particular partner falls over after five seconds. Polly policies (retry on 502, circuit break) also belong here, because retrying a non-idempotent charge is a translation of *their* HTTP semantics, not a domain rule. Read their docs before you retry POST.

## Translate an inbound webhook before it touches an entity

> **Watch:** Translate in one place. A second copy of the status map in the controller and the handler will drift.

A partner posts *their* order-updated event. Your controller or minimal API should not bind that JSON onto an EF entity.

```csharp
public sealed record PartnerOrderWebhook(string OrderRef, string State, decimal Amount, string Currency);

public interface IPartnerOrderTranslator
{
    OrderUpdate Translate(PartnerOrderWebhook inbound);
}

public OrderUpdate Translate(PartnerOrderWebhook inbound)
{
    if (!PartnerRefs.TryParse(inbound.OrderRef, out var id))
        throw new PayerContractException("Unreadable order ref.");

    var status = inbound.State switch
    {
        "CMP" => OrderStatus.Fulfilled,
        "CXL" => OrderStatus.Cancelled,
        "HLD" => OrderStatus.OnHold,
        _ => throw new PayerContractException("Unknown partner state.")
    };

    var money = new Money(inbound.Amount, CurrencyCode.Parse(inbound.Currency));
    return new OrderUpdate(id, status, money);
}
```

Unknown states throw into a dead-letter path, not into `OrderStatus.Fulfilled` by default. A new code you have never seen is not success. Persist the raw payload (access-controlled, retention-limited) only if you need to replay after you learn the code. Do not persist it onto the aggregate "just in case."

Map their primary key to yours in a table you own (`PartnerOrderLink`: partner name, their id, your `OrderId`). Using their id as your clustered key couples every URL in the Angular app to a vendor identifier, and it breaks the day you add a second partner whose ids collide.

Outbound is the mirror. Your `PlacePartnerOrder` command becomes their request in one method. If they want major units and you store minor units, the conversion happens in the adapter with an explicit scale, not in the entity's `ToString()`.

## Map partner errors into your own results

> **Watch:** Catch the vendor exception inside the adapter. Logging the raw eligibility payload ships data you should not send to a log vendor.

| Their signal | Your result | Do not |
|---|---|---|
| 404 on eligibility | `CoverageState.Unknown` | 500 the user's page |
| 409 duplicate reference | Your `Conflict` with your idempotency key | Leak their error JSON to Angular |
| 422 with field `mbr_id` | Your validation problem on `memberNumber` | Forward their field names into [ProblemDetails](/blog/aspnet-core-api-validation) |
| Timeout | A typed `PartnerUnavailable` the UI can retry | Catch `Exception` and pretend the member has no coverage |

Leaking their field names trains your SPA to speak their schema. Six months later you cannot swap payers because the Angular form binds `mbr_id`.

## What should the rest of the app never share?

- **Enums.** Their `StatusCode` string stays in the adapter. Your enum has the cases you support.
- **EF configurations.** Do not scaffold entities from their OpenAPI and then `Add-Migration` that scaffold into your database. You just imported their model as your persistence model.
- **Partial classes to "extend" generated clients.** Generated clients are infrastructure. The port is the only type other projects see.
- **Time and money without a rule.** Convert offsets at the edge to `DateTimeOffset` or `DateOnly` in a named zone. Do not store their local timestamp as `datetime` and hope the server is in the same zone. The box this portfolio is written on is UTC+5; a partner in UTC will not match "local" on your laptop either. Be explicit.

A mapping table in code, reviewed in PRs, beats a reflective mapper for this boundary. If a vendor adds a JSON property, you want the translator to keep compiling and a contract test to fail because you did not classify the new status. Silent binding of extra properties is fine. Silent acceptance of a new *status* is not.

## What makes the layer a pass-through?

- **Pass-through ACL.** Methods that `return await _client.GetFromJsonAsync<YourEntity>()` are a client, not a translation. If the JSON shape matches your entity, you have already lost; their next rename is your migration.
- **Two-way sync without an owner.** If both systems can change "status," the layer needs a rule for which write wins. Translation does not solve concurrency. An outbox and a partner cursor do.
- **Translating in the controller and again in the handler.** One place owns `A1 -> Active`. A second copy will drift.
- **Logging the raw payload at information.** Eligibility responses are full of data you should not ship to a log vendor. Log the partner trace id and your correlation id.
- **Letting the generated client exception type leak into application code.** Catch it in the adapter. Otherwise every handler grows a reference to the vendor package.
- **Building the layer "for later" with no foreign system.** You get ceremony and an interface that mirrors the entity. Add it when the foreign model shows up.
- **Sharing the adapter's `HttpClient` handlers with unrelated APIs** so a partner's retry policy retries your own POST /orders.

## How do you verify the partner model stayed in one folder?

1. A contract test feeds a checked-in JSON fixture (no secrets, synthetic member ids) through `Translate` and asserts `A1` becomes `Active`, `T9` becomes `Terminated`, and `ZZ` becomes `Unknown` or throws, whichever you documented.
2. An architecture test fails the build if the domain or application project references the partner client namespace. A namespace scan in a unit test is enough; you do not need a heavy architecture product to start.

```csharp
[Fact]
public void Application_does_not_reference_the_partner_package()
{
    var names = typeof(IEligibilityReader).Assembly
        .GetReferencedAssemblies()
        .Select(a => a.Name)
        .ToArray();

    Assert.DoesNotContain(names, name =>
        name is not null && name.Contains("Payer", StringComparison.Ordinal));
}
```

Swap `Payer` for the package name you actually generated. The test belongs in the application test project, which references the port, not the HTTP adapter.
3. The Angular network panel for your API shows your field names only. Search the web project for the vendor's JSON names; the only hits should be inside the adapter.
4. A 404 from the partner fixture returns your `Unknown` decision and a 200 (or a typed problem you chose), not an unhandled exception.
5. A second partner can implement `IEligibilityReader` without editing the domain project. If it cannot, the port is still shaped like the first vendor.

The layer is working when a partner release notes email changes one folder, one fixture, and no Angular form.


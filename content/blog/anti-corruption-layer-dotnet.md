---
title: "Anti-Corruption Layer in .NET: Protecting Your Domain"
description: "Implement the Anti-Corruption Layer pattern in .NET to translate between bounded contexts and wrap legacy APIs. C# examples for healthcare integrations."
date: "2026-10-07"
category: "architecture"
tags: ["Anti-Corruption Layer", "DDD", ".NET", "Bounded Contexts", "Integration", "Domain-Driven Design"]
---

## Why Use the Anti-Corruption Layer

Without an ACL, integrating with an external API or a legacy system forces you to use their data model directly. Legacy models accumulate 20 years of decisions — cryptic field names, overloaded status codes, nullable fields that should not be, missing domain concepts. If these leak into your domain model, your clean code becomes polluted with legacy concerns.

The ACL solves this by creating a translation boundary: the legacy model exists only in the infrastructure layer, converted to your domain model before it crosses into the domain.

---

## Project Structure

```
src/
  Patients/                        ← Patients bounded context
    Domain/
      Patient.cs                   ← Your clean domain entity
      CustomerId.cs                ← Your value objects
      PatientRepository.cs         ← Interface (domain layer)
    Application/
      GetPatientQueryHandler.cs
    Infrastructure/
      Persistence/
        EfCorePatientRepository.cs
      LegacyCrm/
        LegacyCrmClient.cs         ← Wraps legacy HTTP calls
        LegacyCrmAcl.cs            ← Anti-Corruption Layer translation
        LegacyCrmModels.cs         ← Legacy model types (contained here only)
```

The legacy models and the ACL live inside `Infrastructure/LegacyCrm`. They never appear in `Domain/` or `Application/`. The rest of the codebase only knows the clean domain model.

---

## Basic ACL Implementation

```csharp
// Legacy CRM model — messy, legacy naming, nullable fields everywhere
public class LegacyCrmContact
{
    public string? CNTCT_ID { get; set; }        // Cryptic field names
    public string? FRST_NM { get; set; }
    public string? LAST_NM { get; set; }
    public string? EMAIL_ADDR { get; set; }
    public string? CUST_CATEG { get; set; }      // "PREM", "STD", "INACT"
    public int? ACCT_STATUS { get; set; }         // 1=active, 2=suspended, 0=unknown
}

// Your clean domain model
public class Patient : Entity
{
    public PatientId Id { get; private set; }
    public PersonName FullName { get; private set; }
    public EmailAddress Email { get; private set; }
    public PatientTier Tier { get; private set; }
    public AccountStatus Status { get; private set; }
}

// Anti-Corruption Layer — translates legacy to domain
public class LegacyCrmAcl : IPatientRepository
{
    private readonly LegacyCrmClient _client;
    private readonly ILogger<LegacyCrmAcl> _logger;
    
    public async Task<Patient?> GetByIdAsync(PatientId patientId, CancellationToken ct)
    {
        LegacyCrmContact? contact;
        try
        {
            contact = await _client.GetContactAsync(patientId.Value, ct);
        }
        catch (LegacyCrmException ex)
        {
            _logger.LogError(ex, "Legacy CRM lookup failed for patient {PatientId}", patientId);
            throw new DomainException($"Patient lookup unavailable: {ex.Message}");
        }
        
        if (contact == null) return null;
        
        return Translate(contact);
    }
    
    // All translation logic in one place — the domain never sees legacy fields
    private Patient Translate(LegacyCrmContact contact)
    {
        return new Patient(
            id: PatientId.From(contact.CNTCT_ID!),
            fullName: new PersonName(
                firstName: contact.FRST_NM ?? throw new InvalidDataException("Missing FRST_NM"),
                lastName: contact.LAST_NM ?? throw new InvalidDataException("Missing LAST_NM")),
            email: EmailAddress.From(contact.EMAIL_ADDR ?? string.Empty),
            tier: TranslateTier(contact.CUST_CATEG),
            status: TranslateStatus(contact.ACCT_STATUS));
    }
    
    private static PatientTier TranslateTier(string? category) => category switch
    {
        "PREM" => PatientTier.Premium,
        "STD" => PatientTier.Standard,
        "INACT" => PatientTier.Inactive,
        _ => PatientTier.Standard
    };
    
    private static AccountStatus TranslateStatus(int? status) => status switch
    {
        1 => AccountStatus.Active,
        2 => AccountStatus.Suspended,
        _ => AccountStatus.Unknown
    };
}
```

---

## ACL for Downstream Publishing: Event Translation

The ACL pattern applies in both directions. When publishing events to a legacy system or external consumer, translate your domain events into their expected format:

```csharp
// Your domain event (clean)
public record PatientRegisteredEvent(
    PatientId PatientId,
    PersonName Name,
    EmailAddress Email) : DomainEvent;

// External system's expected format (legacy)
public class LegacyPatientCreatedDto
{
    public string? PatientRef { get; set; }
    public string? DisplayName { get; set; }
    public string? ContactEmail { get; set; }
    public string? SystemSource { get; set; } = "NEW_PORTAL";
}

// ACL handles outbound translation
public class PatientRegisteredOutboundAcl 
    : INotificationHandler<PatientRegisteredEvent>
{
    private readonly ILegacyPatientSyncClient _sync;
    
    public async Task Handle(PatientRegisteredEvent notification, CancellationToken ct)
    {
        var legacyDto = new LegacyPatientCreatedDto
        {
            PatientRef = notification.PatientId.Value,
            DisplayName = notification.Name.FullName,
            ContactEmail = notification.Email.Value,
            SystemSource = "NEW_PORTAL"
        };
        
        await _sync.CreatePatientAsync(legacyDto, ct);
    }
}
```

---

## ACL for Third-Party APIs

The same pattern applies when integrating with third-party SaaS APIs:

```csharp
// Third-party SMS provider (Twilio-style)
public class TwilioSmsSender : ISmsSender
{
    private readonly TwilioRestClient _twilio;
    
    // ISmsSender is YOUR interface — domain doesn't know Twilio exists
    public async Task SendAsync(PhoneNumber to, string message, CancellationToken ct)
    {
        try
        {
            var result = await MessageResource.CreateAsync(
                to: new Twilio.Types.PhoneNumber(to.E164Format),
                from: new Twilio.Types.PhoneNumber(_configuration["Twilio:From"]),
                body: message,
                client: _twilio);
            
            if (result.Status == MessageResource.StatusEnum.Failed)
                throw new SmsSendException($"Twilio send failed: {result.ErrorMessage}");
        }
        catch (TwilioRestException ex)
        {
            // Translate Twilio exception to domain exception
            throw new SmsSendException($"SMS provider error: {ex.Message}", ex);
        }
    }
}
```

Your domain code calls `ISmsSender.SendAsync(...)`. It has no knowledge that Twilio exists. Switching providers means replacing the infrastructure class, not touching the domain.

---

## When to Use the Anti-Corruption Layer

- Integrating with a legacy system whose model conflicts with your domain model
- Integrating with a third-party API where you want to avoid vendor lock-in in your domain
- When two bounded contexts have conflicting models for the same concept (Customer vs Patient)
- When an upstream system's model is verbose, inconsistent, or poorly named

## When NOT to Use the ACL

- Integrating with a well-designed API whose model aligns naturally with yours (no translation needed)
- Internal service calls within the same bounded context (use a shared interface directly)
- Simple pass-through integrations where adding a translation layer adds complexity without value

## Trade-offs

| Benefit | Cost / Risk |
|---|---|
| Domain model stays clean — no legacy concepts leak in | Extra translation code to write and maintain |
| Provider swaps (Twilio → AWS SNS) are isolated to the ACL | ACL can become a dumping ground if not carefully designed |
| Translation errors are caught in one place | ACL must handle differences in error models and failure modes |
| Domain is testable without the external system | ACL itself needs integration tests with the external system |

---

## If an Interviewer Asks...

**"How do you prevent a legacy system from polluting your domain model?"**

I create an Anti-Corruption Layer in the infrastructure layer — a translation class that wraps all calls to the legacy system and converts between the legacy model and my clean domain model. The key is that legacy types (the messy DTOs with cryptic field names) never appear outside the infrastructure layer. The domain only knows its own model. This means if we switch legacy providers, or if the legacy model changes, only the ACL needs to change — no domain code is affected.

---
title: "Serilog PII Redaction for Healthcare ASP.NET Core APIs"
description: "How I log ASP.NET Core healthcare APIs with Serilog without putting names, member ids, or raw X12 in Application Insights — destructuring, request logging, and what still belongs in an audit table."
date: "2026-08-17"
category: "edi"
tags: ["Serilog", "Logging", "Healthcare", "EDI", "ASP.NET Core"]
---

The first production incident on a claims API is often not the parse. It is a support engineer pasting a log line that contains a member name into a ticket that is visible to a vendor. Serilog did what it was told: `{@request}`.

This article is **logging architecture** for ASP.NET Core APIs that touch healthcare or EDI. It is not a HIPAA certification, not clinical advice, and not a promise that a NuGet package makes you compliant. Compliance is organizational: contracts, access control, retention, BAAs. I am describing how I keep **application logs** from becoming a second copy of the chart.

For X12 intake shape, see [EDI parsers in C#](/blog/edi-x12-parser-csharp-dotnet). Do not log the payload that article tells you to store in a blob.

## What I treat as unsafe in logs

I treat these as **not for Serilog sinks** that developers, App Insights, and Seq share:

- Names, addresses, phone, email of patients or members
- Member ids, account numbers, SSNs, national identifiers
- Clinical or financial line text from X12 / claim bodies
- Access tokens, refresh tokens, cookie headers
- Raw request bodies on intake endpoints

I **do** log:

- File id, byte length, interchange control number, `ST01`, duration, result counts
- Clinic id / tenant id that is already an authorization key (product-dependent — some tenants are identifying; agree with privacy)
- `traceId` / `Activity.Id` so Angular can show a support code
- Exception **type** and a sanitized message

If the privacy officer would not put it in Slack, it does not go to the default logger.

## Default Serilog that does not dump objects

```csharp
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .Destructure.ToMaximumDepth(3)
    .Destructure.ToMaximumStringLength(256)
    .Destructure.ToMaximumCollectionCount(16)
    .Filter.ByExcluding(Matching.FromSource("Microsoft.AspNetCore.Diagnostics"))
    .WriteTo.ApplicationInsights(telemetry, TelemetryConverter.Traces)
    .CreateLogger();
```

Depth and string caps are seatbelts, not redaction. A 2 MB X12 in a string property will still try to serialize until you stop passing it.

The real rule: **do not pass domain entities or HTTP bodies as `{@obj}`**.

```csharp
// Wrong
_log.LogInformation("Intake {Payload}", rawX12);

// Wrong in a different way
_log.LogInformation("Intake {@File}", ediFile);

// Right
_log.LogInformation(
    "Intake accepted {FileId} bytes {ByteLength} st01 {Transaction} isa {IsaControl}",
    file.Id,
    file.ByteLength,
    file.St01,
    file.IsaControlNumber);
```

Scalar properties only. Named templates so Seq/App Insights are queryable without regexing a paragraph.

## Request logging without bodies

ASP.NET Core request logging and some middleware will capture bodies if you let them. I disable body logging on intake routes.

```csharp
app.UseSerilogRequestLogging(options =>
{
    options.EnrichDiagnosticContext = (diag, http) =>
    {
        diag.Set("TraceId", http.TraceIdentifier);
        diag.Set("Route", http.GetEndpoint()?.DisplayName);
        diag.Set("StatusCode", http.Response.StatusCode);
    };
    options.GetLevel = (http, elapsed, ex) =>
        ex is not null || http.Response.StatusCode >= 500
            ? LogEventLevel.Error
            : LogEventLevel.Information;
});
```

I do **not** add `RequestBody` to the diagnostic context. For JSON APIs that are not EDI, I still prefer explicit action logs (`Claim {ClaimId} status changed`) over dumping the PUT body.

If you use `UseHttpLogging()`, turn off `HttpLoggingFields.RequestBody` and `ResponseBody` in production. The first time someone posts a clinical note, you will regret the default.

## Redaction when a property slips through

Destructuring policies catch types you forgot:

```csharp
public sealed class MaskMemberIdPolicy : IDestructuringPolicy
{
    public bool TryDestructure(object value, ILogEventPropertyValueFactory factory, out LogEventPropertyValue result)
    {
        if (value is MemberId member)
        {
            result = factory.CreatePropertyValue(member.ToRedacted());
            return true;
        }

        result = null!;
        return false;
    }
}

// MemberId.ToRedacted() => "***" or last-4 if policy allows
```

Register: `.Destructure.With<MaskMemberIdPolicy>()`.

This is defense in depth. The primary control is **not logging the type**. Policies fail when someone logs `string memberId`. Prefer a dedicated value object so a stringly-typed id is harder to pass by accident.

Headers: a middleware that copies `Authorization` into logs will undo everything. Redact known header names:

```csharp
static string RedactHeader(string name, string value) =>
    name.Equals("Authorization", StringComparison.OrdinalIgnoreCase)
    || name.Equals("Cookie", StringComparison.OrdinalIgnoreCase)
        ? "***"
        : value;
```

## Exceptions

`LogError(ex, "Worker failed for {FileId}", fileId)` — the exception message and stack are usually OK. **Data on the exception** is not. Do not put X12 in `ex.Data`. Do not use `throw new ParseException(rawSegment)`.

I wrap parse failures:

```csharp
throw new EdiParseException(
    fileId,
    "Structural error at interchange; see audit row",
    inner);
```

The inner exception stays in the server; the log line is the file id. The original bytes stay in blob storage with an ACL and an audit download.

## Audit vs log

**Logs** are for operators: is the worker alive, how long, which file id failed. Retention is short. Access is broad (devs, App Insights).

**Audit** is for “who viewed the original file”: SQL row, user id, timestamp, purpose. Retention follows the records policy. Access is narrow.

Do not use Serilog as the audit trail for PHI access. Sinks get copied. Queries get exported. That is the wrong database.

## Angular and trace ids

Return `traceId` on [ProblemDetails](/blog/aspnet-core-api-validation). The SPA shows it on 500s. Support searches App Insights for that id. They should find **file id and duration**, not a member name.

If your 500 handler logs `exception.ToString()` plus the request DTO, fix the handler before you buy a redaction package.

## EDI-specific

From the X12 worker:

- Log: file id, ST01, interchange counts, parse duration, issue **codes** (`MissingSE`, `UnknownSt01`)
- Do not log: segment text, `NM1` names, claim charge amounts in free text
- Poison queue messages carry **file id**, not payload

If a trading partner needs a copy of a failing interchange, they get it through the **controlled download**, not a log export.

## Checklist before the first PHI-adjacent deploy

- [ ] No `{@entity}` / request body in Information logs
- [ ] HttpLogging / request logging bodies off in Production
- [ ] Authorization and Cookie headers redacted
- [ ] EDI worker logs file metadata only
- [ ] Exceptions do not embed payloads
- [ ] App Insights sampling does not change the rule (sampled PHI is still PHI)
- [ ] A second person greps the sink for `@gmail.` and `ISA*` on a staging replay with **synthetic** data

Synthetic fixtures in tests should look fake on purpose (`MEMBER-0001`, `ISA*00*...` with obviously fake names) so a leaked test log is still embarrassing, not reportable.

---

If you need a logging and intake design that keeps X12 and claim data out of developer sinks, [contact me](/contact). Bring a redacted log sample from staging; we will treat anything that looks like a person as a defect.

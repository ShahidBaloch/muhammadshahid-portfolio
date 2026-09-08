---
title: "Healthcare EDI on .NET"
---

## Introduction

**Healthcare EDI (X12)** on .NET is about **moving eligibility, claims, and remittance files** through validate → parse → map → persist → acknowledge — without logging PHI into the wrong sink. This hub is architecture for **ASP.NET Core intake**, not a vendor product pitch or compliance certificate.

## What X12 is (in one paragraph)

X12 is a **batch file format** with envelopes (ISA/GS/ST), segments, and element delimiters. An **837** is a professional claim; **835** is payment/remittance; **270/271** is eligibility. Your code must handle **rejects, partial files, and duplicate control numbers** — not only happy-path samples.

## Real-world analogy

EDI intake is **airport baggage handling**:

- **Envelope** — flight tag (ISA/GS) routing which carrier handles the bag.
- **Transaction set** — individual suitcase (ST segment) with claim inside.
- **997/999** — receipt that says “we got it” or “line 42 failed schema.”

Dropping a bag on the wrong carousel (wrong tenant map) is worse than a parse error — it is a **compliance incident**.

## Pipeline layers (vendor-neutral)

```text
File drop / SFTP / API upload
  → virus scan / size limits
  → parse segments (streaming, not load 2GB string)
  → validate against companion guide / SNIP level
  → map to domain model
  → idempotent persist (control number key)
  → queue downstream (adjudication, ERP)
  → ACK / 997 generation
```

## What not to log

Member IDs, diagnoses, and full segment payloads belong in **restricted stores** — not default Serilog sinks copied to Slack. Redact or hash identifiers in developer logs.

## Cross-questions

1. **Parse in API request thread?** — No; stream to queue/worker; API returns 202.
2. **Idempotency key?** — Interchange control number + transaction set control.
3. **Angular’s role?** — Exception UI and ops dashboards — not parsing X12 in the browser.

## Deep-dive articles

| Topic | Article |
|---|---|
| Parser architecture | [X12 parser C# .NET](/blog/edi-x12-parser-csharp-dotnet) |
| PHI-safe logging | [Serilog PII redaction](/blog/serilog-pii-redaction-healthcare-aspnet-core) |

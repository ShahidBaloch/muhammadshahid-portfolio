---
title: "OpenTelemetry in ASP.NET Core: Traces, Metrics, and Logs"
description: "OpenTelemetry in ASP.NET Core — traces, metrics, logs, ActivitySource, OTLP export, W3C traceparent, and sampling strategies."
date: "2026-10-01"
category: "architecture"
tags: ["OpenTelemetry", "ASP.NET Core", "Observability", "Tracing", "C#"]
related:
  - aspnet-core-correlation-id
  - serilog-pii-redaction-healthcare-aspnet-core
  - aspnet-core-health-checks
faq:
  - q: "How do I add OpenTelemetry to ASP.NET Core?"
    a: "Install OpenTelemetry.Extensions.Hosting plus instrumentation packages, register tracing/metrics/logging in Program.cs, and export via OTLP (or your backend’s exporter). Instrument ASP.NET Core and HttpClient first, then add custom ActivitySource spans."
  - q: "Is a correlation ID the same as a trace id?"
    a: "Not exactly. A correlation ID is often an app-generated request id. W3C traceparent carries trace-id and parent-id for distributed traces. You can bridge them, but OpenTelemetry’s trace id is the modern cross-service join key."
  - q: "Does OpenTelemetry replace Serilog PII redaction?"
    a: "No. OTel ships telemetry; Serilog (or similar) still needs redaction so PHI never leaves the process. See the Serilog PII post for healthcare logging habits."
---

**OpenTelemetry in ASP.NET Core** wires traces, metrics, and logs through one SDK so an Angular-facing API can follow a request across Kestrel, EF, and outbound HttpClient — and relate that work to the `traceId` you already show in ProblemDetails.

```text
Angular request (traceparent optional)
        │
        ▼
ASP.NET Core instrumentation (server span)
        ├─ custom ActivitySource (domain)
        ├─ HttpClient client spans
        └─ logs with TraceId/SpanId
        │
        ▼
OTLP exporter → collector / App Insights / vendor
```

**New to this** → stay here. **Request id habit** → [correlation IDs](/blog/aspnet-core-correlation-id). **PHI-safe logging** → [Serilog PII redaction](/blog/serilog-pii-redaction-healthcare-aspnet-core).

Search intent for **opentelemetry asp.net core** is how-to SDK setup — not a vendor bake-off and not invented pricing.

## Correlation ID vs W3C traceparent

| Concept | Typical header | Role |
|---|---|---|
| Correlation / request id | `X-Correlation-ID` | App-level join; easy to show in UI |
| W3C Trace Context | `traceparent` | Standard distributed trace id + parent span |

I keep both in production APIs:

- Generate or accept correlation id for support dialogs ([how to create it](/blog/aspnet-core-correlation-id))  
- Let OpenTelemetry manage `Activity.Current` and `traceparent` propagation  
- Put `traceId` (hex) on ProblemDetails extensions so Angular can show “give support this id”  

Do not invent a third id format per microservice.

## Add OpenTelemetry.Extensions.Hosting and ASP.NET Core instrumentation

Packages (versions evolve — use current stable for your .NET TFM):

- `OpenTelemetry.Extensions.Hosting`  
- `OpenTelemetry.Instrumentation.AspNetCore`  
- `OpenTelemetry.Instrumentation.Http`  
- `OpenTelemetry.Exporter.OpenTelemetryProtocol`  
- Optional: `OpenTelemetry.Instrumentation.EntityFrameworkCore`, runtime instrumentation  

`Program.cs`:

```csharp
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenTelemetry()
    .ConfigureResource(r => r.AddService(
        serviceName: "clinic-api",
        serviceVersion: typeof(Program).Assembly.GetName().Version?.ToString() ?? "0.0.0"))
    .WithTracing(t => t
        .AddSource("Clinic.Domain") // custom ActivitySource name
        .AddAspNetCoreInstrumentation(o =>
        {
            o.Filter = ctx => !ctx.Request.Path.StartsWithSegments("/health");
            o.RecordException = true;
        })
        .AddHttpClientInstrumentation()
        .AddOtlpExporter())
    .WithMetrics(m => m
        .AddMeter("Clinic.Api")
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddRuntimeInstrumentation()
        .AddOtlpExporter());

builder.Logging.AddOpenTelemetry(o =>
{
    o.IncludeFormattedMessage = true;
    o.IncludeScopes = true;
    o.ParseStateValues = true;
});
```

Point `OTEL_EXPORTER_OTLP_ENDPOINT` at a local collector or your platform’s intake. Prefer env/config over hard-coding endpoints.

Filter `/health` and noisy static paths so liveness probes do not drown traces ([health checks](/blog/aspnet-core-health-checks)).

## Custom ActivitySource spans for domain operations

```csharp
public static class ClinicTelemetry
{
    public static readonly ActivitySource Domain = new("Clinic.Domain");
}

public sealed class EncounterService
{
    public async Task<Encounter> CloseAsync(Guid id, CancellationToken ct)
    {
        using var activity = ClinicTelemetry.Domain.StartActivity("Encounter.Close");
        activity?.SetTag("encounter.id", id.ToString());

        try
        {
            // domain work...
            activity?.SetStatus(ActivityStatusCode.Ok);
            return encounter;
        }
        catch (Exception ex)
        {
            activity?.SetStatus(ActivityStatusCode.Error, ex.Message);
            activity?.AddException(ex);
            throw;
        }
    }
}
```

Tag carefully: ids and tenant codes are useful; names, member ids, and free-text clinical notes are PHI — do not put them on spans that export off-box without a data classification review. Same discipline as Serilog redaction.

## Meters for API business counters

```csharp
public sealed class BookingMetrics
{
    private readonly Counter<long> _bookings;

    public BookingMetrics(IMeterFactory factory)
    {
        var meter = factory.Create("Clinic.Api");
        _bookings = meter.CreateCounter<long>("clinic.bookings.completed");
    }

    public void BookingCompleted(string clinicId) =>
        _bookings.Add(1, new KeyValuePair<string, object?>("clinic.id", clinicId));
}
```

Register as singleton. Avoid unbounded label cardinality (`userId` on every counter). Prefer low-cardinality dimensions: clinic tier, result code, endpoint group.

## Logs correlation and exporters (OTLP overview)

With OpenTelemetry logging + a provider that includes trace context, log lines carry `TraceId`/`SpanId`. In Serilog you can enrich from `Activity.Current` so Application Insights / SEQ / Loki can join on the same ids.

Still apply PII redaction at the logger ([Serilog PII](/blog/serilog-pii-redaction-healthcare-aspnet-core)). OTel does not absolve you from HIPAA-minded logging.

Outbound HttpClient automatically becomes client spans when instrumentation is on — another reason to use [IHttpClientFactory](/blog/ihttpclientfactory-aspnet-core) instead of `new HttpClient()`.

## Sampling basics and cardinality hazards

**Sampling** drops a percentage of traces to control cost/volume:

- Head-based sampling at the SDK (e.g., `ParentBased` + `TraceIdRatioBased`)  
- Or collector-side sampling/tail sampling for smarter keep rules  

Start with recording everything in non-prod. In prod, sample high-traffic successful GETs more aggressively; keep errors and slow traces.

**Cardinality hazards:**

- Span names with raw URLs including ids (`/patients/4882`) — prefer route templates  
- Metric labels with user ids or full paths  
- Logging entire request bodies “into the trace”  

ASP.NET Core instrumentation can use the route template as the span name when routing completes — verify in your collector UI.

## Verify with a local collector or App Insights exporter

Local path:

1. Run an OpenTelemetry Collector (or Jaeger all-in-one) with OTLP receivers  
2. Set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317` (or HTTP 4318)  
3. Hit an API endpoint; confirm a server span + child HttpClient/EF spans  
4. Force an exception; confirm status=Error and log correlation  

Azure Monitor / Application Insights has an OTel-distro path — use the current Microsoft docs for package names. This post stays exporter-agnostic on purpose.

## Checklist for production rollout

1. Service name/version resource attributes set  
2. ASP.NET Core + HttpClient instrumentation enabled  
3. Health endpoints filtered from traces  
4. Custom `ActivitySource` registered via `AddSource`  
5. OTLP endpoint and auth configured via env/Key Vault — not source  
6. Sampling policy documented  
7. PII policy applied to tags and logs  
8. ProblemDetails returns a trace id support can search  
9. Dashboards: error rate, P95 latency, dependency failure  
10. Alert on export failures (silent telemetry loss)  

## Common mistakes I still see

1. **Adding OTel packages but forgetting `AddSource` for custom activities** — domain spans vanish  
2. **Using correlation middleware only** and calling it “distributed tracing”  
3. **High-cardinality labels** blowing metric backends  
4. **Exporting PHI in span attributes** for “better debugging”  
5. **Instrumenting then never verifying** in a collector before prod  

## Verification

- One browser call shows one trace with server + outbound client spans  
- Log line for that request contains the same TraceId as ProblemDetails  
- `/health` traffic absent (or rare) in trace viewers  
- Custom `Encounter.Close` span appears under the request  
- Turning off the collector does not crash the API (export failures isolated)  

## If an interviewer asks

How do you implement OpenTelemetry in ASP.NET Core?

**Strong answer:** Hosting extensions for traces/metrics/logs, ASP.NET Core and HttpClient instrumentation, custom ActivitySource for domain ops, OTLP export, careful sampling and cardinality. Bridge support UX with trace ids; keep Serilog PII redaction. Correlation IDs complement — they do not replace — W3C trace context.

**Related:** [Correlation IDs](/blog/aspnet-core-correlation-id) · [Serilog PII redaction](/blog/serilog-pii-redaction-healthcare-aspnet-core) · [Health checks](/blog/aspnet-core-health-checks) · [IHttpClientFactory](/blog/ihttpclientfactory-aspnet-core)


## Program.cs registration with configuration binding

```csharp
builder.Services.AddOpenTelemetry()
    .ConfigureResource(r => r
        .AddService("clinic-api")
        .AddAttributes(new Dictionary<string, object>
        {
            ["deployment.environment"] = builder.Environment.EnvironmentName
        }))
    .WithTracing(t =>
    {
        t.AddSource("Clinic.Domain");
        t.AddAspNetCoreInstrumentation();
        t.AddHttpClientInstrumentation();
        if (builder.Configuration.GetValue("OpenTelemetry:EnableEf", false))
        {
            t.AddEntityFrameworkCoreInstrumentation();
        }
        t.AddOtlpExporter();
    });
```

Feature-flag heavy EF instrumentation if SQL span volume is painful in shared collectors.

## Bridging ProblemDetails traceId

```csharp
public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception ex, CancellationToken ct)
{
    var problem = new ProblemDetails { Status = 500, Title = "Unexpected error" };
    problem.Extensions["traceId"] = Activity.Current?.Id ?? httpContext.TraceIdentifier;
    // write problem...
    return true;
}
```

Support searches the backend with that value. Align with [global exception handling](/blog/aspnet-core-global-exception-handling).

## Propagation to Angular and beyond

Browsers do not need to invent `traceparent` for first-party APIs in many setups — the server creates the root span. For BFF → API → Functions chains, ensure each hop uses HttpClient instrumentation so parent/child links survive.

If you front with APIM or YARP, confirm those gateways forward or create W3C headers rather than dropping them.

## Exemplars: connecting metrics to traces

When your metrics backend supports exemplars, a spike in `http.server.request.duration` can jump to an example trace. Even without exemplars, log the trace id on slow request warnings:

```csharp
if (elapsedMs > 2000)
{
    _logger.LogWarning("Slow request {Method} {Path} took {Elapsed}ms", method, path, elapsedMs);
}
```

With OTel log correlation, that warning sits on the trace.

## Security and tenancy dimensions

Useful low-cardinality tags:

- `tenant.tier` (free/pro)  
- `auth.mode` (jwt/bff)  
- `http.route` template  

Avoid:

- `tenant.id` on high-volume metrics if you have thousands of tenants (use traces/logs instead)  
- Raw patient identifiers anywhere in export  

## Rollout plan for an existing API

Week 1: traces + HttpClient, export to collector in staging  
Week 2: dashboards for P95 and error rate; filter health  
Week 3: custom domain spans on critical flows (booking, claim submit)  
Week 4: sampling policy + prod export; document on-call search steps  

Do not enable every instrumentation package on day one in a busy prod cluster.

## Extra pitfalls

1. **Forgetting resource `service.name`** — everything looks like `unknown_service`  
2. **OTLP endpoint TLS mismatch** in prod  
3. **Duplicate instrumentation** registered twice → double spans  
4. **Using activity tags for huge payloads**  

## Extra verification

- Two services show parent/child on one trace after HttpClient call  
- Sampling: 1.0 in staging, ratio in prod, still keeps error traces if using parent-based policies appropriately  
- Angular support dialog id finds the ASP.NET Core request in your backend within one minute during a drill  


## Minimal custom middleware for business context

```csharp
app.Use(async (ctx, next) =>
{
    var activity = Activity.Current;
    if (activity is not null && ctx.User.Identity?.IsAuthenticated == true)
    {
        var clinic = ctx.User.FindFirst("clinic_id")?.Value;
        if (!string.IsNullOrEmpty(clinic))
            activity.SetTag("clinic.id", clinic);
    }
    await next();
});
```

Keep tags minimal. This is how on-call filters “errors for clinic X” without stuffing PHI into exporters.

## Comparing OTel to “just App Insights SDK”

Classic Application Insights SDK still works; OpenTelemetry is the open instrumentation layer many vendors ingest. For new ASP.NET Core APIs I prefer OTel instrumentation + the exporter your platform documents. Migrating old `TelemetryClient` event names can be gradual — do not big-bang rewrite every custom event on week one.

## FAQ-style interviewer extras

**Q: Where do you put sampling?** A: SDK for blunt ratios; collector for tail-based keep-on-error when the platform supports it.  
**Q: Metrics vs traces?** A: Metrics for SLOs and alerts; traces for why a single booking was slow; logs for audit/PII-controlled detail.


## Trace context across Angular support tickets

When the Angular error dialog shows `traceId`, support searches App Insights / Jaeger for that id. Train support not to ask only for “what time roughly.” Pair with ProblemDetails `extensions.traceId`.

If the browser never saw a response body (network fail), fall back to correlation id from a previous successful call or session id — document the hierarchy.

## Cardinality exercise for your API

List every metric label you emit. If any label can exceed ~50 distinct values in an hour (user id, patient id, full URL), remove it from metrics and keep it on traces/logs only.

## Dependency instrumentation order

Enable:

1. ASP.NET Core server  
2. HttpClient  
3. Optional EF  
4. Optional Runtime  

Verify after each step. Enabling everything at once makes it hard to see which package exploded volume.


## Naming spans for dashboards

Use `Category.Operation` names (`Booking.Create`, `Claims.Export`). Avoid dynamic names. Consistent names make RED metrics (rate, errors, duration) usable across releases.

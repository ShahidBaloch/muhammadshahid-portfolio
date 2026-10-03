---
title: ".NET Aspire Dashboard: What to Watch in Local Dev"
description: "What to read on the .NET Aspire dashboard in local dev: resources, structured logs, traces, and the few metrics that move during a single session."
date: "2026-10-03"
category: "architecture"
tags: [".NET Aspire", "OpenTelemetry", "ASP.NET Core", "Observability", "Local Dev"]
faq:
  - q: "Is the Aspire dashboard a production monitoring product?"
    a: "No. It is a local (or standalone OTLP) viewer for the resources and telemetry your app already emits. Production still needs a collector and a backend you operate, such as your existing OpenTelemetry pipeline."
  - q: "Why do I see logs but no trace for a request?"
    a: "Logs can come from the console logger alone. Traces show up when the app exports OpenTelemetry spans and the dashboard receives them. An ASP.NET Core app started outside the AppHost without an OTLP exporter will not appear as a trace."
  - q: "How does this differ from an Aspire plus Angular getting-started post?"
    a: "A getting-started post builds the AppHost, starts projects, and points Angular at the API. This page assumes that host is already running and explains which dashboard pages answer a local debugging question."
---

**The .NET Aspire dashboard in local dev** is the UI that shows the resources your AppHost started and the OpenTelemetry logs, traces, and metrics those processes export. You use it to answer "did this request reach the API, the database, and the cache, and which span was slow?" without SSHing anywhere.

**New to this** -> stay on this page for what to click during local debugging. **Related** -> not a second Aspire tutorial. If you still need the host, service defaults, and an Angular dev server wired up, that is a different article. **Nearby on this site** -> [.NET 10 API highlights](/blog/dotnet-10-aspnet-core-api-highlights) only if you are checking whether a new runtime metric exists; it will not teach the dashboard.

## Which page answers the bug

You already have a window full of resources and need the signal that answers the bug. This is that map: resources, console versus structured logs, traces, metrics, and the mistakes that make the UI look empty or misleading. It is not the orchestration tutorial, and it is not a vendor comparison of production APM tools.

## When this applies

Use the dashboard when:

- You run `dotnet run` on an AppHost (or you run the standalone dashboard container and point OTLP at it).
- The bug is local: a wrong connection string, a slow SQL call, a missing downstream, a log line you cannot find in the console scrollback.
- Services use the Aspire service defaults, or you configured OpenTelemetry export yourself to the dashboard's OTLP endpoint.

Do not use the dashboard as the only record of a production incident. The local dashboard process goes away when you stop the AppHost. Retention is for a debugging session, not for a quarter of SLO data.

The standalone dashboard (the `aspire-dashboard` container, without a full AppHost) is the same UI fed by OTLP. That mode has no resource list from an AppHost unless those resources also report in. This page talks about the AppHost mode first, then calls out what is only a telemetry viewer.

## Resources: the process truth

Open **Resources** before you open traces. It answers questions the logs answer only by accident.

- Is the API project running, starting, or failed?
- Did the Redis or SQL container become healthy, or is the API crash-looping because the container is still starting?
- Which URL and port were assigned? Aspire often uses random host ports. The Angular or httpyac client must use the endpoint the dashboard shows for this run, not a port memorized last week.
- Which environment variables were injected? You can confirm a reference exists without printing the secret into a chat. Do not copy connection strings out of the dashboard into tickets or recordings. Treat the details pane as production-like if it shows real keys.

A resource stuck in "waiting" usually means a health check has not passed. Read that resource's console log before you change application code. A wrong volume mount or a port clash is not an ASP.NET bug.

If a resource is green and the client still cannot connect, compare the URL you called with the URL on the resource. Proxy settings, `launchSettings.json` application URLs, and Aspire endpoints drift apart the moment someone hard-codes `https://localhost:7123`.

> **Watch:** A green resource on the wrong port is not the API you are calling. A client still aimed at last week's launchSettings URL sends you debugging a process that never saw the request.

## Console logs versus structured logs

**Console** is the stdout of that process: bootstrap failures, Kestrel's "now listening," container entrypoint noise, and any `Console.WriteLine` a teammate left behind. Use it when the process never became ready enough to export telemetry.

**Structured logs** are log records received over OTLP. They have severity, category, and fields. This is where you filter.

What to watch for an ASP.NET Core API:

- Category `Microsoft.AspNetCore.Hosting.Diagnostics` or the request logging you enabled: method, path, status code.
- Your own category, the one you pass to `ILogger<T>`. Filter to that category when the console is a firehose of framework debug.
- Failures during `IHost` startup: configuration binding, DI cycles, a Key Vault call that should not be in the local path. Those happen once per process, so sort by time and look at the first error, not the last repeat.
- Correlation. A structured log tied to a trace will show a trace id. Copy it. You are about to need it on the Traces page.

If structured logs are empty but the console is full, the app is printing text and not exporting logs. Service defaults normally enable export when the dashboard endpoint is injected (`OTEL_EXPORTER_OTLP_ENDPOINT` or the Aspire-specific wiring). A project started with Visual Studio outside the AppHost will not know that endpoint. Start it from the AppHost, or add the exporter. Guessing inside the log viewer will not create the pipeline.

> **Watch:** An empty Structured logs page does not mean the request never happened. It means this process is not exporting. The console can be full while traces stay blank.

Log levels: the dashboard shows what the app emitted. If `appsettings.Development.json` sets `Microsoft.EntityFrameworkCore` to `Information`, you will see SQL. If it is `Warning`, you will not, and the absence is not a dashboard defect. Turn the category up for the session, then turn it back down so the next person can see warnings.

Do not log request bodies, authorization headers, or cookies "so the dashboard is useful." The dashboard is local, but screenshots are forever. Log ids and status codes.

## Traces: one request across processes

A **trace** is a tree of spans for one operation. For a typical local call you should be able to see:

1. The inbound HTTP span on ASP.NET Core (method, route, status).
2. A child span for `HttpClient` if the API called another service.
3. A child span for the database command if EF Core or the SQL client instrumentation is on.
4. A child for Redis or another instrumented client, when you actually added that instrumentation.

How to work a slow click:

- Find the trace by path or status, not by scrolling all traces from app start. The filter box is the point of the page.
- Open the slow span. Look at its duration against its children. If the HTTP span is 800 ms and the SQL child is 700 ms, the bug is the query or the connection, not Kestrel.
- If the HTTP span is 800 ms and there is no child, either the time is in your own code (add a span around the suspect section) or the dependency is not instrumented. The dashboard cannot draw a SQL span from a library that does not emit one.
- Red or error status on a span should match an exception or a 5xx. A 404 on a route you know is wrong is an error only if your instrumentation marks it so. Do not "fix" telemetry to hide expected 404s from a client probe.

Broken trace, the usual causes:

- The client did not send a traceparent header and you are looking at two unrelated traces (browser call and API call). For local dev, the Aspire dashboard still shows the API's server span. The browser's span appears only if something in the browser exports OTLP, which Angular does not do by default. Start from the API span.
- Sampling. Local dev should use a sampler that keeps all spans, or you will miss the one request you care about. Production sampling is a different decision. If service defaults turn on a ratio sampler, set a development override that always records.
- A background `Channel` or `Task.Run` that did not flow `Activity.Current`. The work happens, the trace stops at the enqueue. Pass a `CancellationToken` and link or start an activity in the consumer if you need the consumer on the same trace.

Span names you recognize (`GET /api/invoices/{id}`) mean you are looking at route templates, which is what you want. Span names that include raw ids explode cardinality later when this same code ships. The dashboard will happily display the bad names. Fix the source.

> **Watch:** A trace that is easy to read locally can still be a bad span name. Raw ids look helpful in the dashboard and then explode cardinality when the same code ships.

## Metrics: only the ones that move in a session

Metrics pages are easy to over-read on a laptop. Watch a short list:

- `http.server.request.duration` (or the ASP.NET Core meter your runtime actually exports). A histogram that never moves means traffic is not hitting this process, or the meter is not exported.
- A dependency metric (HTTP client, or the database) if you are deciding whether slowness is local CPU or a remote call. Prefer the trace for a single request; prefer the metric for "this got worse over the last ten minutes of a load script."
- Process basics (CPU, memory) only to catch a leak you just introduced with a tight loop. One local user will not draw a capacity chart.
- Custom meters you added (`Meter` + `Counter<T>`) for a business action, such as invoices created. If the counter does not increment after you post, the code path did not run. That is a sharper signal than a log line you might have mistyped.

Aspire's resource metrics for containers (CPU, memory of a SQL container) tell you the container is alive under load. They do not tell you the query plan. Go back to the SQL span and log the command text in development if you need the statement.

Ignore dashboard charts you cannot name. A local session does not need twenty golden signals.

## Code that puts a row on each panel

The panels stay empty until a process exports OpenTelemetry to the endpoint the AppHost injects. This is the smallest shape that does that. The AppHost starts the API, service defaults turn on export, and one endpoint writes a span, a counter, and a structured log.

AppHost (`src/Clinic.AppHost/Program.cs`). The project references `Aspire.Hosting.SqlServer`. `Projects.Clinic_Api` is the generated type for the API project.

```csharp
var builder = DistributedApplication.CreateBuilder(args);

var sql = builder.AddSqlServer("sql");
var clinicDb = sql.AddDatabase("clinic");

builder.AddProject<Projects.Clinic_Api>("api")
    .WithReference(clinicDb)
    .WaitFor(clinicDb);

builder.Build().Run();
```

`dotnet run --project src/Clinic.AppHost` prints the dashboard URL and a login token. Open that URL. If the browser asks for a token, paste the one from this run. The port changes when an older dashboard is still up, which is the wrong-environment pitfall later on this page.

Service defaults live on the API. This is the Aspire template's OpenTelemetry wiring, plus the `Clinic.Api` meter and activity source so a custom signal is not dropped. `UseOtlpExporter()` comes from `OpenTelemetry.Exporter.OpenTelemetryProtocol`. The AppHost sets `OTEL_EXPORTER_OTLP_ENDPOINT` only for projects it starts. A project you launch from the IDE outside the AppHost never receives that variable, and these panels stay empty.

```csharp
public static class ClinicTelemetry
{
    public const string Name = "Clinic.Api";
    public static readonly Meter Meter = new(Name);
    public static readonly Counter<long> InvoicesCreated =
        Meter.CreateCounter<long>("clinic.invoices.created");
    public static readonly ActivitySource ActivitySource = new(Name);
}

public static class ServiceDefaultsExtensions
{
    public static TBuilder AddServiceDefaults<TBuilder>(this TBuilder builder)
        where TBuilder : IHostApplicationBuilder
    {
        builder.ConfigureOpenTelemetry();
        builder.Services.AddServiceDiscovery();
        return builder;
    }

    public static TBuilder ConfigureOpenTelemetry<TBuilder>(this TBuilder builder)
        where TBuilder : IHostApplicationBuilder
    {
        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
        });

        builder.Services.AddOpenTelemetry()
            .WithMetrics(metrics => metrics
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation()
                .AddRuntimeInstrumentation()
                .AddMeter(ClinicTelemetry.Name))
            .WithTracing(tracing => tracing
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation()
                .AddSource(ClinicTelemetry.Name));

        if (!string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]))
        {
            builder.Services.AddOpenTelemetry().UseOtlpExporter();
        }

        return builder;
    }
}
```

Call `builder.AddServiceDefaults()` in the API `Program.cs` before `Build()`. The endpoint below is what you post to. The invoice id is a trace tag, not a metric tag. A counter tagged by id becomes a new series per invoice, which is the cardinality problem this page already warns you about.

```csharp
public sealed record CreateInvoice(string Sku);

app.MapPost("/api/invoices", (CreateInvoice body, ILoggerFactory loggerFactory) =>
{
    var logger = loggerFactory.CreateLogger("Clinic.Api.Invoices");
    var id = Guid.NewGuid();

    using var activity = ClinicTelemetry.ActivitySource.StartActivity(
        "CreateInvoice",
        ActivityKind.Internal);
    activity?.SetTag("invoice.id", id);

    ClinicTelemetry.InvoicesCreated.Add(1);
    logger.LogInformation("Created invoice {InvoiceId}", id);

    return Results.Created($"/api/invoices/{id}", new { id });
});
```

Post once to the API URL on the Resources page, not to a port remembered from yesterday. Then read the panels in the same order as the debugging section below.

| Panel | What you should see | Question it answers |
|---|---|---|
| Resources | `api` running, `sql` healthy, an http endpoint | Did this process start, and which URL is live for this run? |
| Console | Kestrel's listening line, or the startup exception | Did the process die before it could export? |
| Structured logs | "Created invoice" and a trace id on that record | What happened, and which trace do I open? |
| Traces | Server span for `POST /api/invoices` with child `CreateInvoice` | Where did the time go: the request, or my method? |
| Metrics | Meter `Clinic.Api`, counter `clinic.invoices.created` increased by 1 | Did this path run? Is request duration moving at all? |

If the log line exists and the trace does not, the activity source name and `AddSource` disagree, or the exporter never started. If the trace exists and the counter does not, the meter name and `AddMeter` disagree. The dashboard is showing the pipeline you registered. It will not invent the missing span.

## A debugging order that stays short

1. Resources: is the dependency healthy, and is the URL right?
2. Console of the failing resource: did startup throw?
3. Structured logs filtered to warning and to your category, around the timestamp of the click.
4. The trace for that request: parent duration versus children.
5. A metric only if the question is rate or trend, not one call.

Stop when you can name the span or the exception. The dashboard is not a place to live.

## Standalone dashboard

If you are not using an AppHost, run the dashboard container, set `OTEL_EXPORTER_OTLP_ENDPOINT` (and the protocol, typically gRPC) on the API, and keep the dashboard's login key the way the image documents it. The browser will ask for that key. Do not disable auth on a dashboard bound to a non-loopback address. Traces and logs work; the AppHost resource graph will not, because nothing is orchestrating resources. That limitation is expected. Do not file it as a missing ASP.NET feature.

Service defaults in an Aspire project add the exporter, health checks, and resilience handlers. A project that references only `OpenTelemetry.Exporter.OpenTelemetryProtocol` can still light up logs, traces, and metrics. You do not need to adopt the whole Aspire stack to use the viewer. You do need the exporter pointed at the dashboard.

## Pitfalls

- **Watching the wrong environment.** A second AppHost from another branch is still running and you are clicking last week's resources. Check ports and project paths on the resource.
- **Secrets in structured log fields.** `ILogger` message templates that include a connection string or token will display them. Redact at the log call.
- **Debug level for `Microsoft.AspNetCore` left on.** The UI becomes unusable and the slow part is scrolling, not the app. Raise the filter.
- **Expecting Angular errors on the trace.** The browser console still owns template and HTTP client errors on the SPA. The dashboard owns the API and the containers. Cross-check the failing status code in both places.
- **Treating a green resource as a correct schema.** The SQL container can be healthy and missing a migration. The trace will show the exception from EF. Believe the exception.
- **Using the dashboard as a load-test sink** for an hour at high cardinality (unique span names per id). It is a dev tool. It will fall behind or eat memory. That does not predict production collector sizing.
- **Editing nothing because "there is a trace."** A trace proves the path. It does not prove the path is authorized. A 200 with the wrong tenant is still your bug; look at the log fields you added for tenant id.

## Verification

You are using the dashboard correctly when you can do this without adding temporary `Console.WriteLine`:

- Point to the resource URL the client should call.
- Open one failed request and read the exception type from structured logs.
- Open its trace and say whether the time sits in the API, SQL, or an outbound HTTP call.
- Show one metric or counter incrementing after a single known action.
- Confirm a secret does not appear in the log body you are about to screenshot.

If any of those fail, fix the export or the log statement. Do not add another viewer.

## Boundaries

This page does not build the AppHost, does not add an Angular project to the orchestrator, and does not deploy Aspire to Azure Container Apps. Those are adjacent topics. Production export of the same OpenTelemetry signals is the same spans and meters, different endpoint. When the question is specifically "what do I look at in the local **dotnet aspire dashboard**," the order above is the answer.

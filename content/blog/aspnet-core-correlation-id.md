---
title: "Correlation IDs in ASP.NET Core: End-to-End Tracing"
description: "Implement end-to-end request tracing in ASP.NET Core with custom CorrelationIdMiddleware, ILogger scopes, W3C traceparent headers, and Angular HTTP interceptors."
date: "2026-09-18"
updated: "2026-10-03"
category: "api-design"
tags: ["ASP.NET Core", "Logging", "Tracing", "Angular", "Observability", "Architecture"]
related:
  - aspnet-core-global-exception-handling
  - aspnet-core-middleware-order
  - ihttpclientfactory-aspnet-core
  - opentelemetry-aspnet-core-traces-metrics-logs
faq:
  - q: "What is a correlation ID and why is it needed?"
    a: "A correlation ID is a unique string (UUID or trace identifier) attached to an incoming HTTP request that travels through all application layers, log scopes, database queries, and downstream HTTP calls. When an error occurs, the user or support engineer can search that single ID to find the complete trace in logs."
  - q: "What header name should I use for correlation IDs?"
    a: "Standardize on X-Correlation-ID or X-Request-ID for custom headers, or adopt the W3C Trace Context standard (traceparent header) for distributed tracing and OpenTelemetry compatibility."
  - q: "How does CorrelationId differ from HttpContext.TraceIdentifier?"
    a: "HttpContext.TraceIdentifier is generated automatically by Kestrel per TCP connection/stream, but does not honor incoming client headers or propagate to downstream services by default. CorrelationId middleware accepts client headers or falls back to a generated ID."
  - q: "Should correlation IDs be included in ProblemDetails responses?"
    a: "Yes. Adding extensions['correlationId'] to RFC 7807/RFC 9457 ProblemDetails allows frontend error handlers (e.g. Angular error toasts) to display the ID to users, enabling instant lookup in Seq, Application Insights, or Elastic."
---

**A correlation ID in ASP.NET Core** is a unique identifier propagated across the entire HTTP lifecycle, logging scopes, and downstream microservices. When a user reports "checkout failed," a single correlation ID allows engineers to isolate every database query, third-party HTTP call, and exception associated with that specific request.

```text
Browser / Angular SPA ──► Sends X-Correlation-ID: 8f4b-2a9e
         │
         ▼
ASP.NET Core Correlation Middleware:
  ├── Reads incoming header or creates new GUID
  ├── Appends to HttpContext.Items & Response Headers
  └── Wraps execution in ILogger.BeginScope({ CorrelationId })
         │
         ▼
Controllers / Services / EF Core:
  └── Every Serilog / ILogger entry includes [CorrelationId: 8f4b-2a9e]
         │
         ▼
IHttpClientFactory DelegatingHandler:
  └── Forwards X-Correlation-ID to Downstream Payment API / Microservices
```

**New to this** → start with the [middleware implementation](#complete-correlation-id-middleware). **Pipeline ordering** → [Middleware order guide](/blog/aspnet-core-middleware-order). **Structured exceptions** → [Global exception handling](/blog/aspnet-core-global-exception-handling). **Interview prep** → [If an interviewer asks](#if-an-interviewer-asks).

## Real-world analogy

Think of a correlation ID as a **hospital patient wristband or dry-cleaning ticket**. When you check in a three-piece suit, every garment (coat, vest, trousers) receives the same tag number. Even if the trousers go to the tailor and the coat to the steam press, the ticket number remains identical. When you come to pick it up, the shop queries that one number rather than searching through thousands of unlabelled garments.

## Complete correlation ID middleware implementation

Here is a robust, production-grade correlation middleware for ASP.NET Core that:
1. Accepts an incoming `X-Correlation-ID` or `X-Request-ID` header.
2. Falls back to `HttpContext.TraceIdentifier` or a new GUID if absent.
3. Attaches the header safely to the HTTP response using `HttpResponse.OnStarting`.
4. Wraps the request in a structured `ILogger.BeginScope` so all downstream logs include the property.

```csharp
// Infrastructure/Logging/CorrelationIdMiddleware.cs
using System.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace Portfolio.Api.Infrastructure.Logging;

public sealed class CorrelationIdMiddleware
{
    private const string CorrelationHeaderKey = "X-Correlation-ID";
    private readonly RequestDelegate _next;
    private readonly ILogger<CorrelationIdMiddleware> _logger;

    public CorrelationIdMiddleware(RequestDelegate next, ILogger<CorrelationIdMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // 1. Resolve or generate correlation ID
        var correlationId = GetOrCreateCorrelationId(context);

        // 2. Store in HttpContext.Items for internal consumption
        context.Items[CorrelationHeaderKey] = correlationId;

        // 3. Set W3C Activity if using OpenTelemetry
        Activity.Current?.SetTag("correlation.id", correlationId);

        // 4. Attach to response headers before headers are flushed
        context.Response.OnStarting(() =>
        {
            if (!context.Response.Headers.ContainsKey(CorrelationHeaderKey))
            {
                context.Response.Headers[CorrelationHeaderKey] = correlationId;
            }
            return Task.CompletedTask;
        });

        // 5. Open structured logging scope
        using (_logger.BeginScope(new Dictionary<string, object>
        {
            ["CorrelationId"] = correlationId,
            ["TraceIdentifier"] = context.TraceIdentifier
        }))
        {
            await _next(context);
        }
    }

    private static string GetOrCreateCorrelationId(HttpContext context)
    {
        if (context.Request.Headers.TryGetValue(CorrelationHeaderKey, out var headerValues) &&
            !string.IsNullOrWhiteSpace(headerValues.FirstOrDefault()))
        {
            return headerValues.First()!;
        }

        if (context.Request.Headers.TryGetValue("X-Request-ID", out var requestIdValues) &&
            !string.IsNullOrWhiteSpace(requestIdValues.FirstOrDefault()))
        {
            return requestIdValues.First()!;
        }

        return Guid.NewGuid().ToString("N");
    }
}

// Extension method for clean Program.cs registration
public static class CorrelationIdMiddlewareExtensions
{
    public static IApplicationBuilder UseCorrelationId(this IApplicationBuilder app) =>
        app.UseMiddleware<CorrelationIdMiddleware>();
}
```

## Registering early in the ASP.NET Core pipeline

Register `UseCorrelationId()` at the very top of your middleware pipeline so that exceptions caught by `UseExceptionHandler` or authentication failures from `UseAuthentication` inherit the log scope:

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

var app = builder.Build();

// 1. Correlation ID must be the very first middleware
app.UseCorrelationId();

// 2. Global Exception Handler can now write correlation IDs to ProblemDetails
app.UseExceptionHandler();

app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
```

## Propagating correlation IDs to downstream HTTP services

When your ASP.NET Core API calls external microservices or payment gateways, propagate the correlation ID using a `DelegatingHandler`:

```csharp
// Infrastructure/Http/CorrelationPropagationHandler.cs
using System.Net.Http;
using Microsoft.AspNetCore.Http;

public sealed class CorrelationPropagationHandler : DelegatingHandler
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CorrelationPropagationHandler(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, 
        CancellationToken cancellationToken)
    {
        var context = _httpContextAccessor.HttpContext;
        if (context?.Items.TryGetValue("X-Correlation-ID", out var correlationIdObj) == true &&
            correlationIdObj is string correlationId)
        {
            if (!request.Headers.Contains("X-Correlation-ID"))
            {
                request.Headers.Add("X-Correlation-ID", correlationId);
            }
        }

        return await base.SendAsync(request, cancellationToken);
    }
}

// Service registration:
builder.Services.AddHttpContextAccessor();
builder.Services.AddTransient<CorrelationPropagationHandler>();

builder.Services.AddHttpClient<IPaymentService, PaymentService>()
    .AddHttpMessageHandler<CorrelationPropagationHandler>();
```

## Angular client integration: displaying correlation IDs on error

Capture the correlation ID in Angular's HTTP error interceptor to present it on error dialogs:

```typescript
// src/app/core/interceptors/error.interceptor.ts
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { NotificationService } from '../services/notification.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notify = inject(NotificationService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // 1. Extract correlation ID from response header or ProblemDetails extension
      const correlationId = 
        error.headers.get('X-Correlation-ID') || 
        error.error?.extensions?.correlationId || 
        'N/A';

      if (error.status >= 500) {
        notify.showErrorDialog({
          title: 'Server Error',
          message: 'An unexpected error occurred. Please provide this Reference ID to support.',
          referenceId: correlationId,
        });
      }

      return throwError(() => error);
    })
  );
};
```

## Common mistakes and pitfalls

- **Mutating headers after response streaming has started**: Calling `context.Response.Headers.Add(...)` after bytes have been sent to the network throws `InvalidOperationException: Headers are read-only, response has already started`. Always use `context.Response.OnStarting()`.
- **Placing middleware after authentication or exception handlers**: If correlation middleware runs after `UseExceptionHandler`, unhandled exceptions will be logged without correlation scopes.
- **Losing context across unawaited background tasks**: `Task.Run` without capturing `AsyncLocal` or `ILogger.BeginScope` will cause background jobs to lose correlation identifiers. Pass the ID explicitly into background queues or channels.
- **Logging sensitive tokens alongside the ID**: Never log raw Authorization headers, cookies, or patient PII into the structured correlation scope.

## If an interviewer asks

**30-second answer:** A correlation ID is a unique tracing token attached to HTTP headers (`X-Correlation-ID`) and enriched into `ILogger.BeginScope` and OpenTelemetry activities. It ensures every log statement, database query, and downstream RPC request triggered by a user action shares one search key across distributed observability systems.

**Strong answer:** In production ASP.NET Core systems, correlation IDs bridge the gap between frontend user experience and backend observability. We implement a lightweight middleware at the start of the pipeline that reads or generates the ID, binds it to an ambient `ILogger.BeginScope`, hooks `HttpResponse.OnStarting` to echo it in headers, and enriches RFC 9457 `ProblemDetails`. For outbound service calls, an `IHttpClientFactory` `DelegatingHandler` forwards the header so downstream microservices preserve trace continuity without developer intervention.

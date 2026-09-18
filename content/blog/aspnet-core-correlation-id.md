---
title: "Correlation IDs in ASP.NET Core"
description: "How to set one request id on an ASP.NET Core response and on every log line, so an Angular error report matches one server trace. Other posts mention the id. This page is how to create it."
date: "2026-09-18"
updated: "2026-09-18"
category: "api-design"
tags: ["ASP.NET Core", "Logging", "Tracing", "Angular"]
related:
  - aspnet-core-global-exception-handling
  - aspnet-core-middleware-order
  - ihttpclientfactory-aspnet-core
faq:
  - q: "What is a correlation id?"
    a: "One value that ties a browser request to the log lines, the exception body, and any downstream call made for that request. ASP.NET Core already has TraceIdentifier. The work is to accept an incoming id, echo it, and log it."
  - q: "Should I invent a new header name?"
    a: "Prefer X-Request-Id, which clients already send. If the header is missing, use TraceIdentifier. Do not generate a second id and log both."
  - q: "Is this the same as OpenTelemetry?"
    a: "No. A request id is one field. A trace is spans across processes. Start with the id. Add a tracer when more than one service must be followed."
---

When a user says "checkout failed," you need one id you can paste into the logs. Several posts on this site tell you to log that id. None of them is the setup. This is the setup. Exception bodies that should include it are [global exception handling](/blog/aspnet-core-global-exception-handling).

Hub: [API design](/learning/api-design).

## Real-world analogy

A dry-cleaning ticket. Every garment from that visit has the same number, including the one that went to the tailor. You do not give the shirt a number, the coat a different number, and then ask the customer which visit they meant. One ticket, written on the receipt they take home, which is the response header.

## Worked example

Angular shows a toast: "Something went wrong." The server log has 200 lines in that second from a dozen users. Nothing in the toast matches a line. After this middleware, the response carries `X-Request-Id: 7f3a`. The exception JSON includes the same value. The user reads it back, or the interceptor logs it. You filter the log on `7f3a` and see the SQL timeout and the outbound HTTP call. The DI guide mentions asking an Angular team for this id during a concurrency bug. That sentence is a debugging habit. It is not a second implementation.

| Piece | Role |
|---|---|
| Incoming `X-Request-Id` | Keep it if the caller already has one |
| `HttpContext.TraceIdentifier` | Use it when the header is absent |
| Response header | So the client can show or report it |
| Log scope | So every line in the request carries it |

## Code

```csharp
app.Use(async (context, next) =>
{
    var incoming = context.Request.Headers["X-Request-Id"].ToString();
    var id = string.IsNullOrWhiteSpace(incoming)
        ? context.TraceIdentifier
        : incoming;

    context.Response.OnStarting(() =>
    {
        context.Response.Headers["X-Request-Id"] = id;
        return Task.CompletedTask;
    });

    using (context.RequestServices
        .GetRequiredService<ILoggerFactory>()
        .CreateLogger("Correlation")
        .BeginScope(new Dictionary<string, object> { ["CorrelationId"] = id }))
    {
        await next();
    }
});
```

Put it early, with the rest of the pipeline in [middleware order](/blog/aspnet-core-middleware-order). Outbound calls should forward the same header. That wiring belongs with [IHttpClientFactory](/blog/ihttpclientfactory-aspnet-core), not a copy of it here. Do not log the whole authorization header next to the id.

Support traces for a live checkout: [Ecom_NET10](/work/ecom-net10).

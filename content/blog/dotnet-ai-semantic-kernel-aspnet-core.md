---
title: "AI in .NET with Semantic Kernel"
description: "Use Semantic Kernel and LLMs in ASP.NET Core — prompts, plugins, safety, caching, and how Angular clients call AI features without leaking secrets or burning tokens."
date: "2026-08-12"
tags: ["AI", "Semantic Kernel", ".NET", "ASP.NET Core", "LLM", "C#"]
related:
  - aspnet-core-jwt-auth
  - redis-caching-aspnet-core
  - ihttpclientfactory-aspnet-core
faq:
  - q: "How do I use Semantic Kernel in ASP.NET Core?"
    a: "Treat the LLM like outbound HTTP: secrets in config, timeouts, user-scoped auth, and plugins that cannot dump PHI. Angular calls your API, not the model."
  - q: "Should Angular call the LLM directly?"
    a: "No. That leaks keys and skips audit. The SPA posts a prompt to ASP.NET Core; the API owns the kernel and the bill."
  - q: "Is prompt caching the same as Redis API caching?"
    a: "No. Token caches are model-vendor features. Redis for clinic list endpoints is the Redis article. Do not mix the two keys."
---

**Semantic Kernel** orchestrates LLM calls in ASP.NET Core — prompts, plugins, and grounding data stay on the server; Angular calls your API, never the model provider directly.

```text
Angular → /api/ai/ask (Authorize)
              │
              ▼
         Kernel + plugins (scoped data)
              │
              ▼
         OpenAI / Azure OpenAI
```

**New to this** → stay here. **Merging a PR** → [what belongs on server](#what-belongs-on-the-server). **On-call / interview** → [plugins](#plugins-and-tools-keep-them-boring) · [safety checklist](#safety-checklist-healthcare--saas) · [if an interviewer asks](#if-an-interviewer-asks).

**AI in .NET** is no longer a demo slide. Product teams want chat assistants, document Q&A, and drafting helpers behind Angular SPAs.

I treat LLM calls like external HTTP: secrets in config, timeouts, retries with care, user-scoped auth, and never “just call OpenAI from the browser.”

## What belongs on the server

| On ASP.NET Core | Never in Angular |
|---|---|
| API keys / managed identity | Provider secrets |
| Prompt templates + grounding data | Unrestricted system prompts |
| Rate limits + spend caps | Unlimited client-side token burn |
| Audit logs (who asked what) | Silent PII in prompts |

Angular should call **your** `/api/ai/...` endpoints. Your API calls the model.

## Minimal Semantic Kernel sketch

```csharp
builder.Services.AddSingleton(sp =>
{
    var config = sp.GetRequiredService<IConfiguration>();
    var kernel = Kernel.CreateBuilder()
        .AddOpenAIChatCompletion(
            modelId: config["AI:Model"]!,
            apiKey: config["AI:ApiKey"]!)
        .Build();
    return kernel;
});

builder.Services.AddScoped<IAssistantService, AssistantService>();
```

```csharp
public sealed class AssistantService : IAssistantService
{
    private readonly Kernel _kernel;

    public AssistantService(Kernel kernel) => _kernel = kernel;

    public async Task<string> AskAsync(
        string userId,
        string question,
        CancellationToken ct)
    {
        // Load only docs the user is allowed to see — then ground the prompt
        var prompt = $"""
            You are a support assistant for our product.
            Answer briefly. If you are unsure, say you do not know.
            Question: {question}
            """;

        var result = await _kernel.InvokePromptAsync(prompt, cancellationToken: ct);
        return result.ToString();
    }
}
```

Wire a Minimal API or controller with `[Authorize]`, pass `CancellationToken`, and return a DTO Angular can render.

## Plugins and tools (keep them boring)

Expose **narrow** tools: “search help articles,” “get order status by id for current user.” Do not give the model raw SQL.

```csharp
public class OrderStatusPlugin
{
    private readonly IOrderService _orders;
    private readonly ICurrentUser _user;

    [KernelFunction("get_order_status")]
    public async Task<string> GetStatusAsync(Guid orderId, CancellationToken ct)
    {
        var order = await _orders.GetForUserAsync(_user.Id, orderId, ct);
        return order is null ? "not_found" : order.Status;
    }
}
```

Authorization stays in your service — the plugin is not a security boundary by itself.

## Cost, latency, and UX for Angular

1. **Stream** tokens if the UX needs it (SSE/SignalR) — or return a full answer for short tasks
2. **Cache** identical FAQ answers with Redis when safe
3. **Timeouts** shorter than your API gateway idle limit
4. Show “thinking” state in the SPA; allow cancel → cancel the server `CancellationToken`

## Safety checklist (healthcare / SaaS)

- Strip or refuse PHI/PII that should not leave your boundary
- Log prompt/response ids, not full secrets or payloads in clear text where prohibited
- Content filters / refusal policies for abuse
- Human escalation path when the model says “I don’t know”
- Feature flag AI endpoints so you can disable spend instantly

## Failure story: keys in the SPA

A team put the OpenAI key in Angular environment files “for a weekend POC.” The key leaked via browser network tab within days. We moved all calls behind ASP.NET Core, rotated keys, and added per-user rate limits. The feature stayed; the blast radius shrank.

## Delivery checklist

1. No provider secrets in Angular bundles
2. `[Authorize]` + user-scoped data access on every AI endpoint
3. Timeouts, cancellation, and spend/rate limits
4. Prompts versioned in code or config — not edited live in production without review
5. Observability: latency, token usage, error rate
6. Angular UX handles slow/partial failures honestly
7. Legal/privacy review when prompts include customer content

## Related reading

- [ASP.NET Core Rate Limiting](/blog/aspnet-core-rate-limiting)
- [Redis Caching in ASP.NET Core](/blog/redis-caching-aspnet-core)
- [C# Async and Await in ASP.NET Core](/blog/csharp-async-await-aspnet-core)

## If an interviewer asks

Should Angular call the LLM directly; what belongs in a Kernel plugin; how to handle PHI in prompts.

**Strong answer:** Never put provider keys in Angular — API owns the kernel, rate limits, and audit. Plugins expose narrow tools (`get_order_status`), not raw SQL. Strip or refuse PHI leaving your boundary; log token usage and latency, not full prompts in clear text where policy forbids it.

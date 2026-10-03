---
title: "Blazor vs Angular for .NET Teams: When Each Wins"
description: "Blazor vs Angular in front of an ASP.NET Core API: Interactive Server, WebAssembly, or a separate SPA. A team decision, not a framework tutorial."
date: "2026-10-03"
category: "architecture"
tags: ["Blazor", "Angular", "ASP.NET Core", "Architecture"]
related:
  - angular-dotnet-integration
  - angular-signals-aspnet-core
  - signalr-aspnet-core-realtime
  - entra-id-angular-aspnet-core
faq:
  - q: "Should a .NET team pick Blazor or Angular?"
    a: "Pick Angular when the UI is a product of its own, the team already writes it, or the same API serves mobile and other SPAs. Pick Blazor when the UI is an internal app, the team is C# only, and you accept either a SignalR circuit (Server) or a larger first download (WebAssembly)."
  - q: "Does Blazor Server remove the need for an API?"
    a: "It can, for a monolith that renders on the server. The moment a second client needs the same rules, you still want an ASP.NET Core API. Blazor is the UI host, not a reason to put business rules in button handlers."
  - q: "Can Blazor and Angular call the same ASP.NET Core API?"
    a: "Yes. Keep the HTTP contract. Blazor Server can also call services in-process, but a shared API is what lets both UIs ship against one backend."
---

**Blazor versus Angular for a .NET team** is a bet on who maintains the UI and how the browser talks to ASP.NET Core. Angular is a separate TypeScript application that calls your API. Blazor is a .NET UI that shares the runtime story with the API, either by keeping a live circuit (Interactive Server) or by running in the browser (WebAssembly). Neither choice fixes a muddled domain model.

```text
Angular
  browser UI (TypeScript) --HTTP--> ASP.NET Core API

Blazor Server
  browser --SignalR circuit--> ASP.NET Core (UI + usually the app)

Blazor WebAssembly
  browser (.NET) --HTTP--> ASP.NET Core API
```

Metaphor: Angular is a separate shop that orders from your kitchen through a written menu (the API). Blazor Server is a waiter who runs to the kitchen for every gesture and must stay employed for the whole meal (the circuit). Blazor WebAssembly is sending the kitchen's recipe box to the table so the guest can cook, which is heavy to carry and still needs the kitchen for anything you do not trust the guest with.


**New to this** stay here for the decision. **If you already chose Angular**, integration is [Angular with ASP.NET Core](/blog/angular-dotnet-integration), state is [signals](/blog/angular-signals-aspnet-core), and sign-in is [Entra ID](/blog/entra-id-angular-aspnet-core). **Realtime after either choice** see [SignalR](/blog/signalr-aspnet-core-realtime). This page does not retell those.

You have an ASP.NET Core API, or you are about to, and a team that knows C# better than TypeScript, or the opposite.

## Blazor vs Angular when the API is already ASP.NET Core

| Constraint | Angular | Blazor Interactive Server | Blazor WebAssembly |
|---|---|---|---|
| Language in the UI | TypeScript | C# | C# |
| Talks to the API | HTTP, any client | Often in-process; HTTP if you split | HTTP |
| First load | JS bundles you budget | Small HTML, then a circuit | Larger .NET download |
| Needs a sticky server | No | Yes, for the life of the circuit | No |
| Works offline | Only if you build it | No | Possible for cached bits, still hard |
| SEO | Fine with SSR if you add it | Static render can be fine; interactive circuit is not a crawler strategy | Poor as the only render |
| UI talent market | Large | Smaller, growing | Smaller, growing |
| Share DTOs with the API | OpenAPI generate, or hand-write | Same project references | Shared class library, carefully |

.NET 8 and later also let a Blazor app mix modes: static SSR, interactive server, interactive WebAssembly, and Auto (server first, then WASM). Auto is not a third product. It is "pay the circuit cost until the WASM runtime arrives". Use it when you measured both costs. Do not pick Auto because the template checkbox looked modern.

## The same endpoint from each UI

The constraint table is abstract until you see the call. Both UIs hit one ASP.NET Core route. The route is the contract. The component is the part you can replace.

```csharp
public sealed record InvoiceDto(Guid Id, string Number, decimal Total);

app.MapGet("/api/invoices/{id:guid}", async (
    Guid id,
    InvoiceDb db,
    ClaimsPrincipal user,
    CancellationToken cancellationToken) =>
{
    var tenantClaim = user.FindFirstValue("tid")
        ?? throw new InvalidOperationException("Missing tid claim.");
    var tenantId = Guid.Parse(tenantClaim);

    var invoice = await db.Invoices.AsNoTracking()
        .Where(row => row.Id == id && row.TenantId == tenantId)
        .Select(row => new InvoiceDto(row.Id, row.Number, row.Total))
        .FirstOrDefaultAsync(cancellationToken);

    return invoice is null ? Results.NotFound() : Results.Ok(invoice);
}).RequireAuthorization();
```

Blazor calls it with `HttpClient`, which is what WebAssembly and a split Server host have to do. Register the client once. `Api:BaseUrl` comes from configuration and must end with a slash. A relative request without that slash replaces the last path segment.

```csharp
builder.Services.AddHttpClient("api", (serviceProvider, client) =>
{
    var baseUrl = builder.Configuration["Api:BaseUrl"]
        ?? throw new InvalidOperationException("Api:BaseUrl is not set.");
    if (!baseUrl.EndsWith('/'))
    {
        baseUrl += "/";
    }
    client.BaseAddress = new Uri(baseUrl);
});
```

```razor
@page "/invoices/{Id:guid}"
@inject IHttpClientFactory HttpFactory

@if (_missing)
{
    <p>Invoice not found.</p>
}
else if (_invoice is null)
{
    <p>Loading…</p>
}
else
{
    <p>@_invoice.Number — @_invoice.Total.ToString("0.00")</p>
}

@code {
    [Parameter] public Guid Id { get; set; }

    private InvoiceDto? _invoice;
    private bool _missing;

    protected override async Task OnParametersSetAsync()
    {
        _missing = false;
        _invoice = null;

        var client = HttpFactory.CreateClient("api");
        using var response = await client.GetAsync($"api/invoices/{Id}");
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            _missing = true;
            return;
        }

        response.EnsureSuccessStatusCode();
        _invoice = await response.Content.ReadFromJsonAsync<InvoiceDto>();
    }
}
```

The Angular component requests the same URL and treats 404 the same way. The dev server proxies `/api` to the ASP.NET Core port, so the component does not embed a host.

```typescript
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { catchError, filter, map, of, switchMap } from 'rxjs';

interface InvoiceDto {
  id: string;
  number: string;
  total: number;
}

@Component({
  selector: 'app-invoice',
  standalone: true,
  templateUrl: './invoice.component.html',
})
export class InvoiceComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  readonly invoice = toSignal(
    this.route.paramMap.pipe(
      map((params) => params.get('id')),
      filter((id): id is string => id !== null),
      switchMap((id) =>
        this.http.get<InvoiceDto>(`/api/invoices/${id}`).pipe(
          catchError((error: unknown) => {
            if (error instanceof HttpErrorResponse && error.status === 404) {
              return of(null);
            }
            throw error;
          }),
        ),
      ),
    ),
  );
}
```

```html
@if (invoice() === undefined) {
  <p>Loading...</p>
} @else if (invoice() === null) {
  <p>Invoice not found.</p>
} @else {
  <p>{{ invoice()!.number }} - {{ invoice()!.total }}</p>
}
```

When you rename `Number` on the server record, a Blazor project that shares `InvoiceDto` fails to compile. An Angular client generated from OpenAPI fails the same way. A hand-written interface fails later, at runtime. That is one reason a C#-only internal app leans Blazor, and it is not free on the Angular side: generation is the work that moves the failure to compile time.

The 404 path is the check that you are actually on this contract. A Blazor Server component that opens `DbContext` itself never hits this route, so it never shows you this behavior. If the ticket says "Blazor Server monolith", say so, and do not pretend the sample above is what you are running. The "when each wins" sections below are the decision. This section is only so that decision is about a real call.

> **Watch:** A Blazor Server screen that opens the database itself is not the HTTP client in the sample. You will compare frameworks and miss that you skipped the API boundary.

## When Angular wins

- The team already ships this SPA. Rewriting it in Blazor is a new product that happens to look like the old one. Do that only with a budget called "rewrite", not "upgrade".
- The API has more than one UI: this SPA, a mobile app, a partner. Angular keeps you honest because nothing in the UI can touch EF Core. Blazor Server makes that cheat easy, and teams take it.
- Designers and front-end developers live in HTML, CSS, and TypeScript. Forcing them through Razor does not make them .NET developers. It makes them slower.
- You care about the browser ecosystem: component libraries you already paid for, accessibility tooling, and hireable replacements when someone leaves.
- The users are on high-latency or unreliable networks. A dropped Blazor Server circuit is a stuck screen until reconnect. Angular fails one HTTP call and retries it.

Angular's costs are real: a second language, a second build, OpenAPI or hand-written models, and auth headers. Those costs are the subject of the Angular integration posts. They are not reasons to pretend the costs are zero on the Blazor side.

> **Watch:** Angular's second language and second build are real, but they are not proof that Blazor is free. A circuit, a WASM download, or a shared DbContext is the cost you skipped.

## When Blazor wins

- The app is internal. Users sit on the company network. A circuit to one region is acceptable. The team is three C# developers and zero interest in owning an npm graph.
- Screens are forms over the domain you already modeled in C#. Sharing validation attributes and types removes a class of "the SPA accepts what the API rejects" bugs. You can do that with generated clients too, but Blazor Server does it by default.
- You do not need the UI to be a public SEO surface. Marketing pages can stay Razor or static HTML beside the app.
- You want one deployable. Blazor Server hosted with the API is operationally a single ASP.NET Core app. Angular is two artifacts unless you insist on hosting the built files from `wwwroot`, which you can, and which still leaves two toolchains.

Blazor WebAssembly wins over Blazor Server when users roam across regions or you cannot pin a circuit to one server. It loses on first-load size and on the fact that anything you ship to the browser is visible. Secrets, admin queries, and "just this internal endpoint" do not belong in WASM. Call the API. Authorize the API. The browser is not a trust boundary in either stack, but WASM makes the temptation to hide a connection string in a .NET method look legitimate. It is not.

> **Watch:** A connection string inside a WebAssembly method looks like server code and is readable in the published files. The API still has to authorize the call.

## Auth, realtime, and API shape

Both UIs should end at the same ASP.NET Core auth policies. Angular plus Entra ID is a redirect and a bearer token; that flow is the Entra post. Blazor Server often uses cookie auth because the circuit is same-origin. Blazor WebAssembly looks more like Angular: it needs tokens or a BFF. If you pick WASM and then invent a custom token store, you have chosen the harder Angular problems without the Angular ecosystem. A BFF is [the BFF post](/blog/bff-pattern-aspnet-core-angular-yarp) even when the UI is Blazor.

Realtime: Blazor Server is already a SignalR circuit. Do not bolt a second SignalR hub on for every button click. Add a hub when the server must push to many users, which is the [SignalR guide](/blog/signalr-aspnet-core-realtime), and it applies to Angular clients too. Angular is not "bad at realtime". It is explicit about it.

API shape: if Angular is in the running, design the API as if mobile exists, because the discipline is useful even when mobile does not. If Blazor Server is the only UI and will stay that way, a monolith with clear application services is enough. Do not extract microservices to make Blazor feel serious. The [modular monolith versus microservices](/blog/modular-monolith-vs-microservices-dotnet) choice is independent, and it should stay that way.

## A decision you can write in a ticket

Choose **Angular** if two or more of these are true: an Angular app already exists; a second client will share the API within a year; the people who will edit CSS are not the people who edit C#; users are outside your region or off your VPN.

Choose **Blazor Server** if all of these are true: internal users; one region; C#-only team; no plan for a second client; you can run sticky sessions or a single instance without heroics.

Choose **Blazor WebAssembly** (or Auto, after a prototype) if you wanted Server but the circuit will not survive the network, and you measured the download on a laptop that looks like a user's.

Choose **neither** for a content site. Razor Pages or MVC with a little HTMX-style enhancement, or static HTML, is less UI framework than you think you need. Reaching for Blazor or Angular for a documentation page is how a blog becomes a circuit.

## Pitfalls

- **Pilot in Blazor Server, ship to a global customer base**, discover reconnect bugs, rewrite in Angular under duress.
- **"We share the DbContext in the component"** and call it productivity. You skipped authorization boundaries the API would have forced.
- **Judging Blazor by a two-year-old WebAssembly article** that predates static SSR and render modes. Judge the mode you will run, on the .NET version you will run.
- **Judging Angular by a NgModule template from 2019.** Current Angular is standalone and signals. Read those posts if Angular wins, not a nostalgia sample.
- **Two UIs.** Blazor for admin, Angular for the customer, with no staff. You now have the union of the costs. Only do this when the admin tool is tiny and internal and the customer app already exists.

## Verification

Before you commit the company, spend a week on the riskiest path, not the easiest demo.

- If you lean Server: disconnect the network for 30 seconds on a form with unsaved state. Note what the user sees. Put the app on two instances without session affinity and confirm you understand the failure.
- If you lean WASM: throttle the browser and record the time until the first useful screen. Open the published files and confirm no secret is in them.
- If you lean Angular: generate a client from OpenAPI and change one DTO on purpose. The break should be a compile error in the SPA or a contract test, not a production 400.

The winner is the option whose failure mode your on-call can explain. A framework you cannot debug at 2 a.m. is the wrong one, even if the conference talk was convincing.

**Related:** [Angular and ASP.NET Core](/blog/angular-dotnet-integration) | [Angular signals](/blog/angular-signals-aspnet-core) | [SignalR](/blog/signalr-aspnet-core-realtime) | [Entra ID and Angular](/blog/entra-id-angular-aspnet-core)

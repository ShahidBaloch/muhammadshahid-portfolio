---
title: "Angular @defer Performance on Admin Dashboards"
description: "Angular @defer performance for admin dashboards: which widget waits, which trigger fires, and which ASP.NET Core call is absent on first paint."
date: "2026-10-03"
category: "architecture"
tags: ["Angular", "@defer", "Performance", "ASP.NET Core", "Dashboards"]
faq:
  - q: "Does @defer stop Angular from calling every dashboard API on startup?"
    a: "Only if the HttpClient call lives inside the deferred component and that component is not created yet. @defer delays the component. It does not cancel requests you already fire from the parent constructor."
  - q: "Is @defer the same as ChangeDetectionStrategy.OnPush?"
    a: "No. OnPush limits when a component refreshes its bindings. @defer controls when a component is downloaded and created. You can use both; neither replaces the other."
  - q: "How does this differ from the accessible forms and aria-live post?"
    a: "That post covers names, field errors, and announcing content after it appears. This post decides which dashboard blocks wait, which trigger fires, and how the API stays cheap once the block loads."
---

**Angular @defer performance** on an ASP.NET Core admin dashboard means the first route renders the shell and the one or two numbers the user needs immediately, and heavy children (charts, export history, audit grids) are separate chunks that load on a trigger you choose.

**New to this** -> use this page to place triggers and keep the API honest. **Related** -> [accessible forms and live regions](/blog/angular-accessible-forms-aria-live) once a deferred block must be announced. **Not this page** -> OnPush, signals versus zone.js, or the global Angular performance cookbook.

## What should stay off the first paint

This is not "make the framework faster." It is the dashboard route pulling a chart library, a 2,000-row table, and six endpoints before anyone has scrolled. `@defer` (stable since Angular 17) splits that route. This walkthrough shows the blocks, the triggers, and the ASP.NET Core habits that make the split real. It does not retune change detection.

## When this applies

Use `@defer` on a dashboard when:

- The route is an admin home, not a single form.
- At least one child imports a heavy dependency (charting, a grid, a map, a rich-text preview).
- Some data is below the fold or behind a tab the user might never open.
- The API can serve each widget with its own endpoint or query. A single 3 MB aggregate DTO removes most of the benefit.

Do not defer:

- The primary heading, the account switcher, or the legal "you are in production" banner. Those are the shell.
- The only content on the route. Deferring the whole page adds a loading state and no architectural win.
- Authorization. Hiding a widget is not security. The endpoint still needs `[Authorize]` and a policy.

`@defer` runs in the browser as part of the Angular control flow. It is not the same feature as server-side streaming of Razor components. If the Angular app is hosted by ASP.NET Core, the server still sends `index.html` and the JS bundles; deferred chunks are additional files the browser requests later. Make sure your static-file hosting, CDN, and `base href` can serve those chunk files. A deploy that uploads only `main` and not the deferred chunks fails the first time a trigger fires.

## What loads eagerly

Keep the eager set boring:

- Layout, nav, and the page title.
- A KPI strip backed by one small endpoint (`/api/admin/summary`) that returns a handful of integers, not embedded collections.
- An error region for that summary so a failed summary does not look like an empty business.

```html
<section aria-labelledby="dash-title">
  <h1 id="dash-title">Operations</h1>
  <app-kpi-strip [summary]="summary()" />

  @defer (on viewport; prefetch on idle) {
    <app-audit-panel />
  } @placeholder {
    <p>Audit history loads when this section is on screen.</p>
  } @loading (minimum 200ms) {
    <p>Loading audit history.</p>
  } @error {
    <p>Audit history did not load. Refresh the page to try again.</p>
  }

  @defer (on interaction) {
    <app-revenue-chart />
  } @placeholder {
    <button type="button">Show revenue chart</button>
  } @loading {
    <p>Loading chart.</p>
  } @error {
    <p>The chart failed to load.</p>
  }
</section>
```

`prefetch on idle` downloads the audit chunk during idle time but still waits until the block is near the viewport to create the component and, if you wrote the component correctly, to call the API. Prefetch without a separate trigger still creates the component when the prefetch condition is met. The two-trigger form above is the one you want for "download early, run late."

`minimum` on `@loading` avoids a flash when the chunk is already cached. `after` can hold the loading state for a beat so layout does not jump. Use milliseconds, not a fake progress bar.

The placeholder for `on interaction` must be something the user can click or focus. The placeholder content is what receives the interaction. A grey rectangle with no button never triggers.

## Keep HTTP inside the deferred component

> **Watch:** @defer delays the component, not a request the parent already fired. If HttpClient runs in the parent constructor, the waterfall does not move.

This is the failure mode that makes teams say `@defer` did nothing.

```typescript
// Parent that defeats defer
ngOnInit(): void {
  this.http.get('/api/audit').subscribe((rows) => this.audit.set(rows));
  this.http.get('/api/reports/revenue').subscribe((s) => this.revenue.set(s));
}
```

The parent is eager, so both calls run at route activation even if the templates are deferred. Move the client into the child:

```typescript
import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

type AuditRow = { id: string; at: string; action: string };

@Component({
  selector: 'app-audit-panel',
  template: `
    <table>
      <caption>Latest audit events</caption>
      <thead>
        <tr><th scope="col">When</th><th scope="col">Action</th></tr>
      </thead>
      <tbody>
        @for (row of rows(); track row.id) {
          <tr>
            <td>{{ row.at }}</td>
            <td>{{ row.action }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class AuditPanelComponent {
  private readonly http = inject(HttpClient);
  readonly rows = signal<AuditRow[]>([]);

  constructor() {
    this.http.get<AuditRow[]>('/api/audit?take=50').subscribe({
      next: (rows) => this.rows.set(rows),
      error: () => this.rows.set([]),
    });
  }
}
```

Import the chart library inside `app-revenue-chart.ts`, not in the shell component and not in `app.config.ts`. `@defer` splits on the deferred dependency boundary. If the shell file statically imports the chart component, the chart code is in the main bundle and defer has nothing to split. The template reference inside `@defer` is the dependency the compiler can move. A TypeScript import of the same class in the parent pulls it back.

Standalone components make this natural: the chart component imports `NgxChartsModule` or similar; the route component does not.

## Triggers that match admin behavior

> **Watch:** A when flag you set immediately never waits, and an empty @error block turns a failed chunk into a blank card.

| Trigger | Use on a dashboard | Avoid |
| --- | --- | --- |
| `on viewport` | Below-fold tables | The hero KPI |
| `on idle` | Secondary, cheap widgets | Anything that must be visible at first paint |
| `on interaction` | Charts, exports, "show raw JSON" | The only path to a required field |
| `on timer(5s)` | Rarely; a delayed non-critical tip | Data the user is staring at an empty box for |
| `when cond` | A tab index or a feature flag signal | An expression that is true on init (that is eager) |

`when` re-checks a component expression. `@defer (when activeTab() === 'audit')` is appropriate for a tab strip you already rendered. Do not also fetch the tab body in the parent.

`on hover` is a poor primary trigger for a dashboard card. Keyboard users never hover. Prefer `on interaction` or `on viewport`.

Prefetch combinations worth memorizing:

- `@defer (on viewport; prefetch on idle)` for below-fold content you expect most users to reach.
- `@defer (on interaction; prefetch on idle)` for a chart: the bytes arrive early, the chart library does not execute until the click, and the API is not hit until then.

## ASP.NET Core: one widget, one cheap query

> **Watch:** Splitting the client is cosmetic if the API still builds one giant dashboard DTO and the browser throws most of it away.

Deferring the client without shaping the API just moves the wait. Give each panel a route that cannot return the world.

```csharp
app.MapGet("/api/admin/summary", async (IDashboardReader db, CancellationToken ct) =>
{
    var summary = await db.ReadSummaryAsync(ct);
    return Results.Ok(summary);
}).RequireAuthorization("AdminViewer");

app.MapGet("/api/audit", async (
    int? take,
    IAuditReader db,
    CancellationToken ct) =>
{
    var size = Math.Clamp(take ?? 50, 1, 100);
    var rows = await db.ReadLatestAsync(size, ct);
    return Results.Ok(rows);
}).RequireAuthorization("AdminViewer");

app.MapGet("/api/reports/revenue", async (
    IRevenueReader db,
    CancellationToken ct) =>
{
    var series = await db.ReadDailyAsync(days: 30, ct);
    return Results.Ok(series);
}).RequireAuthorization("AdminViewer");
```

Rules that keep the dashboard honest:

- Clamp `take`. A deferred table that requests `take=100000` is worse than an eager one because it looks lazy in the UI and is not lazy on the server.
- Do not run the revenue aggregation inside the summary endpoint "while you are there."
- Project columns. Audit rows do not need the full JSON payload of the event if the table shows time and action. Offer a detail route on click.
- Authorize every widget route. The chart chunk is public static JS; the data is not.
- Cancellation matters. If the user navigates away before the deferred call returns, pass the `HttpClient` cancellation through to the API and honor `CancellationToken` in the query. An abandoned dashboard should not keep a SQL call pinned.
- Cache only when the number is allowed to be stale. A KPI like "open incidents" can use a short `OutputCache` or a memory cache on the server. A per-user audit table usually should not be cached on a shared key.

Pagination belongs on the table endpoint even if the first paint only shows 50 rows. `@defer` is not a paging strategy. When the user clicks "next," that is an ordinary request from the already-created component. Virtual scroll inside the deferred component is for DOM size, not for chunk size.

## Hosting the chunks

Angular emits extra JS files for deferred blocks. ASP.NET Core `UseStaticFiles` or `MapStaticAssets` must serve the whole `browser` output, not a hand-picked list of `main` and `polyfills`. If you put the SPA behind a CDN, cache the hashed chunk names aggressively and do not cache `index.html` the same way, or an old index will point at chunks you deleted.

Development: `ng serve` handles chunks. If you proxy `/api` to Kestrel, do not proxy `*.js` to Kestrel or the deferred chunk 404s on the API. The dev-server proxy config should match `/api` only.

Measure before and after in the browser performance panel or the Angular build stats (`ng build` shows chunk names). You want the chart library absent from the initial route chunk and present in a lazy chunk. If the stat file still lists the chart inside `main`, there is a static import to remove. Lighthouse "total blocking time" on first load is the number that should move. Time-to-interactive of the chart itself will not improve; you chose to delay it.

## OnPush is a different knob

`ChangeDetectionStrategy.OnPush` (and signals, which mark the component dirty when the signal is read in the template) reduces how often Angular walks a component. A dashboard can be OnPush and still download every chart on startup if the components are eager. A dashboard can use default change detection and still be fast to first paint if the heavy children are deferred and the eager template is small.

Use OnPush or signals on the audit table **after** it exists, because a 50-row table that refreshes from a timer should not dirty the whole shell. That work is change detection. Do not write it up as the reason the initial bundle shrank. Reviewers who only add `OnPush` and leave the chart import in the shell will see no bundle change.

`@placeholder` content is part of the parent template. Keep it plain HTML so the placeholder is not itself a heavy component.

## Pitfalls

- **Fetching in the parent, rendering in the child.** Network waterfall unchanged.
- **Static import of the heavy component** in the route file "so the type is handy." The compiler then has no boundary.
- **`when true` or `when loaded()` that you set immediately.** The block never waits.
- **Deferring a component that provides a singleton the shell needs** (`providedIn` is fine; a component-level provider that the parent also injects is not inside the deferred chunk's lifetime).
- **Empty error block.** Chunk load failures (bad deploy, blocked CDN) then look like a blank card. Always write `@error`.
- **Nested defer that triggers together.** An audit panel that immediately defers a chart on idle still pulls the chart when the panel appears. Nest only when the inner trigger is stricter.
- **Server still builds a giant dashboard DTO** and the client throws most of it away. Split the endpoints or the client split is cosmetic.
- **No cancellation** on the summary call plus the deferred calls. A quick navigation between admin pages multiplies SQL.
- **Accessibility afterthought.** Placeholder text that is the only label, and a chart with no table alternative. Pair this design with a live region outside the block; the pattern is on the [aria-live post](/blog/angular-accessible-forms-aria-live).

## Verification

1. Build and open the chunk report. The chart package is not in the initial admin chunk.
2. Load `/admin` with the network panel throttled. The summary call runs. The audit and revenue calls do not.
3. Scroll to the audit placeholder. One chunk request, then one `/api/audit?take=50`. The response is capped.
4. Do not click the chart. Confirm no revenue request and no chart chunk execution (the prefetch may download the file; the XHR for data should still be absent until interaction).
5. Click the chart button. The revenue call happens once.
6. Call `/api/audit` with no token. Expect 401, including when the chunk loaded.
7. Deploy to a clean static host and trigger defer. The chunk URL returns 200, not the SPA fallback HTML. If it returns HTML, your rewrite rule swallowed the file and the `@error` block should appear.

## Boundaries

This is not the OIDC setup for the admin API. Tokens are assumed to exist; wire them with [OIDC code flow and PKCE](/blog/angular-oidc-pkce-aspnet-core) if the dashboard is a public SPA. This is not OpenAPI, Aspire, or Key Vault. Those do not decide your defer triggers.

When the initial document is the shell plus one summary call, and each heavy widget has its own trigger and its own bounded endpoint, the defer split is doing the job.

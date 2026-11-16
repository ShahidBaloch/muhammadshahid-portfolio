---
title: "Angular Lazy Loading: loadComponent, loadChildren, and Preloading"
description: "Angular lazy loading for standalone apps: loadComponent and loadChildren routes, lazy route guards, preloading strategies, and how to check that your chunks really split."
date: "2026-11-16"
category: "angular"
tags: ["Angular", "Performance", "Routing", "TypeScript"]
related:
  - angular-defer-admin-dashboards
  - angular-standalone-components
  - angular-build-budgets-ci
faq:
  - q: "What is lazy loading in Angular?"
    a: "Downloading a part of the app only when the user needs it, usually when they navigate to a route. The first page loads faster because the browser downloads less JavaScript up front."
  - q: "What is the difference between loadComponent and loadChildren?"
    a: "loadComponent lazy-loads a single standalone component for one route. loadChildren lazy-loads a whole set of child routes, usually a feature area like admin or billing."
  - q: "Does lazy loading work with standalone components?"
    a: "Yes, and it's simpler than with NgModules. You point loadComponent or loadChildren at a dynamic import, and there's no module file needed."
---

A common sight in older business apps: the login screen downloads the code for reports, billing, admin settings and a charting library that most users never open. The first page feels slow, and nobody can say why. Angular lazy loading usually fixes most of that in an afternoon, without changing a single feature.

This post covers how Angular lazy loading works in today's standalone apps, and how to check it's actually doing what you think.

## The idea

By default, everything you import ends up in one big main bundle. With lazy loading, a route points at a **dynamic `import()`**. The build tool sees that and puts the target code into a separate chunk file. The browser only downloads that chunk when the user goes to that route.

## Project layout

Lazy loading works best when each feature lives in its own folder and nothing outside the folder imports from inside it:

```text
src/app/
├── app.config.ts
├── app.routes.ts              # top-level routes, lazy entries only
├── core/                      # auth, interceptors, layout (eager)
│   ├── auth.guard.ts
│   └── shell.component.ts
├── features/
│   ├── dashboard/
│   │   └── dashboard.component.ts
│   ├── billing/
│   │   ├── billing.routes.ts  # child routes for /billing
│   │   ├── invoice-list.component.ts
│   │   └── invoice-detail.component.ts
│   └── admin/
│       ├── admin.routes.ts
│       └── users.component.ts
└── shared/                    # small, truly shared UI pieces
```

If `dashboard.component.ts` imports something from `features/billing/`, that code gets pulled into the dashboard chunk too, and the split is wasted.

## loadComponent: one lazy page

```typescript
// app.routes.ts
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
];
```

If the component is the file's `default` export, you can shorten it to `loadComponent: () => import('./features/dashboard/dashboard.component')`.

## loadChildren: a whole lazy feature

For a feature with several pages, lazy-load its route file:

```typescript
// app.routes.ts
{
  path: 'billing',
  canMatch: [authGuard],
  loadChildren: () => import('./features/billing/billing.routes').then(m => m.BILLING_ROUTES),
}
```

```typescript
// features/billing/billing.routes.ts
import { Routes } from '@angular/router';
import { InvoiceListComponent } from './invoice-list.component';
import { InvoiceDetailComponent } from './invoice-detail.component';

export const BILLING_ROUTES: Routes = [
  { path: '', component: InvoiceListComponent },
  { path: ':id', component: InvoiceDetailComponent },
];
```

The billing components are imported normally *inside* the billing route file. That's fine: the whole file is already in the lazy chunk.

## Use canMatch, not canActivate, for lazy areas

Look at the `canMatch: [authGuard]` above. With `canActivate`, Angular may still download the chunk before deciding the user can't go there. With `canMatch`, if the guard says no, the route doesn't match and the chunk isn't downloaded. For admin areas, that also means users without access never even receive that code. (The server still has to check permissions on every API call; hiding code isn't security.)

If you're wiring guards to an ASP.NET Core backend, my [Angular auth guard](/blog/angular-auth-guard-aspnet-core) post goes deeper.

## Preloading: lazy, but not slow

Pure lazy loading has a downside: the first click on a new area waits for its chunk to download. Preloading fixes that by fetching lazy chunks in the background after the app has started:

```typescript
// app.config.ts
import { provideRouter, withPreloading, PreloadAllModules } from '@angular/router';

export const appConfig = {
  providers: [provideRouter(routes, withPreloading(PreloadAllModules))],
};
```

`PreloadAllModules` preloads every lazy route, including ones loaded with `loadComponent`, despite the name. It's a good default for small and medium apps. For big apps, write a custom strategy that only preloads routes you flag with `data: { preload: true }`, so you don't download the admin area for every user.

## Lazy routes vs @defer

Angular lazy loading through the router splits code **per page**. `@defer` splits code **inside a page**: a heavy chart or grid loads when it scrolls into view or the browser is idle. They work well together. I wrote about using [@defer on admin dashboards](/blog/angular-defer-admin-dashboards) separately.

## Check that it actually worked

Don't assume. Two quick checks:

1. **Build output.** Run `ng build` and read the list. You should see "Lazy chunk files" with names like `billing-routes` and their sizes. If your feature isn't listed, something eager is importing it.
2. **Network tab.** Open DevTools, filter by JS, load the home page, then navigate to billing. The billing chunk should appear only on navigation (or shortly after startup if you preload).

Then lock it in with [build budgets in CI](/blog/angular-build-budgets-ci), so the main bundle can't quietly grow again.

## Mistakes that undo lazy loading

- **Importing a feature component in `app.routes.ts` "just for a type".** A normal `import` at the top of the file makes it eager. Use `import type` if you only need the type.
- **A shared barrel file** (`shared/index.ts`) that re-exports everything, including heavy pieces. Importing one small thing from it can drag in the rest.
- **Providing feature services in root** that import big libraries. Provide them in the lazy route's `providers` array instead.
- **Lazy-loading tiny pages.** Each chunk is an extra request. A 3 KB settings page isn't worth splitting; a 400 KB reporting area is.

## Summary

Angular lazy loading is one of the cheapest performance wins you can get. Point routes at dynamic imports with `loadComponent` or `loadChildren`, guard lazy areas with `canMatch`, add preloading so navigation stays snappy, and check the build output to prove the chunks split. If you're also moving off NgModules, [standalone components](/blog/angular-standalone-components) make all of this simpler.

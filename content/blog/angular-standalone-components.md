---
title: "Angular Standalone Components vs NgModules"
description: "When an Angular app should bootstrap with standalone components instead of NgModules, and how provideHttpClient and provideRouter replace the old imports."
date: "2026-09-18"
updated: "2026-09-18"
category: "architecture"
tags: ["Angular", "Standalone", "TypeScript", "ASP.NET Core"]
related:
  - angular-dotnet-integration
  - angular-signals-aspnet-core
  - angular-interview-questions-aspnet-core
faq:
  - q: "Do I still need an NgModule in a new Angular app?"
    a: "No. bootstrapApplication plus providers is enough. Keep an NgModule only while an old library still exports one and you have not touched that feature."
  - q: "Can I use HttpClientModule and provideHttpClient together?"
    a: "Do not. Two registrations for the same client is how interceptors run twice or not at all. Pick provideHttpClient in a standalone app."
  - q: "Do standalone components change the ASP.NET Core API?"
    a: "No. The API still returns the same JSON. Standalone is how the browser app is wired, not a new contract."
---

A new Angular app does not need `AppModule`. `bootstrapApplication` starts one component and a list of providers. NgModules still run. They are not the default shape to copy into a new feature.

Hub: [Architecture](/learning/architecture). Pair this with [Angular and .NET integration](/blog/angular-dotnet-integration). Interview prompts that mention this in passing live on [Angular interview questions](/blog/angular-interview-questions-aspnet-core). Do not treat that list as this guide.

## Real-world analogy

An NgModule is a department that must sign every new hire before they can sit down. A standalone component is a person with their own badge who declares the tools they use. The building (the API, the router, HTTP) is still shared. You stop making every hire walk through one department desk.

## Worked example

A feature module imports `HttpClientModule`, `RouterModule.forChild`, and a shared `CoreModule` that also imports `HttpClientModule`. One interceptor refreshes the token. After a lazy load, a 401 fires the refresh twice because HTTP was registered twice. The standalone version deletes the feature module. The route uses `loadComponent`. `main.ts` calls `provideHttpClient` once, with the interceptor. The second refresh disappears because there is one client.

| Old wiring | Standalone wiring |
|---|---|
| `platformBrowserDynamic().bootstrapModule(AppModule)` | `bootstrapApplication(AppComponent, { providers })` |
| `RouterModule.forRoot` | `provideRouter(routes)` |
| `HttpClientModule` | `provideHttpClient(...)` |
| `loadChildren: () => import(...).then(m => m.FeatureModule)` | `loadComponent: () => import(...).then(m => m.Page)` |

## Code

```typescript
bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
});
```

Leave an existing NgModule in place until you are in that folder for a real change. A weekend rewrite of every module does not change what the API returns. Screen state after this wiring is the [signals](/blog/angular-signals-aspnet-core) post, not a second copy of it.

The shop screens that load this way sit in [Ecom_NET10](/work/ecom-net10).

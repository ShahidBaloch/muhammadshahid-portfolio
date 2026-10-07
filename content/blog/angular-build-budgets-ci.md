---
title: "Angular Build Budgets and CI Gates in a .NET Monorepo"
description: "Angular build budgets fail CI when a production bundle exceeds maximumError. The limit counts raw emitted bytes, not the gzip size on the wire."
date: "2026-10-03"
category: "architecture"
tags: ["Angular", "ASP.NET Core", "CI", "Performance", "GitHub Actions"]
related:
  - github-actions-cicd-aspnet-core-angular
  - angular-standalone-components
  - angular-onpush-change-detection
  - angular-ssr-hosted-aspnet-core
faq:
  - q: "How do Angular build budgets fail CI?"
    a: "Put maximumError on the production configuration. ng build --configuration=production exits non-zero when a budget is exceeded. A GitHub Actions step that runs that command fails the workflow. maximumWarning alone does not fail CI."
  - q: "Do budgets measure gzip size?"
    a: "No. The CLI compares the uncompressed size of emitted files. A bundle that is 500 kB raw may be much smaller on the wire. Set the error line from the raw size you are willing to ship, then check gzip separately if you care about transfer."
  - q: "Why did ng build succeed locally but fail in CI?"
    a: "CI runs the production configuration. A budget on that target does not apply to ng serve or a development build. Run the same ng build configuration the pipeline runs."
---

**Angular build budgets in a .NET monorepo** are size ceilings in `angular.json` that make `ng build` fail when the production bundles grow past a limit you chose. CI treats that non-zero exit as a broken build, the same way it treats a failed `dotnet test`.


```text
pull request
  -> npm ci
  -> ng build --configuration=production
       budgets ok    -> exit 0 -> dotnet test / publish may continue
       maximumError  -> exit 1 -> workflow red, no deploy
```

Metaphor: a budget is a luggage scale at the gate, not a lecture about packing. Warning is the agent mentioning you are close. Error is the agent refusing the bag. If the flight (`dotnet publish`) never walks past that scale, the bag still boards.

**New to this** stay here. **The rest of the workflow** see [GitHub Actions for ASP.NET Core and Angular](/blog/github-actions-cicd-aspnet-core-angular). **How the SPA is hosted** see [Angular SSR on ASP.NET Core](/blog/angular-ssr-hosted-aspnet-core) only if you server-render; budgets still apply to the browser bundles. **Change detection** and **standalone components** affect size but are not this page: [OnPush](/blog/angular-onpush-change-detection), [standalone](/blog/angular-standalone-components).

You already have a solution that contains both a `.csproj` and a `ClientApp` or `src/web` Angular project.

## How Angular build budgets fail CI

> **Watch:** maximumWarning still exits 0. Only maximumError fails CI. The number is raw emitted bytes, not a gzip transfer size copied from a Lighthouse report.

In `angular.json`, under the production configuration of the `build` target:

```json
{
  "projects": {
    "web": {
      "architect": {
        "build": {
          "builder": "@angular/build:application",
          "configurations": {
            "production": {
              "budgets": [
                {
                  "type": "initial",
                  "maximumWarning": "500kB",
                  "maximumError": "1MB"
                },
                {
                  "type": "anyComponentStyle",
                  "maximumWarning": "4kB",
                  "maximumError": "8kB"
                }
              ],
              "outputHashing": "all"
            }
          }
        }
      }
    }
  }
}
```

The `application` builder (Angular 17 and later) and the older `browser` builder both honor this array. Types you will actually use:

| Type | What it sums or scans |
|---|---|
| `initial` | Bundles the browser must load to bootstrap |
| `all` | Initial plus every lazy chunk |
| `any` | The largest single bundle |
| `anyScript` | The largest JS file |
| `bundle` with `name` | One named bundle, when you need a tighter cap than `any` |
| `anyComponentStyle` | The largest component CSS |

`maximumWarning` prints a warning and still exits 0. `maximumError` prints an error and exits non-zero. CI that only "looks at the log" will ship warnings forever. Put the real ceiling on `maximumError`.

Sizes are **uncompressed emitted files**. The CLI does not gzip them before comparing. Do not paste a Lighthouse transfer number into `maximumError`. A 180 kB gzip main bundle can be over 600 kB raw and fail a `500kB` error budget that you copied from a blog's transfer column. Pick the raw number from `ng build` output on a build you accept, then leave headroom.

`baseline` and percentage thresholds exist. Prefer absolute `maximumError` in CI. A percentage against a drifting baseline fails or passes for reasons nobody can explain in the pull request.

## Where the monorepo hides the gate

> **Watch:** dotnet publish that runs a development ng build, or ContinueOnError on that Exec, never walks past the scale. ng serve does not evaluate production budgets.

A typical layout:

```text
Clinic.sln
  src/Clinic.Api/Clinic.Api.csproj
  src/web/angular.json
  src/web/package-lock.json
```

Two ways the budget gets skipped:

1. **CI runs `dotnet publish` only.** The csproj does not invoke `ng build`, or it invokes `ng build --configuration=development`. Development configurations usually have no budgets. The workflow is green and the production SPA is unbounded.
2. **CI runs `ng build` without `--configuration=production`.** Default configuration might be production in recent CLIs, but do not rely on memory. Pass the name.

Make the publish path call the same configuration you gate in CI. A small npm script prevents drift:

```json
{
  "scripts": {
    "build:prod": "ng build --configuration=production"
  }
}
```

If `Clinic.Api.csproj` copies `src/web/dist` into `wwwroot` during publish, the target must run `npm run build:prod`, not `npm start`. Spa proxy (`ng serve`) is for local F5 only. It never evaluates budgets.

```xml
<Target Name="BuildAngular" BeforeTargets="Build" Condition="'$(Configuration)' == 'Release'">
  <Exec WorkingDirectory="$(MSBuildProjectDirectory)/../web" Command="npm ci" />
  <Exec WorkingDirectory="$(MSBuildProjectDirectory)/../web" Command="npm run build:prod" />
</Target>
```

`npm ci` on every `dotnet build -c Release` is slow on laptops. Keep the target, and let developers opt out with `/p:SkipAngular=true` locally if you add that condition. CI must not set the skip property. The point of the gate is that Release cannot succeed when the budget fails. `Exec` fails the MSBuild target when `ng` exits non-zero. That is the behavior you want.

Do not `ContinueOnError="true"` on that `Exec`. That is the luggage scale with the alarm unplugged.

## GitHub Actions step

> **Watch:** npm install can float a dependency and change the size of the same commit. Use npm ci and the lockfile.

The full restore/test/deploy story is the [pipeline post](/blog/github-actions-cicd-aspnet-core-angular). The budget slice is this job, and it should fail before you build a container:

```yaml
jobs:
  web-budgets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: src/web/package-lock.json
      - name: Install and enforce production budgets
        working-directory: src/web
        run: |
          npm ci
          npm run build:prod
```

`npm ci` respects the lockfile. `npm install` can float a dependency and change bundle size between two runs of the same commit. Cache the npm directory, not `node_modules` you copied by hand.

Run this job in parallel with `dotnet test`. Do not bury it after deploy. A budget failure that is discovered on the production slot is just a slow way to read `angular.json`.

Pin Node to the major version you develop on. A different Angular CLI on a developer's laptop versus CI is how "it builds here" starts.

## Finding out which import broke the budget

`ng build --configuration=production` names the bundle that failed. That is enough for a single surprise import of a chart library into the main component. When the failure is "initial exceeded by 40 kB" and several lazy routes moved, generate stats:

```bash
npx ng build --configuration=production --stats-json
```

The `application` builder writes a browser stats file under the output path. Open it with a treemap you already trust (`source-map-explorer` or the esbuild metafile if you enabled it). Look for:

- A library imported from a barrel `index.ts` that pulls the whole package into the initial chunk.
- `moment` locales, or an icon font registered globally.
- A route component that is eager because the router `loadComponent` was replaced with a static import "temporarily".

The failure this gate is there to catch is a static import that pulls a heavy component into the initial bundle. With the `maximumError` already set on `initial`, `ng build --configuration=production` exits 1, the `web-budgets` step goes red, and the Release `Exec` fails the same way:

```typescript
import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
// Static import. ReportsComponent and its chart dependency join the initial bundle.
import { ReportsComponent } from "./reports/reports.component";

@Component({
  selector: "app-root",
  imports: [RouterOutlet, ReportsComponent],
  template: `<app-reports /><router-outlet />`,
})
export class AppComponent {}
```

The log names the `initial` budget and the process exit code is 1. `maximumWarning` alone would print and still exit 0. Fix by importing the heavy module from a lazy route:

```typescript
export const routes: Routes = [
  {
    path: "reports",
    loadComponent: () => import("./reports/reports.component").then((m) => m.ReportsComponent)
  }
];
```

That moves weight from `initial` to a lazy chunk. If you also set an `all` budget, the weight still counts. `initial` protects first paint. `all` protects a team that lazy-loads everything and still ships a huge app. Use both when the product is one SPA with many features. Do not set `all` so low that the first legitimate feature cannot land.

Component style budgets catch a global stylesheet stuffed into a component's `styles` array. They do not catch `styles.scss` at the app root. Watch the app stylesheet as part of `initial`.

## Source maps and localize

Production source maps, if you emit them, are separate files. Confirm whether your CLI version includes them in `any`. If a budget suddenly fails after enabling hidden source maps, check the failing file name before you rip out a feature. Maps belong on the error-reporting upload path, not necessarily in `wwwroot`.

`ng extract-i18n` and localize builds can emit one set of bundles per locale. Enforce budgets on each localized build you ship, or you will gate `en` and deploy an oversized `ar`. That is a loop in CI, not a second budget type.

## Pitfalls

- **Budgets only on the configuration you do not build.** A perfect production block does nothing when publish uses development.
- **Warning treated as a gate.** The log goes orange, the exit code stays 0, deploy continues.
- **Copying gzip numbers into `maximumError`.** Healthy apps fail on day one and the team deletes the budget.
- **`ContinueOnError` or `|| true`** in the workflow script so the SPA "never blocks the API". Then you do not have a gate.
- **Checking budgets with `ng serve`.** The dev server does not apply production budgets.
- **Ignoring `package-lock.json`.** CI installs different patch versions and the failure is not reproducible.
- **Raising the ceiling in the same PR that blew it**, with no note. Sometimes the feature is legitimately large. Then raise `maximumError` on purpose and say why in the PR. A silent bump teaches everyone the number is decorative.

## Verification

Local, on a clean tree:

1. `npm run build:prod` exits 0. The log lists each budget as pass or a warning you accept.
2. Temporarily import a large unused library from `AppComponent`. Build again. The log names `initial` (or the bundle) and the process exit code is 1. `echo $LASTEXITCODE` in PowerShell is 1.
3. Remove the import. Build exits 0.
4. Set only `maximumWarning` below the current size. Build exits 0 and prints a warning. Put the limit back on `maximumError` if you meant to fail.

CI:

1. Open a pull request with the bad import. The `web-budgets` job is red. Deploy jobs that `needs: web-budgets` do not run.
2. Confirm the green workflow on main uses `--configuration=production` (the log prints `production` and the budget table).
3. `dotnet publish -c Release` on the API project fails when the Angular target is enabled and the budget fails. It must not produce a `wwwroot` from yesterday's dist.

Optional: store the build log as an artifact so reviewers see the table without re-running locally.

## What this page does not cover

OIDC, tests, container build, and App Service deploy steps are the pipeline article. Runtime performance (OnPush, SSR, CDN cache headers) changes user-perceived speed and only sometimes changes emitted bytes. Budgets do not measure server CPU. They measure the files you are about to ship.

**Related:** [GitHub Actions CI/CD](/blog/github-actions-cicd-aspnet-core-angular) | [Standalone components](/blog/angular-standalone-components) | [OnPush](/blog/angular-onpush-change-detection) | [Angular SSR hosted on ASP.NET Core](/blog/angular-ssr-hosted-aspnet-core)

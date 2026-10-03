---
title: "Angular Jest vs Vitest for ASP.NET Core SPA Unit Tests"
description: "Angular Jest vs Vitest for an ASP.NET Core SPA: CLI default, jsdom, what a Jasmine migration actually changes, and the tests that stay in .NET."
date: "2026-10-03"
category: "testing"
tags: ["Angular", "Vitest", "Jest", "ASP.NET Core", "Unit Testing"]
related:
  - testcontainers-aspnet-core-sql-redis
  - github-actions-cicd-aspnet-core-angular
  - angular-reactive-forms-validation-problemdetails
  - angular-ssr-hosted-aspnet-core
faq:
  - q: "Does a new Angular CLI app use Jest or Vitest?"
    a: "Current Angular CLI docs use Vitest as the default unit-test runner for new projects, via the unit-test builder and jsdom. Jest is a community setup (typically jest-preset-angular), not the CLI default. Karma is still supported for existing projects."
  - q: "Should I rewrite a working Jest suite to Vitest?"
    a: "Not for sport. Vitest speaks a Jest-like API, but the rewrite still costs CI time and flake risk. Stay on Jest if it is stable. Move when you are already leaving Karma, or when the Jest build is the thing breaking every Angular upgrade."
  - q: "Can either runner test my ASP.NET Core API?"
    a: "No. Both run the Angular unit tests in Node (or a browser mode you opt into). HTTP contracts, EF, and auth still belong in .NET tests. Pointing Jest or Vitest at a real API is an integration test you did not mean to write."
---

**Angular Jest vs Vitest** is a runner choice for unit tests in an SPA that happens to be hosted by ASP.NET Core. It is not a choice about how you test the API. Jest (through `jest-preset-angular`) and Vitest (through the Angular CLI unit-test builder) both execute component and service tests outside your C# process.

```text
Angular unit tests  -->  Vitest (CLI default on new apps)  or  Jest (preset)
                              |
                              +--> jsdom or a real browser mode
ASP.NET Core tests   -->  xUnit / NUnit + WebApplicationFactory
                              |
                              +--> Testcontainers for SQL and Redis
```

The SPA runner and the API runner meet in CI, not in one `describe` block.

**API integration tests** -> [Testcontainers](/blog/testcontainers-aspnet-core-sql-redis). **Pipeline** -> [GitHub Actions CI](/blog/github-actions-cicd-aspnet-core-angular). **Form tests you will actually write** -> [reactive forms and ProblemDetails](/blog/angular-reactive-forms-validation-problemdetails).

Search intent for **angular jest vs vitest** is a decision: which runner to standardize on for an ASP.NET Core-backed Angular app, and which differences are real versus marketing.

## What is Jest versus Vitest in this Angular repo?

> **Watch:** A 2023 post that says Angular chose Jest is dated. New CLI apps default to Vitest. Do not leave Karma and Vitest both wired after a migration.

**Vitest, as the CLI wires it.** Angular's testing overview documents Vitest as the default for new CLI projects. `ng test` uses the `@angular/build:unit-test` builder, `runner` defaults to `vitest`, and the DOM is `jsdom` unless you switch to `happy-dom` or a browser provider. The CLI constructs the Vitest config from `angular.json`. You may point at a custom `vitest` config for plugins, and the Angular team is explicit that a hand-written config and third-party plugins are yours to support. New projects already depend on `vitest` and `jsdom`.

Karma remains supported for existing apps. The migration guide from Karma to Vitest is documented and marked experimental, and it assumes the `application` build system (the default on new projects, not a guarantee on an old `.browser` builder app). There is a `refactor-jasmine-vitest` schematic for the assertion and spy style. "Experimental migration" means budget time; it does not mean Vitest itself is unofficial on new apps.

**Jest, as Angular teams actually install it.** There is no first-class `ng test --runner=jest` in that CLI story. You add Jest, `jest-preset-angular`, a `jest.config`, and usually a separate script from `ng test`. The preset's job is to compile Angular templates and handle `TestBed`. It works, a lot of suites are on it, and every major Angular upgrade is a chance the preset lags the framework by a few weeks. That lag is the real cost, not the syntax.

Historically the CLI team discussed shipping Jest, then later integrated Vitest instead of maintaining two Node runners that look alike. Treat blog posts from that in-between period ("the Angular team chose Jest") as dated. Trust the docs for the major you are on, and re-read them at the next major. Runner defaults have moved once already.

## Which differences should decide the runner?

| Question | Jest (`jest-preset-angular`) | Vitest (Angular CLI) |
|---|---|---|
| New CLI project default | No | Yes, per current Angular docs |
| Who ships the integration | Community preset | Angular team, with stated limits on custom configs |
| Existing Karma app | Manual migration | Documented path, called experimental |
| Assertions | Jest `expect` | Vitest `expect` (Jest-compatible, not Jasmine) |
| DOM | jsdom via the preset | jsdom by default; `happy-dom` optional; browser mode optional |
| Config surface | `jest.config` you own | `angular.json` test target, optional Vitest config file |
| Parallelism | Jest workers | Worker isolation is a Vitest option; the CLI has defaulted isolation to off so behavior stays closer to Karma |
| API tests | Out of scope | Out of scope |
| Speed claim | Depends on your suite | Depends on your suite; do not adopt either for a percent you have not measured |

A percent faster in someone else's repository is not a plan. If you care, time `ng test` and the Jest script on your suite, on CI hardware, with the cache cold and warm. Quote your numbers in the ADR. This article does not have them.

Browser mode is the other axis people collapse into "Jest vs Vitest." Both can run under jsdom, and jsdom is not a browser. Tests that need layout, real canvas, or a specific Chrome bug belong in a browser run (Vitest browser mode, or a leftover Karma target), not in a fight about the assertion library. Most component tests with `TestBed` and a mocked `HttpClient` do not need that, and they should stay in jsdom so CI does not download a browser it will not use.

## Write the HttpClient test the same way on either runner

> **Watch:** HttpTestingController must not call the real API. jsdom will not match Chrome for layout or time zone; set TZ when a test formats dates.

The runner does not fix a bad test. These are the unit tests that earn their keep on an ASP.NET Core SPA. They look almost the same in both runners if you use `expect` rather than Jasmine matchers.

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { OrderService } from './order.service';

describe('OrderService', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        OrderService,
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts the order and does not swallow a problem-details error', () => {
    const service = TestBed.inject(OrderService);
    let status = 0;
    service.create({ sku: 'AB-1', qty: 2 }).subscribe({
      error: (err: { status: number }) => { status = err.status; },
    });

    const req = http.expectOne('/api/orders');
    expect(req.request.method).toBe('POST');
    req.flush(
      { title: 'Validation failed', status: 400 },
      { status: 400, statusText: 'Bad Request' });
    expect(status).toBe(400);
  });
});
```

That file is `src/web/src/app/order.service.spec.ts`. Both runners execute it. Only the config and the CI command change. Do not leave both commands in the same job.

Vitest, which is what current Angular CLI projects run for `ng test`:

```json
{
  "projects": {
    "web": {
      "architect": {
        "test": {
          "builder": "@angular/build:unit-test",
          "options": {
            "runner": "vitest",
            "buildTarget": "web:build",
            "tsConfig": "tsconfig.spec.json"
          }
        }
      }
    }
  }
}
```

Jest, for a repo that already uses `jest-preset-angular`. `setup-jest.ts` calls `setupZoneTestEnv()` from the preset, and the config points at the same spec:

```typescript
import type { Config } from "jest";

const config: Config = {
  preset: "jest-preset-angular",
  setupFilesAfterEnv: ["<rootDir>/setup-jest.ts"],
  testMatch: ["**/order.service.spec.ts"],
};

export default config;
```

```typescript
import { setupZoneTestEnv } from "jest-preset-angular/setup-env/zone";

setupZoneTestEnv();
```

CI picks one of these and deletes the other. Vitest:

```yaml
- name: Angular unit tests
  working-directory: src/web
  run: npm ci && npx ng test --watch=false
```

Jest:

```yaml
- name: Angular unit tests
  working-directory: src/web
  run: npm ci && npx jest --ci
```

`HttpTestingController` never reaches Kestrel. That is the point. The day this test "needs the API up," it has become an integration test and it belongs in .NET, where you can use `WebApplicationFactory` and, when the database matters, Testcontainers. A Vitest browser run pointed at `https://localhost:5001` will fail whenever the API is down and will teach the team to retry CI. Do not do that in either runner.

Jasmine habits that break on both Jest and Vitest: `toBeTrue()`, `toBeFalse()`, `spyOn` without `jest.spyOn` / `vi.spyOn`, and `fakeAsync` only where `zone.js` is actually in the test setup. The schematic helps a Karma migration. It will not repair a Jest suite that mixed Jasmine matchers in by accident. Search for `toBeTruthy` is not sufficient; search for `spyOn(` and `.and.returnValue`.

Mocking modules differs in the details. `jest.mock` is hoisted by Jest's transformer. `vi.mock` is the Vitest equivalent and is also hoisted, but a custom Angular builder config can change when setup files run. If a test passes only because a mock was hoisted above an import, mark that test and keep the setup file in the runner's documented slot (`setupFiles` / the preset's `setup-jest.ts`, versus the CLI test setup). Do not copy a Jest setup file onto Vitest and assume the order survived.

Signals, `OnPush`, and standalone component tests do not prefer one runner. They prefer `TestBed.configureTestingModule` that imports the standalone component and overrides the service. If a suite is slow, it is usually compiling the whole `AppModule` per test. Fix that before you switch runners to chase speed.

## Run one SPA runner beside the .NET tests

> **Watch:** Run one runner in CI. Two coverage numbers for the same SPA means both rot, and a watch flag left on is why the job hangs.

One pipeline, two test commands, two result files. The Angular job does not restore the .NET SDK for unit tests, and the .NET job does not start Chrome for `HttpTestingController`.

Both commands are shown above. Keep one in this job and delete the other.



Cache `node_modules` or use `npm ci` with a lockfile. A runner upgrade (Vitest minor, jsdom major, `jest-preset-angular` major) gets a lockfile diff and a green run on a pull request, not a surprise on Monday. The same rule you already apply to NuGet.

Coverage thresholds belong to one runner. Two coverage numbers for the same SPA is how both rot. Publish the one you kept. Do not fail the API pipeline because the SPA coverage dip is unrelated, and do not skip API tests because the SPA job failed first; run them as parallel jobs so a broken component test does not hide a broken controller test.

Watch mode stays local. CI passes `--watch=false` (Vitest/Karma CLI) or Jest's `--ci` / `--watchAll=false`. A job that hangs is usually a watch flag, not a deadlocked `HttpClient`.

## Which runner should this repo pick?

| Situation | Choice |
|---|---|
| New Angular app in this portfolio, CLI current with the Vitest default | Vitest. Do not add Jest beside it. |
| Existing app still on Karma, and you are already doing the upgrade | Vitest, on a branch, using the migration guide, with the experimental label accounted for in the schedule. |
| Existing app on `jest-preset-angular`, suite is green, upgrades are calm | Stay on Jest. Revisit when the preset blocks an Angular major you need. |
| Someone wants both in CI "until we decide" | No. Two runners means two flakes and no decision. |

For this portfolio's shape (Angular SPA, ASP.NET Core API, tests that already separate `HttpTestingController` from `WebApplicationFactory`), the runner is a tool detail. The boundary between the two test stacks is the decision that matters. Vitest is the default I would start today because it is what the CLI generates and maintains. Jest remains a rational default for a suite that already exists. Neither one tests SQL, JWT validation, or EF interceptors.

## What goes wrong when the runners get mixed?

- Reading a 2023 "Angular is moving to Jest" post and ignoring the current CLI default. Check `ng test` and `angular.json` on your major.
- Running Karma and Vitest in the same project indefinitely because the migration schematic converted assertions but nobody deleted the Karma target.
- Expecting jsdom to match Chrome for focus, layout, or date parsing in a specific timezone. The box you develop on and the CI agent can disagree. Set `TZ` explicitly when a test formats dates.
- `TestBed` not reset between tests (`TestBed.resetTestingModule` is implicit in the Angular test helpers; a custom runner setup that forgets `destroyAfterEach` will leak modules). Flakes that only appear in worker isolation on are often this.
- Mocking `HttpClient` with a hand-rolled spy and also calling the real API "just for one test." That one test becomes a production dependency.
- Judging Vitest by the earliest experimental notes (no watch, no custom config). Those limits were real at introduction and are the wrong checklist if your installed CLI documents watch, reporters, and a config file. Read the version you pin.
- Porting Jasmine `async` / `fakeAsync` tests mechanically and disabling zones without reading the failure. A green conversion that no longer waits for the observable is a weaker test.

## How do you verify you kept one runner?

1. `angular.json` has one test builder. CI invokes that builder only. A repo search for the other runner's config file is either empty or documented as not run.
2. A new standalone service test uses `HttpTestingController` and `http.verify()`, and CI does not start the ASP.NET Core process for the Angular job.
3. The API pipeline still runs its own tests, in parallel, including the ones that need the database.
4. Date-sensitive tests set a timezone. One run on a UTC agent and one on a developer machine in UTC+5 either agree or are skipped on purpose.
5. Coverage is collected from the runner you kept, with a threshold you chose, not from both.
6. The ADR states the runner, the CLI major you checked, and the reason (new project versus existing green Jest suite). It does not claim a speedup you did not measure.

Choose the runner once, keep the HTTP boundary, and spend the next afternoon on a test that would have caught a broken order POST. The runner will not write that test for you.


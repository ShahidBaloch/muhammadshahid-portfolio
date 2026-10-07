---
title: "Accessibility CI with axe and Playwright on Angular + .NET"
description: "Angular axe and Playwright accessibility CI: host the SPA in ASP.NET Core, scan real routes, and fail on serious or critical violations. Same host as production."
date: "2026-10-03"
category: "testing"
tags: ["Angular", "Playwright", "axe", "Accessibility", "ASP.NET Core", "CI"]
faq:
  - q: "How do I run axe accessibility checks in CI for an Angular app?"
    a: "Drive the real SPA with Playwright, run @axe-core/playwright on the routes that matter, and fail the job when violations are serious or critical. Boot the Angular build and the ASP.NET Core host the same way production serves them, and sign in with a saved storage state so authenticated screens are included."
  - q: "Does axe replace manual accessibility testing?"
    a: "No. axe catches many WCAG failures that have a mechanical rule, especially name, role, contrast, and ARIA misuse. It does not prove a screen-reader user can complete a task, that focus order matches the visual order in a custom widget, or that the words on a button make sense."
  - q: "How does this differ from an accessible-forms guide or a general CI pipeline post?"
    a: "An accessible-forms guide is how to build inputs. The GitHub Actions post is the build and deploy pipeline. This page is only the accessibility gate: which pages, which impacts fail the build, and how auth and the ASP.NET Core host are wired."
---

**Accessibility CI with axe and Playwright on an Angular SPA hosted by ASP.NET Core** means a pull request boots your Angular SPA, opens real routes, runs axe-core in that browser, and fails on serious or critical violations. It is a regression gate. It is not a certification that the product is accessible.

```text
CI
  --> build Angular
  --> start ASP.NET Core (serves wwwroot + API)
  --> Playwright: login once, save storageState
  --> axe on /signin, /appointments/new, /invoices
  --> fail if impact is serious or critical
```

**New to this** - stay here for the gate. **Pipeline around it** - [GitHub Actions for ASP.NET Core and Angular](/blog/github-actions-cicd-aspnet-core-angular). **CSP that can break the app before axe runs** - [content security policy](/blog/content-security-policy-angular-aspnet-core).

## How do you fail CI with axe and Playwright on an Angular SPA?

Search intent for **angular axe Playwright accessibility CI** is a how-to. The team wants a red build when someone removes a label or breaks a dialog name. They do not want a 40-page WCAG report, and they do not want axe injected only in a developer's Chrome extension, where it never sees the pull request.

This page wires `@axe-core/playwright` to an Angular app that ASP.NET Core hosts, with authentication, a severity bar, and a CI job. It does not teach every ARIA pattern. Fix the violation axe names; do not suppress the rule to get green.

## When does this gate apply?

You already can build the Angular app and run it behind ASP.NET Core (`UseStaticFiles` / the SPA fallback, same origin as the API so cookies work). You have Playwright in the front-end project or in a `/e2e` folder. CI is GitHub Actions or anything that can run Node and a browser.

Skip a full browser gate for a class library with no UI. A one-page marketing site can still use this setup; it does not need the login half.

Axe rules overlap WCAG 2.0/2.1 A and AA when you ask for those tags. They do not cover every success criterion. Keep a short manual list (keyboard through checkout, one screen reader pass per release) outside CI. The gate stops known mechanical failures from shipping. The manual pass covers what the rule set cannot see.

## How do you install and configure Playwright?

From the folder that holds the Angular workspace:

```bash
npm install -D @playwright/test @axe-core/playwright
npx playwright install --with-deps chromium
```

`playwright.config.ts`:

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5080",
    trace: "on-first-retry"
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium-public",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /a11y\.public\.spec\.ts/
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/clinician.json"
      },
      dependencies: ["setup"],
      testMatch: /a11y\.spec\.ts/
    }
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "dotnet run --project ../src/Clinic.Api --urls http://127.0.0.1:5080",
        url: "http://127.0.0.1:5080",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
      }
});
```

The API project must serve the production Angular build from `wwwroot` in this mode, not `ng serve`. Dev server and API on two origins means cookie auth and CORS become the test, and you will "fix" accessibility failures that are really failed logins. Build the SPA first (`ng build`, output copied to `wwwroot`) in the CI job before Playwright starts. `dotnet run` then hosts the same files a deploy would.

If the API needs a database, use the test double or container you already trust in integration tests. Axe does not care about SQL, but a 500 page full of a stack trace will fail the heading rule and waste the afternoon. Seed one clinician and one appointment so the screens render real controls.

## How do you scan authenticated and anonymous routes?

> **Watch:** storageState saved from a personal account is a credential. Do not commit it. ng serve in CI is not the template you ship.

Anonymous routes (sign-in, signed-out errors) must be scanned signed out. Authenticated routes must be scanned signed in. Mixing them produces "heading missing" on a redirect to login and a false red build.

`e2e/auth.setup.ts` signs in once and writes storage state. Prefer a test-only user and a cookie session. If the SPA keeps a bearer token in memory only, expose a test login that completes the real UI once, then save storage. Do not commit the storage file. Generate it in CI.

```typescript
import { test as setup } from "@playwright/test";

setup("clinician storage", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(process.env.E2E_USER!);
  await page.getByLabel("Password").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/appointments");
  await page.context().storageState({ path: "e2e/.auth/clinician.json" });
});
```

The config above has a `setup` project, a public project with no storage state, and a Chromium project that depends on setup. Put `e2e/.auth/` in `.gitignore`. Secrets come from CI secrets, not the repo.

Sign-in is its own file, `e2e/a11y.public.spec.ts`, so a broken label fails before any authenticated route runs:

```typescript
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("axe sign-in", async ({ page }) => {
  await page.goto("/signin");
  await page.getByRole("heading", { name: "Sign in" }).waitFor();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical"
  );
  expect(blocking).toEqual([]);
});
```


The sign-in page itself is a separate test file that does **not** use that storage state. If sign-in is inaccessible, the setup project fails first, which is the correct outcome.

## How do you fail the build on serious axe violations?

> **Watch:** Failing on every moderate hit on day one gets the test deleted. Gate serious and critical, and do not scan only the home page.

```typescript
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const routes = ["/appointments", "/appointments/new", "/invoices"];

for (const route of routes) {
  test(`axe ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.getByRole("main").waitFor();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .exclude("#third-party-chat")
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );

    expect(blocking, format(blocking)).toEqual([]);
  });
}

test("axe choose-time dialog", async ({ page }) => {
  await page.goto("/appointments/new");
  await expect(page).toHaveURL(/\/appointments\/new/);
  await page.getByRole("button", { name: "Choose time" }).click();
  await page.getByRole("dialog", { name: "Choose time" }).waitFor();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical"
  );
  expect(blocking, format(blocking)).toEqual([]);
});

function format(violations: { id: string; impact?: string | null; help: string; nodes: { target: unknown }[] }[]) {
  return violations
    .map((v) => `${v.impact} ${v.id}: ${v.help} @ ${JSON.stringify(v.nodes[0]?.target)}`)
    .join("\n");
}
```

Wait for a landmark you control (`main`), not `networkidle`. Angular apps with polling never go idle, and the test will time out on a healthy page.

`exclude` is for a vendor widget you do not own and have documented. Do not exclude `main` because the first run was red. If a chat widget is in the product, either load it only outside tests with a flag or accept its violations. Hiding it in CSS does not remove it from the accessibility tree. Do not mount it in the CI environment if it is not part of the build under test.

Start by failing on `serious` and `critical`. Log `moderate` without failing if you need a week to clear contrast debt, but put a date on that exception in the test file and delete the exception. A gate that never fails is not a gate. Color contrast and missing names are the usual first failures. Fix the template (`<label>` or `aria-labelledby`, real button text, focusable controls that are not `div` click handlers). Do not wrap the page in `aria-hidden` to go green.

Dialogs: open them in the test, then run axe on the open state. A scan of the page behind a closed dialog does not see the focus trap or the missing dialog name. One test per critical dialog is worth more than twenty scans of the dashboard shell.

## Which ASP.NET Core details make the scan lie?

**Error pages.** A 500 or a login redirect can be a document with no `main`. Assert the URL and a heading before axe so the message is "auth failed," not a pile of landmark violations.

**Problem details in the UI.** Validation text must be associated with the control. Axe will flag an input with no accessible name; it will not know that your `422` body never reached the label. If the test fills a form, submit once with an error and scan again. That is still a mechanical check, and it catches error text that exists only as a red border.

**CSP.** A strict content security policy is good and can block Playwright's instrumentation if you forbid inline script in a way that breaks the app bundle, or if the test build is not the build CSP was designed for. If the page is blank, fix CSP for the hosted bundle before you tune axe. A blank page can still "pass" if you forget to wait for `main` and scan too early. The wait is the assertion that the app booted.

**Culture and i18n.** Run the gate in the language you ship. A missing translation that falls back to a key can still have a name and pass axe while being unusable. That is outside axe. Do not disable the gate for a second language; add the route with the locale prefix if those templates differ.

## How do you run the gate in CI?

On GitHub Actions, after the Angular build is copied where `dotnet run` expects it:

```yaml
- name: Build Angular into the API wwwroot
  working-directory: client
  run: npx ng build --configuration production --output-path ../src/Clinic.Api/wwwroot
- name: Install Playwright browsers
  working-directory: client
  run: npx playwright install --with-deps chromium
- name: Accessibility gate
  working-directory: client
  run: npx playwright test
  env:
    CI: "true"
    E2E_USER: ${{ secrets.E2E_USER }}
    E2E_PASSWORD: ${{ secrets.E2E_PASSWORD }}
```

`npx playwright test` runs the public spec with no storage state and the authenticated spec after `auth.setup.ts`. `ng serve` is not this job.

Upload `playwright-report` and traces on failure. The axe message in the annotation is enough to fix a missing label; the trace is how you see that the dialog never opened.

Run Chromium only in CI unless you have a specific engine bug. Accessibility trees differ slightly. One browser that always runs beats three that you disable when they flake. Retry once for infrastructure, not three times for a real violation. A violation is deterministic. If it flakes, you scanned before render or you scanned a third-party iframe that sometimes loads.

Do not `continue-on-error` this job. Do not restrict it to the main branch only. The point is the pull request.

## What do you still test by hand?

> **Watch:** axe does not prove a screen-reader user can finish the task. Do not turn color-contrast off globally because one brand gray failed.

Once a release, on a real page, not only in CI:

- complete the booked flow with keyboard only (no mouse), including any dialog the axe test opens
- one pass with a screen reader on the same flow (NVDA or VoiceOver)
- zoom to 200% and check the appointment form does not trap content off-screen

Axe's `bypass` and `tabindex` rules help. They do not click your datepicker. If the datepicker is a `div` grid, add a keyboard test in Playwright (`press("Tab")` and expect focus inside the dialog) beside axe. That assertion is not an axe rule, and it is still CI.

## What fails in review?

- Scanning only `/` because that was the sample. The regressions land on the form you added last.
- Using `ng serve` in CI and a different template than production (dev-only overlays, missing production error handler).
- Saving storage state from a personal account and committing the JSON. That file is a credential.
- Disabling `color-contrast` globally because brand gray failed. Fix the token, or exclude one known marketing image with a comment and a ticket. Do not turn the rule off for inputs.
- `expect(results.violations).toEqual([])` on day one, drowning in moderate noise, then deleting the test. Filter by impact, file issues for the rest, and keep the filter strict for serious and critical.
- Running axe inside unit tests on a shallow component harness that has no router, no heading, and no real label wiring. Component tests are useful for your own assertions. The CI gate must load the route.
- Ignoring iframe content by accident. `@axe-core/playwright` can include or exclude frames. A payment frame you embed is part of the product. Exclude it only if the vendor contract says they test it and your scan cannot see inside a cross-origin frame anyway. Cross-origin frames are not fully visible to axe. Say that in the test comment so nobody thinks the card field was checked.

## How do you verify the gate is real?

1. Remove the accessible name from a control on `/appointments/new`. The pull request fails, and the log names the rule and the target. Restore the name. The job passes.
2. Open a dialog with no accessible name in a branch. A test that only visits the list stays green. The dialog test goes red. If you do not have the dialog test, add it; the verification just showed the hole.
3. Point the test at a build that redirects to `/signin` because secrets were missing. The failure names the URL or the missing `main`, not a hundred contrast hits on the login page, because you asserted the route first. If you instead see login-page violations on an authenticated test, the storage state did not load.
4. Confirm `e2e/.auth/*.json` is gitignored and absent from the workflow logs (Playwright trace artifacts can contain cookies; restrict artifact access).
5. Run the job twice on unchanged code. It is stable. Flakes get fixed before you add routes.

## How do you keep the gate small enough to stay required?

Three routes, open dialogs, serious and critical, one browser, same host as production. Expand the route list when a feature adds a screen, in the same PR as the screen. A gate that grows only when someone remembers a quarterly task will not be there the week a label disappears.


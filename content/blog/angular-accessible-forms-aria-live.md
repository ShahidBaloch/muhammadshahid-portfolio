---
title: "Accessible Angular Forms with aria-live and ASP.NET Core"
description: "Accessible Angular forms with aria-live: labels, ASP.NET Core field errors, and a live region that already exists when @defer swaps content in."
date: "2026-10-03"
category: "api-design"
tags: ["Angular", "Accessibility", "ARIA", "ASP.NET Core", "ProblemDetails"]
faq:
  - q: "Is a red border enough to show an Angular form error?"
    a: "No. Color is not a name or an error message. Tie the input to a visible label and to an error element with aria-describedby, and set aria-invalid when the field is invalid."
  - q: "Where should aria-live go when @defer swaps in a table?"
    a: "On a persistent element that already exists in the DOM, not on the node @defer is about to create. Update that element's text when the load finishes or fails so assistive tech hears one polite announcement."
  - q: "How does this differ from the @defer dashboard performance post?"
    a: "That post is about splitting admin widgets so the first paint stays small. This post is about names, errors, focus, and live announcements when those widgets or forms finally render data from ASP.NET Core."
---

**Accessible Angular forms with aria-live** means every control has a programmatic name, validation from ASP.NET Core is exposed as text (not only color), and content that `@defer` inserts later is announced with `aria-live` on a region that was already on the page.

**New to this** -> stay for labels, error wiring, and live regions. **Related** -> [@defer for admin dashboards](/blog/angular-defer-admin-dashboards) covers when to defer, not how to announce it. **Also** -> [OIDC PKCE](/blog/angular-oidc-pkce-aspnet-core) if the form posts to an authorized API and you still need the bearer token.

## What a screen reader has to hear

You have a reactive form, an API that returns field errors, and a block you just wrapped in `@defer`. You need the ARIA screen readers actually use, plus the ASP.NET shape of the payload. You do not need every WCAG success criterion restated, and you do not need a bundle-size lecture. Those are different jobs.

## When this applies

Apply this when an Angular UI posts or patches data to ASP.NET Core and either:

- fields can fail validation, or
- a region of the page is filled in after navigation, after `@defer`, or after a slow `HttpClient` call.

Skip the live-region parts if the page is static server HTML with no late update. Still label the inputs. Skip the form parts if you only render a read-only deferred chart; keep the live region and a text alternative for the chart's conclusion.

This page assumes you already return structured errors. A bare `{ "message": "Bad Request" }` string forces the client to guess which control is wrong. Use `ValidationProblem` / RFC 9457 `application/problem+json` with an `errors` dictionary keyed by field name.

## Names before widgets

> **Watch:** A red border is not a name. If the error node is removed while aria-describedby still points at it, assistive tech is left with a broken reference.

A control's accessible name comes from, in practice for Angular forms:

1. `<label for="...">` matching the input `id`, or
2. `aria-label` / `aria-labelledby` when a visible label would be redundant (a search icon button, not a data-entry form).

Placeholder text is not a label. It disappears when the user types, and it is not consistently announced as the name. `floatLabel` on a component library is fine only if the rendered DOM still has a real `<label>` or an `aria-labelledby` pointing at visible text. Inspect the DOM, not the design mock.

Group related controls with `<fieldset>` and `<legend>` (a shipping address, a yes/no pair of radios). `role="group"` plus `aria-labelledby` is the fallback when a fieldset breaks the library's layout, not the default.

Required state: put `required` on the control or `aria-required="true"`, and say "required" in the visible label or hint if the only indicator is a color asterisk. The asterisk can stay; it cannot be the only channel.

```html
<form [formGroup]="invoiceForm" (ngSubmit)="save()">
  <div>
    <label for="customerName">Customer name (required)</label>
    <input
      id="customerName"
      type="text"
      formControlName="customerName"
      autocomplete="organization"
      [attr.aria-invalid]="showError('customerName')"
      [attr.aria-describedby]="describedBy('customerName')" />
    <p id="customerName-hint">Legal name as it should appear on the invoice.</p>
    <p id="customerName-error" role="alert" *ngIf="showError('customerName')">
      {{ errorText('customerName') }}
    </p>
  </div>
  <button type="submit">Save invoice</button>
</form>
```

`autocomplete` is an accessibility and usability feature, not only a conversion trick. Use real tokens (`email`, `street-address`) so browsers and password managers can fill the control. Do not invent a token.

## Client rules and server rules are both announced

> **Watch:** Announce the server sentence from ProblemDetails, not the raw JSON, and map those keys onto the same controls the client already labels.

Client validators give instant feedback. The server is the authority: Angular can be bypassed, and some rules need the database (unique invoice number, closed period). Map both into the same error slot so the user hears one message per field, not a client string and a contradictory toast.

```typescript
import { Component, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';

type ProblemDetails = {
  title?: string;
  status?: number;
  errors?: Record<string, string[]>;
};

@Component({
  selector: 'app-invoice-form',
  templateUrl: './invoice-form.component.html',
})
export class InvoiceFormComponent {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);

  summary = '';
  serverErrors: Record<string, string[]> = {};

  readonly invoiceForm = this.fb.nonNullable.group({
    customerName: ['', [Validators.required, Validators.maxLength(120)]],
    dueOn: ['', Validators.required],
  });

  showError(name: 'customerName' | 'dueOn'): boolean {
    const control = this.invoiceForm.controls[name];
    return (control.touched && control.invalid) || !!this.serverErrors[name];
  }

  describedBy(name: string): string {
    return this.showError(name) ? `${name}-hint ${name}-error` : `${name}-hint`;
  }

  errorText(name: string): string {
    return this.serverErrors[name]?.[0]
      ?? this.clientMessage(name);
  }

  save(): void {
    this.summary = '';
    this.serverErrors = {};
    if (this.invoiceForm.invalid) {
      this.invoiceForm.markAllAsTouched();
      this.summary = 'Fix the highlighted fields before saving.';
      return;
    }

    this.http.post('/api/invoices', this.invoiceForm.getRawValue()).subscribe({
      next: () => {
        this.summary = 'Invoice saved.';
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 400 && err.error?.errors) {
          const problem = err.error as ProblemDetails;
          this.serverErrors = problem.errors ?? {};
          this.summary = problem.title ?? 'The server rejected the invoice.';
          return;
        }
        this.summary = 'The invoice could not be saved. Try again.';
      },
    });
  }

  private clientMessage(name: string): string {
    const control = this.invoiceForm.get(name);
    if (control?.hasError('required')) return 'This field is required.';
    if (control?.hasError('maxlength')) return 'The value is too long.';
    return 'This field is invalid.';
  }
}
```

ASP.NET Core side, keep property names aligned with the form control names. Camel case in JSON is the usual Angular contract if the API serializes with camel case:

```csharp
public sealed record CreateInvoiceRequest(
    string CustomerName,
    DateOnly DueOn);

app.MapPost("/api/invoices", (CreateInvoiceRequest body) =>
{
    var errors = new Dictionary<string, string[]>();
    if (string.IsNullOrWhiteSpace(body.CustomerName))
    {
        errors["customerName"] = new[] { "Customer name is required." };
    }
    if (body.DueOn < DateOnly.FromDateTime(DateTime.UtcNow))
    {
        errors["dueOn"] = new[] { "Due date cannot be in the past." };
    }
    if (errors.Count > 0)
    {
        return Results.ValidationProblem(errors);
    }

    return Results.Created("/api/invoices/1001", new { id = 1001 });
});
```

`Results.ValidationProblem` produces `errors` keyed by the names you pass. If you instead rely on automatic model validation, confirm the JSON names match `formControlName`. A mismatch is why "the API returns errors and the form still looks clean."

Put a form-level status in one element that is always in the DOM:

```html
<div role="status" aria-live="polite" id="form-status">{{ summary }}</div>
```

`role="status"` implies polite live behavior. Use `role="alert"` (assertive) for the individual field error that appears next to the control the user just left, not for every background refresh. Assertive on a polling panel talks over the user.

Move focus deliberately. On a failed submit, focus the summary or the first invalid control. Do not focus it on every keystroke. On success, focus the status or the heading of the next step so a screen-reader user knows the save finished. `tabindex="-1"` on the summary lets you focus it without adding a tab stop.

## @defer and live regions

> **Watch:** Put aria-live on an element that already exists. A live region inside the deferred block appears already filled, and many users hear nothing.

`@defer` removes a chunk of UI from the first render and inserts it when a trigger fires (`on viewport`, `on idle`, `on interaction`, `when`). The inserted block is a DOM change. A screen reader does not automatically announce "the audit table is here" just because nodes appeared.

The mistake is writing `aria-live` on the `@placeholder` or on the deferred component root. Those nodes are created and destroyed by the defer block, and live-region announcements are specified for **changes to text inside a region that already exists**, not for the moment a live region is mounted. Put the announcer outside the block and update a string the announcer binds to.

```html
<section aria-labelledby="activity-heading">
  <h2 id="activity-heading">Recent activity</h2>
  <p aria-live="polite" class="visually-hidden">{{ activityStatus }}</p>

  @defer (on viewport) {
    <app-activity-table
      [rows]="rows"
      (loaded)="activityStatus = rows.length + ' activity rows loaded.'"
      (failed)="activityStatus = 'Activity could not be loaded.'" />
  } @placeholder {
    <p>Activity loads when you scroll to this section.</p>
  } @loading {
    <p>Loading activity.</p>
  } @error {
    <p>Activity is unavailable.</p>
  }
</section>
```

The visible `@loading` and `@error` blocks matter for sighted users and for low vision. The polite string is the short confirmation after the swap. Do not announce on a timer ("still loading" every second). One message when loading starts is enough if the wait is long; one message when it ends is the important one.

If the deferred component fetches ASP.NET Core data itself, emit `loaded` from the component after the `HttpClient` observable completes, not when the constructor runs. Otherwise you announce an empty table.

```typescript
@Component({
  selector: 'app-activity-table',
  template: `<table><!-- rows --></table>`,
})
export class ActivityTableComponent implements OnInit {
  @Output() loaded = new EventEmitter<void>();
  @Output() failed = new EventEmitter<void>();
  rows: ActivityRow[] = [];

  constructor(private readonly http: HttpClient) {}

  ngOnInit(): void {
    this.http.get<ActivityRow[]>('/api/activity?take=20').subscribe({
      next: (rows) => {
        this.rows = rows;
        this.loaded.emit();
      },
      error: () => this.failed.emit(),
    });
  }
}
```

Prefetch (`@defer (on viewport; prefetch on idle)`) does not change the announcement. Announce when the user can perceive the content, which is when the block renders, not when the bundle finishes downloading in the background.

## Tables, dialogs, and errors that are not fields

Deferred admin data is often a table. Give it a `<caption>` or an `aria-labelledby` heading. Column headers are `<th scope="col">`. Clicking a row to open a record should be a real button or link inside the row, not a click handler on the `<tr>` with no keyboard path.

If a save opens a dialog, trap focus in the dialog, label it with `aria-labelledby`, and restore focus to the button that opened it when it closes. `@defer` on the dialog body is fine; do not defer the focus trap itself such that the dialog appears and focus is still on the page behind it.

Toasts: one polite live region, reuse it, replace the text. A stack of `role="alert"` toasts for "saved", "email queued", and "telemetry ok" is noise. API failure that blocks the task can be assertive. Success is polite.

## Keyboard and hit targets

- Every action is a `<button>` or `<a href>`. `div (click)` fails keyboard users and fails name calculation unless you rebuild both.
- Do not remove outline without a replacement focus style that meets contrast. `:focus-visible` is the modern default.
- Icon-only buttons need `aria-label` ("Delete invoice 1001", not "Delete").
- Disable a submit button while the request is in flight **and** set the status text to "Saving invoice." A disabled button with no status looks frozen to a screen reader.

## Pitfalls

- **`aria-live` on the deferred component selector.** The region appears already filled. Many users hear nothing. Keep the region outside.
- **Announcing the raw ProblemDetails JSON.** Read `errors[field][0]`, the sentence you wrote on the server. Do not announce the whole payload, trace id, and type URI.
- **Two sources of truth.** Client says "optional," server says "required," and only the toast shows the server message. Map server keys onto the same controls.
- **`*ngIf` deleting the error node that `aria-describedby` points at** while leaving the attribute in place. Point at the error id only while the error is rendered, as `describedBy` does above.
- **Placeholder-only labels on Angular Material** because the floating label was turned off to save vertical space. Turn the label back on or add `aria-label` that matches the visible caption.
- **Live region in `OnPush` that never marks for check** after you set `activityStatus` from an event that ran outside Angular. If the text does not update in the DOM, it will not be announced. Set the string inside the Angular zone or call `markForCheck`.
- **Loading the entire accessible name from a translation key that is empty** in one locale. Missing labels fail that locale only; check the rendered `accessible name` in devtools, not the English screenshot.

## How to verify

1. Tab from the top of the form. Every control has a visible focus ring and a name you can see in the accessibility tree (Chrome Accessibility pane or Firefox Accessibility inspector). The name is not "input" and not the placeholder alone.
2. Submit empty. Each invalid control has `aria-invalid="true"` and the error text is in the accessibility tree as its description.
3. Force a 400 from the API (past due date). The matching control shows the server sentence, and the status region text changes once.
4. Scroll the deferred activity block into view with a screen reader running. You hear one polite "rows loaded" (or the failure sentence), not a dump of every cell.
5. Zoom to 200 percent and use only the keyboard. The submit button is reachable and the error is not clipped outside the viewport.
6. Repeat the status check with the OS screen reader for one pass (Narrator, NVDA, or VoiceOver). Automated scanners do not hear live regions reliably.

Automated checks (axe, eslint-plugin-jsx-a11y equivalents for Angular templates, Angular's own a11y lint where you enable it) catch missing labels and empty buttons. They do not catch a live region that announces too often. That is a manual pass.

## What this page is not

It is not the performance design of `@defer` triggers, prefetch, or heavy chart libraries. That is [Angular @defer for admin dashboards](/blog/angular-defer-admin-dashboards). It is not OIDC. A perfectly labeled form still needs a real access token if the API requires one; see [Angular OIDC with PKCE](/blog/angular-oidc-pkce-aspnet-core). It is not a claim that this pattern alone conforms to a specific WCAG conformance level. It is the implementation that makes the common Angular plus ASP.NET Core form understandable when content shows up late.

---
title: "Angular OnPush Change Detection: Performance & Signals"
description: "Master Angular OnPush change detection: input reference equality, Signals integration, ChangeDetectorRef methods, and immutable update patterns."
date: "2026-09-18"
updated: "2026-10-03"
category: "angular"
tags: ["Angular", "OnPush", "Change Detection", "TypeScript", "Performance", "Signals"]
related:
  - angular-signals-aspnet-core
  - angular-standalone-components
  - angular-interview-questions-aspnet-core
  - angular-dotnet-integration
faq:
  - q: "When does an OnPush component run change detection?"
    a: "An OnPush component is checked only when: (1) an @Input() or input() reference changes to a new object identity, (2) an event listener bound inside its template fires, (3) an async pipe in the template emits a new value, (4) a Signal read in the template updates, or (5) ChangeDetectorRef.markForCheck() is explicitly called."
  - q: "Does in-place object mutation trigger OnPush updates?"
    a: "No. OnPush uses strict reference equality (===). Modifying a property like user.name = 'New' maintains the same memory address, so Angular skips the component subtree during change detection."
  - q: "How do Angular Signals interact with OnPush?"
    a: "Signals natively complement OnPush. When a Signal read in an OnPush template updates via set() or update(), Angular marks the component for check automatically, enabling fine-grained UI updates without manual markForCheck() calls."
  - q: "Should every component in an Angular application use OnPush?"
    a: "Yes, for modern production applications. It prevents unnecessary top-down component tree scans on every DOM event or timer tick, dramatically cutting frame drops in complex data grids, dashboards, and enterprise portals."
---

**Angular OnPush change detection** (`ChangeDetectionStrategy.OnPush`) optimizes frontend performance by instructing Angular to skip checking a component and its child subtree unless explicit triggers occur—such as new immutable input references, template event dispatches, or updated Signal reads.

```text
Default Change Detection (Zone.js):
User clicks button anywhere ──► Angular traverses & re-evaluates 100% of components

OnPush Change Detection:
User clicks button ──► Only checks component if:
  ├── Input reference changed (prev !== curr)
  ├── Template event fired inside component
  ├── Signal read inside template updated
  └── markForCheck() called explicitly
```

**New to this** → start with the [triggers table](#when-angular-checks-an-onpush-component). **Modern state integration** → [Angular Signals guide](/blog/angular-signals-aspnet-core). **Component setup** → [Standalone components](/blog/angular-standalone-components). **Interview prep** → [If an interviewer asks](#if-an-interviewer-asks).

## Real-world analogy

Imagine a building security inspector:
- **Default Strategy**: The inspector walks into every single office in a 50-story skyscraper every 5 minutes and knocks on every desk to ask if anyone has new paperwork.
- **OnPush Strategy**: The inspector stays in the lobby and only visits an office if an employee rings the call button (DOM event), a new courier arrives with a new badge (immutable input reference change), or an electronic alert board updates (Signals / async pipe).

Mutating a field inside an existing object is like changing your wristwatch inside your office without telling the lobby—under OnPush, the inspector will never know.

## When Angular checks an OnPush component

Understanding the exact triggers that mark an OnPush component as "dirty" is essential:

| Trigger Scenario | Will OnPush Re-render? | Rationale |
|---|---|---|
| New object passed to `@Input()` / `input()` | **Yes** | `prevInput !== currentInput` by reference equality (`===`). |
| Mutated property on same object reference | **No** | Same memory pointer; Angular assumes data has not changed. |
| Click, keyup, or submit inside component template | **Yes** | Template-bound event handler dispatches, marking component dirty. |
| Event triggered in an unrelated sibling component | **No** | Skipped because this branch was not touched. |
| `async` pipe receives new Observable emission | **Yes** | `AsyncPipe` internally calls `ChangeDetectorRef.markForCheck()`. |
| `Signal` read in the component's template updates | **Yes** | Angular's reactive graph marks consumer view dirty. |
| `setTimeout`, `setInterval`, or raw Promise resolves | **No** | Unless wrapped in a Signal update or manual `markForCheck()`. |

## The mutability pitfall and the immutable fix

The most common bug when introducing OnPush is modifying existing arrays or object properties in place:

### Wrong: In-place mutation (UI remains stale)

```typescript
// ❌ WRONG: Mutating existing array/object does not trigger OnPush
@Component({
  selector: 'app-user-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-user-card [user]="currentUser" />
    <button (click)="updateRole()">Promote User</button>
  `,
})
export class UserListComponent {
  currentUser = { id: 'usr_1', name: 'Alice', role: 'Viewer' };

  updateRole(): void {
    // BUG: Mutating object in place keeps the same reference pointer!
    // Child <app-user-card> will NOT re-render its role badge.
    this.currentUser.role = 'Administrator';
  }
}
```

### Right: Immutable updates and Signals

```typescript
// ✅ RIGHT: Creating a new object reference or using Signals
import { Component, ChangeDetectionStrategy, signal, input } from '@angular/core';

export interface UserProfile {
  id: string;
  name: string;
  role: string;
}

@Component({
  selector: 'app-user-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-4 border rounded shadow-sm">
      <h3 class="font-semibold">{{ user().name }}</h3>
      <span class="badge">{{ user().role }}</span>
    </div>
  `,
})
export class UserCardComponent {
  readonly user = input.required<UserProfile>();
}

@Component({
  selector: 'app-user-container',
  standalone: true,
  imports: [UserCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-user-card [user]="currentUser()" />
    <button (click)="promoteUser()" class="btn-primary mt-3">Promote to Admin</button>
  `,
})
export class UserContainerComponent {
  readonly currentUser = signal<UserProfile>({
    id: 'usr_1',
    name: 'Alice',
    role: 'Viewer',
  });

  promoteUser(): void {
    // Produces a fresh object reference and notifies reactive consumers
    this.currentUser.update((prev) => ({
      ...prev,
      role: 'Administrator',
    }));
  }
}
```

## Handling external streams and manual change detection

When working with WebSockets, background timers, or RxJS streams outside the template, use `ChangeDetectorRef`:

```typescript
import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { RealTimePriceService, TickerUpdate } from '../../core/services/price.service';

@Component({
  selector: 'app-live-ticker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ticker-box">
      <span>{{ tickerSymbol }}:</span>
      <span [class.text-green]="isUp" [class.text-red]="!isUp">
        \${{ currentPrice.toFixed(2) }}
      </span>
    </div>
  `,
})
export class LiveTickerComponent implements OnInit, OnDestroy {
  private readonly priceService = inject(RealTimePriceService);
  private readonly cdr = inject(ChangeDetectorRef);
  private sub?: Subscription;

  tickerSymbol = 'MSFT';
  currentPrice = 0;
  isUp = true;

  ngOnInit(): void {
    this.sub = this.priceService.streamTicker(this.tickerSymbol).subscribe((update: TickerUpdate) => {
      this.isUp = update.price >= this.currentPrice;
      this.currentPrice = update.price;

      // Informs Angular that this component and its ancestors must be checked
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
```

### Methods on `ChangeDetectorRef`:
- `markForCheck()`: Marks the path from the root component down to this component to be checked in the current or next change detection cycle. **Recommended escape hatch.**
- `detectChanges()`: Synchronously executes change detection on this component and its children immediately. Use sparingly (e.g. tight animation loops or unit testing).
- `detach()` / `reattach()`: Detaches component tree from the change detector entirely. Useful for heavy SVG graphs or canvas visualizers.

## Common mistakes and performance pitfalls

- **Mutating arrays via `push()`, `splice()`, or `sort()`**: `array.push(item)` does not change the array reference. Always use `[...array, item]` or `signals.update()`.
- **Calling functions inside templates**: Binding `<span>{{ calculateTax(order) }}</span>` in an OnPush component still recalculates whenever the component is checked. Use `computed()` signals or pure pipes.
- **Relying on `markForCheck()` instead of immutability**: Sprinkling `cdr.markForCheck()` across parent components to force children to update masks design flaws. Adopt Signals or immutable state flow.
- **Passing mutable service instances directly into `@Input()`**: If components read mutable properties off a shared service instance without signals or observables, OnPush will not detect changes.

## If an interviewer asks

**30-second answer:** `ChangeDetectionStrategy.OnPush` disables automatic top-down checking for a component unless its input reference changes (`===`), a template event fires, an `async` pipe emits, or a Signal read in the template updates. It avoids unnecessary change detection cycles across large component trees and requires an immutable state discipline.

**Strong answer:** Default change detection walks the entire component tree whenever Zone.js intercepts an asynchronous microtask or DOM event. In high-density enterprise UIs (e.g., trading screens or healthcare dashboards), this leads to frame drops and high CPU usage. OnPush converts the component tree into a reactive leaf structure: Angular skips subtrees where input references haven't changed. With Angular 17+ Signals, OnPush is the natural standard, as Signals provide fine-grained reactivity directly to template consumers without manual `ChangeDetectorRef` plumbing.

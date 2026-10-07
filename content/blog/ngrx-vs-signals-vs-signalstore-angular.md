---
title: "NgRx vs Signals vs SignalStore for Angular Enterprise SPAs"
description: "NgRx vs Angular Signals vs SignalStore — when each state management approach is correct for enterprise SPAs backed by ASP.NET Core."
date: "2026-10-01"
category: "angular"
tags: ["Angular", "NgRx", "Signals", "SignalStore", "ASP.NET Core"]
related:
  - angular-signals-aspnet-core
  - angular-onpush-change-detection
  - angular-dotnet-integration
  - angular-switchmap-exhaustmap-concatmap
faq:
  - q: "NgRx vs Signals vs SignalStore — what should an Angular + ASP.NET Core team use?"
    a: "Default to Signals for component and simple feature state. Use SignalStore when you need structured entity/list/detail stores talking to your API. Keep or adopt classic NgRx when you already have Effects-heavy workflows, time-travel needs, or large teams standardized on Store actions."
  - q: "Does Angular Signals replace NgRx?"
    a: "Signals replace a lot of boilerplate for local and moderate feature state. They do not automatically replace NgRx’s action/effect ecosystem for complex asynchronous orchestration across many features."
  - q: "How is this different from the Angular Signals + ASP.NET Core intro?"
    a: "That post teaches how Signals work with API data. This post is the decision matrix: when Signals alone, when SignalStore, when NgRx still earns its keep."
---

**NgRx vs Signals vs SignalStore for ASP.NET Core enterprise SPAs** is a complexity decision: pick the smallest state tool that keeps server contracts honest, change detection calm, and onboarding humane.

```text
Component-local UI          Feature entity CRUD           Cross-app workflows
Signals / linkedSignal  →   SignalStore (+ methods)  →   NgRx Store + Effects
        │                            │                            │
        └──────── HttpClient → ASP.NET Core API (DTO contracts) ─┘
```

Metaphor: Signals are **whiteboard notes on your desk**. SignalStore is a **labeled filing cabinet for one feature**. NgRx is a **corporate mailroom** — every change is a stamped action that many clerks can process. Mailrooms scale; they also slow down a two-person clinic admin.

**New to this** → stay here for the decision. **How Signals bind to API data** → [Angular Signals + ASP.NET Core](/blog/angular-signals-aspnet-core). **OnPush** → [OnPush change detection](/blog/angular-onpush-change-detection). **RxJS mapping** → [switchMap / exhaustMap / concatMap](/blog/angular-switchmap-exhaustmap-concatmap).

Search intent for **ngrx vs signals angular** is comparison by feature complexity — especially for teams whose source of truth is an ASP.NET Core API.

## What the existing Signals + API post already covers (and what it does not)

The Signals intro covers: writable signals, computed, effects for glue, loading flags beside HTTP calls, and why Signals play nicely with OnPush.

It does **not** answer:

- When a global action log still helps
- How SignalStore packages entity collections
- Migration from a mature NgRx codebase without a rewrite weekend

This page fills that decision gap.

## Local signals for component / feature state

Use plain Signals when state dies with the route or component:

- Form wizard step index
- Table sort/filter UI that is not shared
- "Is drawer open?"
- Derived view models via `computed` from inputs + local signals

```typescript
readonly filter = signal('');
readonly rows = signal<InvoiceDto[]>([]);
readonly filtered = computed(() => {
  const q = this.filter().toLowerCase();
  return this.rows().filter(r => r.number.toLowerCase().includes(q));
});

load() {
  this.http.get<InvoiceDto[]>('/api/invoices').subscribe(rows => this.rows.set(rows));
}
```

Keep HTTP mapping habits from [integration](/blog/angular-dotnet-integration): typed DTOs, one error envelope, no `any`. Prefer `switchMap` on typeahead to cancel in-flight API calls ([RxJS maps](/blog/angular-switchmap-exhaustmap-concatmap)).

**Team-skills factor:** any Angular 16+ developer can read this. That matters on freelance and mixed-seniority squads.

## SignalStore for entity lists / details talking to ASP.NET Core

When multiple components share list + selected entity + load/save flags, SignalStore (NgRx Signal Store) gives structure without classic action boilerplate:

```typescript
import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

type OrdersState = {
  items: OrderListItemDto[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
};

export const OrdersStore = signalStore(
  { providedIn: 'root' },
  withState<OrdersState>({
    items: [],
    selectedId: null,
    loading: false,
    error: null
  }),
  withMethods((store, http = inject(HttpClient)) => ({
    async loadAll() {
      patchState(store, { loading: true, error: null });
      try {
        const items = await firstValueFrom(
          http.get<OrderListItemDto[]>('/api/orders')
        );
        patchState(store, { items, loading: false });
      } catch {
        patchState(store, { loading: false, error: 'Failed to load orders' });
      }
    },
    select(id: string) {
      patchState(store, { selectedId: id });
    }
  }))
);
```

Why this fits ASP.NET Core enterprise SPAs:

- **Stable API contracts** — store methods call versioned DTOs; the store does not invent a second domain model.
- **Testable** — swap `HttpClient` or wrap an `OrdersApi` service.
- **Enough structure** for list/detail without `createAction` sprawl.

Add `withEntities` when you outgrow a naive array. Keep pagination metadata from the API in state rather than inventing client-only page math that disagrees with SQL.

## When classic NgRx Effects still win

Keep (or choose) NgRx Store + Effects when:

1. **Many features react to one event** — `OrderPlaced` triggers toast, analytics, inventory refresh, and navigate — Effects compose that without giant services.
2. **You already have hundreds of actions** — rewriting to Signals mid-delivery is vanity.
3. **Strict auditability of client intent** — action log / DevTools time travel helps support and debugging in complex admin consoles.
4. **Orchestrated multi-step async** with cancellation and racing that your team already models as Effects.

```typescript
loadOrders$ = createEffect(() =>
  this.actions$.pipe(
    ofType(OrdersActions.load),
    exhaustMap(() =>
      this.api.list().pipe(
        map(items => OrdersActions.loadSuccess({ items })),
        catchError(err => of(OrdersActions.loadFailure({ err })))
      )
    )
  )
);
```

`exhaustMap` here matches "ignore re-clicks while loading" — same RxJS discipline you use without NgRx.

**Cost:** ceremony, steeper onboarding, more files per feature. Worth it when the mailroom is already busy.

## Decision matrix: CRUD screens vs multi-step workflows

| Scenario | Prefer | Why |
|---|---|---|
| One screen, local toggles | Signals | Least ceremony |
| List + detail + save for one resource | SignalStore | Shared feature state, light structure |
| Cross-feature reactions, complex async | NgRx Effects | Action bus + effect isolation |
| Greenfield clinic admin, 5 CRUD pages | Signals → SignalStore as needed | Ship features |
| Existing NgRx monolith SPA | Stay NgRx; Signals at edges | Avoid big-bang |
| Real-time SignalR feeds into UI | Signals/Store updated by hub callbacks | Tool ≠ transport |

**ASP.NET Core constraint:** the API remains the system of record. Client state is a cache and UX projector. If your NgRx store silently becomes a write-back database, you will fight concurrency with EF — fix the contract (ETags, versions) instead of adding more client reducers.

## Migration posture without big-bang rewrites

1. **New features** in a NgRx app may use SignalStore or Signals without converting everything.
2. **Leaf components** adopt Signals for UI-only state first (drawers, tabs).
3. **Do not** dual-write the same entity to NgRx Store and SignalStore.
4. Extract `OrdersApi` HttpClient wrappers so either store calls the same methods.
5. Measure: bundle size and onboarding time matter more than Twitter purity.

## Testing implications

| Approach | Unit test focus |
|---|---|
| Signals | `computed` purity; component with TestBed |
| SignalStore | method patchState outcomes with HttpTestingController |
| NgRx | reducer purity + effect marble/Http tests |

All three still need contract tests against ASP.NET Core ProblemDetails shapes — do not only mock happy JSON.

## Pitfalls

- **NgRx for every checkbox** — ceremony without benefit.
- **God SignalStore** holding the entire app — split by feature.
- **Effects that call other effects in spaghetti** — clarify domain events.
- **Ignoring OnPush** — Signals help, but still mark strategies deliberately ([OnPush](/blog/angular-onpush-change-detection)).
- **Treating client store as authorization** — UI hiding ≠ API RBAC.

## Verification

1. For a CRUD feature built with SignalStore: navigate away/back; confirm reload policy matches product (cache vs refetch).
2. Spam-click refresh: ensure `exhaustMap`/`switchMap` prevents stampedes against ASP.NET Core.
3. Simulate 403/400 ProblemDetails; assert error signal/state for Angular forms.
4. If NgRx: open DevTools, fire one user journey, confirm action sequence is readable to a teammate.
5. Lighthouse/perf secondary — correctness and stampede control first.

## Practitioner checklist

1. Inventory features: local / feature / cross-app.
2. Default new local UI to Signals.
3. Introduce SignalStore at second consumer of the same list/detail.
4. Keep NgRx where Effects already orchestrate.
5. Share Http API services across all three.
6. Document the rule in CONTRIBUTING so PRs do not invent a fourth state library.

## If an interviewer asks

**"Do Signals kill NgRx?"**  
They shrink NgRx’s necessary surface. They do not erase the value of a global action/effect model for large orchestrations.

**"What do you use with ASP.NET Core APIs?"**  
Typed HttpClient DTOs always. Signals or SignalStore for most screens. NgRx when the SPA’s event choreography is genuinely complex.


## Concrete migration story

A clinic admin SPA on NgRx with 40 feature stores does not rewrite overnight. Plan:

1. Freeze new classic actions for leaf UI state — use Signals in components.
2. Next greenfield feature (for example lab results) ships as SignalStore calling the same `LabsApi` service NgRx would have used.
3. Leave checkout/billing orchestration on Effects until it stabilizes.
4. Measure PR review time and onboarding comments — if juniors drown in boilerplate, bias further toward SignalStore.

ASP.NET Core DTO contracts stay the spine; state libraries are replaceable skins.


## Related

**Related:** [Angular Signals](/blog/angular-signals-aspnet-core) · [OnPush](/blog/angular-onpush-change-detection) · [Angular +.NET integration](/blog/angular-dotnet-integration) · [RxJS maps](/blog/angular-switchmap-exhaustmap-concatmap)

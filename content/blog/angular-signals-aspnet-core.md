---
title: "Angular Signals with ASP.NET Core APIs: State Without Subscription Sprawl"
description: "Angular Signals for API-driven apps — load state from ASP.NET Core, computed UI flags, RxJS interop, and when Signals beat BehaviorSubject for SPA state."
date: "2026-08-09"
category: "architecture"
tags: ["Angular", "Signals", "ASP.NET Core", "TypeScript", "RxJS", "SPA"]
---

**Angular Signals** fix a pain every ASP.NET Core + Angular team hits: too many `subscribe` calls, manual `markForCheck`, and UI state that drifts from the last HTTP response. Signals are not a replacement for every RxJS stream — they are a better default for **synchronous state** your templates read constantly.

This is how I wire Signals when the source of truth is still a .NET API.

## What Signals are for

| Use Signals for | Keep RxJS for |
|---|---|
| Component / feature UI state | Continuous streams (WebSocket / SignalR, progressive search) |
| Derived flags (`computed`) | Complex async pipelines with operators |
| Values templates read every CD cycle | Interop with existing Observable-heavy libraries |

## Load from ASP.NET Core into a signal

```typescript
import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type OrderDto = { id: string; status: string; total: number };

@Injectable({ providedIn: 'root' })
export class OrderStore {
  private readonly http = inject(HttpClient);

  readonly order = signal<OrderDto | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly canCancel = computed(() => this.order()?.status === 'Pending');

  async load(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await firstValueFrom(
        this.http.get<OrderDto>(`/api/orders/${id}`)
      );
      this.order.set(data);
    } catch {
      this.error.set('Could not load order.');
      this.order.set(null);
    } finally {
      this.loading.set(false);
    }
  }
}
```

Template:

```html
@if (store.loading()) {
  <p>Loading…</p>
} @else if (store.error(); as message) {
  <p class="error">{{ message }}</p>
} @else if (store.order(); as order) {
  <h2>Order {{ order.id }}</h2>
  <p>{{ order.status }} — {{ order.total | currency }}</p>
  @if (store.canCancel()) {
    <button type="button" (click)="cancel()">Cancel</button>
  }
}
```

No `async` pipe required for this path — the signal holds the latest DTO from your API.

## toSignal for Observable APIs you still need

When interceptors, polling, or library APIs return Observables:

```typescript
import { toSignal } from '@angular/core/rxjs-interop';

readonly statuses = toSignal(
  this.http.get<string[]>('/api/orders/statuses'),
  { initialValue: [] as string[] }
);
```

Prefer `firstValueFrom` + `signal.set` when you want explicit loading/error state machines for user-facing screens.

## Mutating after POST/PUT

```typescript
async cancel(id: string): Promise<void> {
  await firstValueFrom(this.http.post(`/api/orders/${id}/cancel`, {}));
  const current = this.order();
  if (current) {
    this.order.set({ ...current, status: 'Cancelled' });
  }
}
```

Optimistic updates are fine when the ASP.NET Core contract is clear. On failure, reload from the API — do not leave the signal lying.

## Auth and HTTP habits still matter

Signals do not replace:

- JWT interceptors ([Angular JWT interceptors](/blog/angular-jwt-interceptors))
- Auth guards ([Angular auth guards](/blog/angular-auth-guard-aspnet-core))
- Consistent error envelopes from .NET ([global exception handling](/blog/aspnet-core-global-exception-handling))

Put tokens and 401 handling in HTTP infrastructure. Put **view state** in Signals.

## Failure story: BehaviorSubject for every field

A clinic admin SPA tracked `patient$`, `loading$`, `tab$`, and `dirty$` as subjects with nested subscriptions. Change detection felt random; junior devs leaked subscriptions. Migrating screen-local state to Signals and keeping SignalR feeds as Observables cut UI bugs without rewriting the ASP.NET Core API.

## Delivery checklist

1. Feature stores expose `signal` / `computed` for template state
2. HTTP still goes through shared `HttpClient` + interceptors
3. Loading and error are explicit signals (or a single status union)
4. `toSignal` used deliberately — not for every click handler
5. SignalR / realtime stays Observable (or mapped carefully)
6. Server remains source of truth after mutations
7. No Ad-hoc `subscribe` in templates

## Related reading

- [Angular + .NET integration habits](/blog/angular-dotnet-integration)
- [SignalR realtime patterns](/blog/signalr-aspnet-core-realtime)
- [ASP.NET Core Minimal APIs](/blog/aspnet-core-minimal-apis)

If your Angular SPA is drowning in subjects while the .NET API is already stable, [contact me](/contact) — we can migrate the hot screens to Signals without a big-bang rewrite.

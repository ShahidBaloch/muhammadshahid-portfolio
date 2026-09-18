---
title: "switchMap vs exhaustMap vs concatMap in Angular"
description: "Which RxJS map to use when Angular calls an ASP.NET Core API: switchMap for search, exhaustMap for submit, concatMap when order matters. The wrong one drops or doubles the request."
date: "2026-09-18"
updated: "2026-09-18"
category: "architecture"
tags: ["Angular", "RxJS", "HttpClient", "ASP.NET Core"]
related:
  - angular-signals-aspnet-core
  - angular-dotnet-integration
  - angular-interceptor-401-refresh-queue
  - csharp-cancellationtoken-aspnet-core
faq:
  - q: "When should Angular use switchMap for an API call?"
    a: "When a newer input makes the previous response useless. Typeahead search is the case. switchMap unsubscribes from the in-flight HttpClient call, which cancels that request, then starts the next one."
  - q: "What is the difference between exhaustMap and switchMap?"
    a: "exhaustMap ignores new clicks until the current request finishes. switchMap cancels the current request and starts the new one. Use exhaustMap on Pay or Save so a double click does not fire twice. Do not use switchMap there."
  - q: "When do I need concatMap?"
    a: "When every event must hit the API, in order, and the next call waits for the previous one. A queue of patches is concatMap. Independent calls that may overlap are mergeMap, not concatMap."
---

The operator is the product behavior. Search that shows stale rows, a pay button that charges twice, and a save queue that applies update 3 before update 1 are the same bug with three operators.

Related: [Signals and the API](/blog/angular-signals-aspnet-core) covers state. This post covers which higher-order map to put on `HttpClient`. Integration habits: [Angular + .NET](/blog/angular-dotnet-integration).

## Real-world analogy

`switchMap` is a waiter who hears a changed order and throws the previous ticket away. `exhaustMap` is a waiter who ignores you until the current plate is down. `concatMap` is a waiter who writes every change on a list and cooks them in order. The wrong waiter either bins a meal you still wanted or fires two steaks for one table.

## Worked example

Search uses `switchMap`. The user types "bolt", a slow request starts, then they type "bolt m6". The first request is cancelled. The list shows screws, not the earlier mix. Pay uses `exhaustMap`. A double click does not create two orders, because the second click is dropped while the POST is in flight. A cart quantity uses `concatMap`: "set 1" finishes before "set 2" starts, so the server never applies 2 and then 1. Using `switchMap` on Pay is the bug: the cancelled POST may already have committed, and the UI thinks it failed.

## Pick from the row

| You are building | Operator | In-flight request | New event while waiting |
|---|---|---|---|
| Search, filter, typeahead | `switchMap` | Cancelled | Starts immediately |
| Submit, pay, login | `exhaustMap` | Left alone | Dropped |
| Ordered writes, a queue | `concatMap` | Left alone | Queued |
| Independent calls, overlap is fine | `mergeMap` | Left alone | Starts in parallel |

`HttpClient` is a cold observable that completes after one response. These operators still matter because the source (a keyup stream, a click stream) emits many times.

## Search

```typescript
readonly results = toSignal(
  this.term.valueChanges.pipe(
    debounceTime(300),
    distinctUntilChanged(),
    switchMap(term =>
      this.http.get<Product[]>("/api/v1/products", {
        params: { term }
      })
    )
  ),
  { initialValue: [] as Product[] }
);
```

`debounceTime` is not a substitute for `switchMap`. Debounce only waits. Two slow responses can still arrive out of order if you used `mergeMap`. `switchMap` unsubscribes, Angular aborts the HTTP call, and ASP.NET Core sees a cancelled request. Honor that token on the server: [CancellationToken](/blog/csharp-cancellationtoken-aspnet-core).

Do not `switchMap` a POST that creates an order. The cancelled request may already have committed.

## Submit

```typescript
submit$.pipe(
  exhaustMap(() => this.http.post("/api/v1/orders", this.draft()))
).subscribe({
  next: order => this.created.set(order),
  error: () => this.saving.set(false)
});
```

The second click during the POST is ignored. Reset the busy flag in `next` and `error`, or the button stays dead. `exhaustMap` does not retry. A 401 refresh is the interceptor's job: [401 refresh queue](/blog/angular-interceptor-401-refresh-queue). Keep that interceptor outside this pipe so the operator is not racing a refresh.

If the server must accept exactly once even when the user retries later, the operator is not enough. The API needs an idempotency key. The operator only covers the double click in one session.

## Ordered updates

```typescript
patches$.pipe(
  concatMap(patch => this.http.patch(`/api/v1/orders/${patch.id}`, patch))
);
```

`concatMap` waits. A fast user cannot apply "set quantity 2" before "set quantity 1" finishes. Use it for a document or a cart line. Do not use it for a dashboard of unrelated cards. Those are `mergeMap` with a concurrency limit, or separate calls.

## What not to do

- Do not nest `subscribe` inside `subscribe`. That is `mergeMap` with no cancellation and an error path you forgot.
- Do not share one Subject for search and for submit. The operators contradict each other.
- Signals do not remove this choice. A signal that calls `http.get` from an effect still needs a policy when the input changes again. `switchMap` is that policy for reads.

Ecom list and search screens are the usual place this shows up: [Ecom_NET10](/work/ecom-net10).

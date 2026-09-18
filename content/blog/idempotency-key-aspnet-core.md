---
title: "Idempotency Keys for ASP.NET Core POST APIs"
description: "Stop double submits from creating two ASP.NET Core orders. Store the Idempotency-Key with the response and replay it. An Angular exhaustMap only covers one browser session."
date: "2026-09-18"
updated: "2026-09-18"
category: "api-design"
tags: ["ASP.NET Core", "API Design", "Idempotency", "Angular"]
related:
  - angular-switchmap-exhaustmap-concatmap
  - aspnet-core-api-validation
  - aspnet-core-global-exception-handling
  - api-design-principles
faq:
  - q: "What is an idempotency key on a POST?"
    a: "A client-generated id sent in a header, usually Idempotency-Key. The server stores it with the result of the first successful call. The same key and the same request returns that result again instead of inserting a second row."
  - q: "Does exhaustMap replace an idempotency key?"
    a: "No. exhaustMap drops a second click while the first request is in flight. A refresh, a timeout the client retries, or a second device still reaches the API. The key is what makes the retry safe."
  - q: "How long should the server remember the key?"
    a: "Long enough to cover the client's retries. A day is enough for a checkout. Do not keep keys forever, and do not treat a key used with a different body as a replay."
---

The user clicked Pay, the response timed out, they clicked again. You have two orders. The button spinner was never going to fix that. The POST has to be safe to retry.

Hub: [API design](/learning/api-design). The Angular half of the double click: [exhaustMap vs switchMap](/blog/angular-switchmap-exhaustmap-concatmap).

## Real-world analogy

A coat-check ticket. The first time you hand over the coat, they take it and give you the ticket number. If you tap the counter again because you did not hear them, they do not take a second coat. They look at the ticket and hand you the same stub. A different coat with the same ticket number is a problem they refuse, because that ticket was already used for something else.

## Worked example

The browser posts a checkout. The API inserts order 1841 and then the response times out. Angular retries the POST. Without a key, the database has orders 1841 and 1842 and the customer is charged twice. With `Idempotency-Key` created when the checkout screen opened, the retry sends the same key. The unique row from the first attempt is found, the stored 201 and the body with order 1841 are returned, and no second insert runs. If the retry's JSON total does not match the hash stored with the key, the API returns 409 instead of replaying the old order. `exhaustMap` would have dropped a second click in that tab. It would not have stopped the timeout retry.

## What the client sends

```http
POST /api/v1/orders
Idempotency-Key: 5d2c1a0e-3b4f-4e21-9c1a-8a0e5d2c1a0e
Content-Type: application/json
```

The Angular app creates the key when the user opens checkout, not when they click. A new click on the same form reuses it. A new checkout gets a new key. If you mint the key inside the click handler, a retry looks like a new request.

## What the server stores

One row, written in the same transaction as the order:

| Column | Why |
|---|---|
| Key | The header, scoped to the authenticated user |
| Request hash | So a reused key with a different body is a 409, not a silent replay |
| Status code and response body | What you return on the second call |
| Created at | So you can delete old keys |

First request, no row: create the order, store the response, commit, return 201.

Second request, same key, same hash, row exists: return the stored status and body. Do not insert again. Do not return 409 for a loyal retry. The client is asking "what happened the first time?"

Same key, different hash: 409. The key was reused for a new payload. That is a client bug, and replaying the old body would hide it.

## Do not do this

- Do not rely on a unique constraint on `(UserId, Total, CreatedAt)`. The user is allowed to buy the same thing twice on purpose. The key is the only signal that this POST is a retry.
- Do not check the key in middleware and run the action anyway when the row insert races. Two concurrent requests with the same key both see "missing" unless the insert is unique and the loser reloads the winner's response.
- Do not store only the key and return 204 on the second call. The client lost the first response. It needs the order id.

Validation still runs. A 400 is not worth storing for a day unless you want retries of a bad body to stay 400. Storing the success is the part that protects the database. See [API validation](/blog/aspnet-core-api-validation).

Checkout and pay on [Ecom_NET10](/work/ecom-net10) is the flow this exists for.

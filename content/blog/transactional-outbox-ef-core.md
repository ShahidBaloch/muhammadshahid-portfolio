---
title: "Transactional Outbox in EF Core"
description: "Publish a message only if the EF Core save committed. The transactional outbox writes the event in the same transaction as the order, then a background worker sends it."
date: "2026-09-18"
updated: "2026-09-18"
category: "ef-core"
tags: ["EF Core", "Outbox", "Messaging", "ASP.NET Core"]
related:
  - ef-core-interview-questions
  - csharp-backgroundservice-hosted-service-async
  - modular-monolith-vs-microservices-dotnet
  - ef-core-optimistic-concurrency-token
faq:
  - q: "What is the transactional outbox?"
    a: "A table written in the same database transaction as the business change. A worker reads unpublished rows and sends them to a queue. You never publish a message for an order that rolled back, and you never commit an order whose event only lived in memory."
  - q: "Why not publish to the queue after SaveChanges?"
    a: "The process can die between the commit and the publish. The order exists and the rest of the system never hears about it. The outbox row is committed with the order, so the worker can retry."
  - q: "Is the outbox exactly-once?"
    a: "No. It is at-least-once. The worker can send the same row twice if it crashes after send and before it marks the row. Consumers must treat the message id as idempotent."
---

`SaveChanges` succeeded. The bus call after it did not. Or the bus call succeeded and the transaction rolled back. Both leave a lie in one of the two systems. The outbox keeps the lie out by using one database transaction.

Hub: [EF Core](/learning/ef-core). The worker that drains the table: [BackgroundService](/blog/csharp-backgroundservice-hosted-service-async). When this becomes a module boundary: [modular monolith](/blog/modular-monolith-vs-microservices-dotnet).

## Real-world analogy

You write the order in the ledger and, on the same line, a note that still says "tell the warehouse." Both go in the book before you close it. A runner later reads the notes and calls the warehouse. If you phone the warehouse before the book is closed, and the book then fails to close, the warehouse picks an order that does not exist. If you close the book and the phone is dead, the note is still there tomorrow.

## Worked example

`SaveChanges` commits an order. The next line publishes `order.created` to a queue. The process dies between the two. Support sees the order. The warehouse never got a message. The outbox version adds an `OutboxMessage` row in that same `SaveChanges`, with a new id and a small payload of the order id and total. A `BackgroundService` sends that id as the message id, then sets `ProcessedAt`. If it crashes after the send and before the update, it sends again. The warehouse stores message ids and ignores the duplicate. That is at-least-once, which is the honest guarantee. Deleting the row before the send is how you lose the message.

## The write

```csharp
await using var tx = await db.Database.BeginTransactionAsync(ct);

db.Orders.Add(order);
db.Outbox.Add(new OutboxMessage
{
    Id = Guid.NewGuid(),
    Type = "order.created",
    Payload = JsonSerializer.Serialize(new { order.Id, order.Total }),
    OccurredAt = DateTimeOffset.UtcNow
});

await db.SaveChangesAsync(ct);
await tx.CommitAsync(ct);
```

`Order` and `OutboxMessage` share the context, so they share the commit. Do not call the queue inside the transaction and hold it open across the network. Write the row. Commit. Let the worker talk to the bus.

If you only have one `SaveChanges` and no explicit transaction, EF Core already wraps that save. An explicit transaction is for the case where you save more than once or call a raw command in the same unit. One `SaveChanges` that adds both entities is enough.

## The worker

Poll unpublished rows in a `BackgroundService`. For each row: send with the outbox id as the message id, then set `ProcessedAt`. Use a short lease (`LockedUntil`) so two instances do not send the same row at the same time. More than one App Service instance means this race exists.

If the send succeeded and the `ProcessedAt` update did not, the next poll sends again. That is the design. The consumer stores message ids it has handled and drops duplicates. Do not try to make the worker exactly-once by deleting the row before the send. A crash there loses the message.

## What the payload is

Store the facts the consumer needs. Do not store an EF entity, a navigation graph, or a type name from your domain project. `order.created` plus the ids and the amounts is a contract. Version it the way you version an HTTP body, because you cannot recall a message the consumer already stored.

## When you do not need one

One process, no queue, no second service. A column on the order (`EmailSentAt`) that a worker updates is the same pattern without a bus. The outbox table earns its place when something outside this database must hear about the commit.

[Ecom_NET10](/work/ecom-net10) is the kind of boundary (order committed, then payment or email) where the gap shows up. Concurrency on the order row itself is separate: [optimistic concurrency](/blog/ef-core-optimistic-concurrency-token).

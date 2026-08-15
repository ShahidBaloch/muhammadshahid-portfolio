---
title: "SignalR Real-Time Patterns in ASP.NET Core"
description: "How I ship SignalR with ASP.NET Core for auctions, notifications, and live dashboards — authenticated hubs, group strategy, scaling with Azure SignalR, and Angular clients that reconnect honestly."
date: "2026-06-18"
category: "authentication"
tags: ["SignalR", "ASP.NET Core", "Realtime", "Angular", "JWT", "Azure"]
---

The first time I added live bidding to a marketplace product, the websocket connection worked on my laptop and failed the moment we deployed to two App Service instances. Bids appeared on one server’s connections but not the other. Sellers refreshed the page and accused us of hiding offers. That week taught me that SignalR is not “turn on hubs and broadcast.” It is a distributed systems problem with a friendly API.

Since then I have used SignalR for auction floors, in-app notification feeds, healthcare queue boards, and order-status tickers in eCommerce admin panels. The transport is the same. The product rules — who may hear what, what happens on reconnect, how you scale — differ. This post covers the patterns I reuse so real-time features stay correct under load and across deploys.

## Match the pattern to the use case

Not every “live” screen needs the same SignalR shape.

**Auction and bidding** needs low-latency fan-out to everyone watching a lot, strict ordering awareness, and authorization that changes as the auction state machine moves from preview to live to closed. Messages are high frequency during the final minutes. Payloads should be tiny: lot id, current high bid, bidder display label (not PII you should not broadcast), and a server timestamp.

**Notification feeds** are user-scoped, lower frequency, and often durable. The user expects to see unread counts after reconnect even if they missed live pushes. SignalR notifies; SQL or a notification store is the source of truth. On reconnect, merge live events with a REST fetch of recent notifications.

**Ops dashboards** (healthcare scheduling queues, fulfillment monitors) sit in the middle: group by tenant or facility, moderate update rate, and strong authorization because PHI or commercial data is on screen. Prefer snapshot-plus-delta payloads so a reconnect can hydrate from REST and then apply live deltas.

Write these rules down before naming a hub. The hub name should reflect the product surface (`AuctionHub`, `NotificationsHub`), not a database table.

## Authenticated hubs: non-negotiable defaults

Anonymous hubs are for demos. Production hubs inherit `[Authorize]` and treat `Context.UserIdentifier` as the stable user key — usually the `sub` claim aligned with your JWT setup.

Browser clients pass tokens via `accessTokenFactory` on the SignalR connection. That puts tokens on the query string for WebSocket upgrades, which is standard but means short-lived access tokens and careful logging (never log query strings in production).

```csharp
[Authorize]
public class AuctionHub : Hub
{
    public async Task JoinLot(string lotId)
    {
        if (!await _lotAccess.CanViewAsync(Context.UserIdentifier!, lotId))
            throw new HubException("Forbidden");

        await Groups.AddToGroupAsync(Context.ConnectionId, LotGroup(lotId));
    }

    private static string LotGroup(string lotId) => $"lot:{lotId}";
}
```

Never trust a client-supplied group name without a server-side permission check. `JoinLot` validates access, then adds the connection to `lot:{id}`. The client does not get to invent `tenant:competitor`.

For user-targeted pushes (`Clients.User(userId)`), ensure your JWT claim mapping sets `NameIdentifier` consistently with your API policies. I have debugged hours of “notification never arrives” because SignalR resolved a different claim than `[Authorize]` on controllers.

When the SPA refreshes tokens, restart or reconnect SignalR. A connection authenticated at 9:00 AM with a token revoked at 9:15 should not keep receiving seller-only events.

## Server-side push after REST commands

Hub methods should not be the primary write path. The flow I standardize on:

1. Angular posts to a normal API endpoint (`POST /api/bids`)
2. API validates, persists, returns the command result to the caller
3. Application layer raises an event (`BidPlaced`)
4. A handler broadcasts to `lot:{id}` via `IHubContext<AuctionHub>`

The bidder gets an immediate HTTP response for optimistic UI. Everyone else gets the live update. If SignalR is temporarily down, the bid still exists; clients can poll or refresh. Making the websocket the only write path couples every integration test and mobile client to SignalR semantics.

```csharp
public class BidPlacedHandler : INotificationHandler<BidPlacedEvent>
{
    private readonly IHubContext<AuctionHub> _hub;

    public async Task Handle(BidPlacedEvent e, CancellationToken ct)
    {
        await _hub.Clients
            .Group($"lot:{e.LotId}")
            .SendAsync("BidUpdated", new BidUpdateDto(e.LotId, e.Amount, e.PlacedAtUtc), ct);
    }
}
```

Keep DTOs explicit and versioned. Include a monotonic version or timestamp so Angular can ignore stale messages after reorder or reconnect.

## Groups, fan-out, and scaling

Single-instance SignalR is straightforward. Production is not.

When you run multiple ASP.NET Core nodes behind a load balancer, connections stick to one instance. A broadcast from an API request handled on server A will not reach connections on server B unless you add a **backplane** or use **Azure SignalR Service**.

My default for Azure-hosted products:

- **Azure SignalR Service** in serverless or default mode for marketplace and SaaS workloads
- Configure the connection string in app settings; the ASP.NET Core app becomes a logical hub host while Azure manages connection scale

Without that, groups split across nodes and you get the exact bug I opened with: bids visible to half the room.

Even with Azure SignalR, design fan-out intentionally. Notifying five clinicians on a case update is cheap. Broadcasting every keystroke in a chatty admin grid to ten thousand connections is a capacity conversation. Load-test the fan-out you actually need and size units from measured connection counts and message rates, not from localhost demos.

Sticky sessions alone are a partial fix and a deploy headache. Treat backplane or Azure SignalR as part of the architecture slide, not a production surprise.

## Angular client lifecycle

One connection owner per authenticated session — usually a root-level service — not a new connection per component.

```typescript
// Pattern: feature components register interest; service owns the connection
this.auctionRealtime.joinLot(lotId);
this.auctionRealtime.bidUpdates$
  .pipe(takeUntilDestroyed(this.destroyRef))
  .subscribe(update => this.applyBidUpdate(update));
```

On route leave, leave groups and tear down handlers. `withAutomaticReconnect()` is useful but not magic: after reconnect, **re-join groups** and **fetch authoritative state from REST**. SignalR delivers deltas; your API delivers truth after a gap.

Show a small shell indicator: live, reconnecting, offline. Users tolerate “syncing…” for two seconds. They do not tolerate silent wrong numbers on a bid screen.

Deduplicate user-visible toasts by event id. Two browser tabs means two connections; that is fine. Two identical “You were outbid” toasts is sloppy.

## Notifications hub specifics

For notification feeds I combine:

- `Clients.User(userId)` for new notification events
- A REST `GET /api/notifications?since=` on connect and reconnect
- Mark-as-read through REST, not hub methods

Hub payloads carry `{ id, type, title, createdAt, version }`. Full body text can lazy-load when the user opens the item. Healthcare and marketplace apps both accumulate notification volume; keep pushes small.

Consider idempotency on the server when the same domain event might retry from a message bus. Notification id as a natural dedup key prevents duplicate rows and duplicate pushes.

## Observability and deploy behavior

Log connects, disconnects, authorization failures, and send failures with correlation ids tied to the REST request that triggered the push. Watch negotiate failure rate, connection duration, and message send errors. Reconnect storms after deploys are normal; idempotent handlers and backward-compatible payloads prevent UI flicker.

During rolling updates, keep event contracts compatible across versions. Adding a field is safe; renaming or changing type breaks clients mid-session.

## Testing what actually matters

Unit-test permission logic on group join, payload mapping, and client-side version comparison. One integration test: command → persist → hub message. One end-to-end path in Playwright for the highest-value live screen (auction update or notification badge).

Mock `@microsoft/signalr` in Angular unit tests. Save real connections for CI smoke tests or manual checklists.

## Checklist I share with clients

- Event catalog written before hub code
- Auth claims documented and aligned with API JWT
- Group naming convention and permission rules documented
- REST remains source of truth; SignalR is delivery
- Reconnect + resync behavior agreed with product
- Azure SignalR or backplane in the hosting diagram
- Load test on realistic fan-out

Ship one live loop first — one event, one screen, one group strategy — then expand. Real-time features fail quietly when teams skip reconnect resync and scale planning.

If you are adding auctions, notifications, or live dashboards to an ASP.NET Core and Angular product and want production-grade SignalR from the start, [get in touch](/contact).

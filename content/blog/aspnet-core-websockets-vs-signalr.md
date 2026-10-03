---
title: "ASP.NET Core WebSockets vs SignalR: When Raw Sockets Win"
description: "ASP.NET Core WebSockets vs SignalR: choose SignalR for groups and reconnect, or raw sockets when you must own the frames, auth, and scale-out."
date: "2026-10-03"
category: "api-design"
tags: ["ASP.NET Core", "SignalR", "WebSockets", "Angular", "C#"]
faq:
  - q: "Should I use raw WebSockets or SignalR in ASP.NET Core?"
    a: "Use SignalR for product realtime features (notifications, job progress, presence) where you want groups, reconnect, and an Angular client. Use raw WebSockets when you must speak an existing socket protocol, control frames yourself, or avoid the SignalR protocol on the wire."
  - q: "Does SignalR use WebSockets?"
    a: "Yes, WebSockets is SignalR's preferred transport. SignalR adds a hub protocol, group routing, and fallbacks (Server-Sent Events and long polling) on top. Choosing SignalR does not mean you left WebSockets; it means you stopped owning the framing."
  - q: "How does this differ from the SignalR realtime patterns post?"
    a: "The SignalR post shows how to ship hubs, auth, groups, and Azure SignalR. This page is the comparison: when that stack is the wrong tool and a mapped WebSocket endpoint is the honest design."
---

**ASP.NET Core WebSockets vs SignalR** is a transport decision: SignalR is a realtime application framework that prefers WebSockets; raw WebSockets are the browser and server primitives with no groups, no hub methods, and no reconnect policy unless you write them.

![SignalR hub with groups and IHubContext, beside a raw /ws endpoint that owns the frames](/images/blog/aspnet-core-websockets-vs-signalr.png)

**New to this** - stay here for the decision. **Shipping hubs** - [SignalR realtime patterns](/blog/signalr-aspnet-core-realtime). **Job progress on top of hubs** - [background reports with SignalR](/blog/background-report-signalr-aspnet-core).

## When should you choose ASP.NET Core WebSockets vs SignalR?

Search intent for **asp.net core websockets vs signalr** is a comparison. Readers already know they need a long-lived connection and want to know which API to build against. They are not asking for a full hub tutorial, a binary protocol RFC, or a front-end chat UI kit.

This page answers:

- what each option actually owns
- when a raw socket is the smaller system
- when SignalR's extras pay for themselves
- how auth, scale-out, and Angular differ
- how to prove the choice with a small endpoint, not a slide

It does not replace the SignalR patterns guide, and it does not teach you to invent a multiplexed protocol "for fun."

## When does this transport choice apply?

Use this decision when the client is a browser (Angular), a device, or another service that can open `wss://`, and the server is ASP.NET Core on Kestrel (App Service, containers, or AKS). It assumes .NET 8 or later, where `app.UseWebSockets()` and `MapHub` are both first-party.

It applies less when the "realtime" need is really "tell me when the job finishes" and a poll of `GET /jobs/{id}` every few seconds is acceptable. Do not open a socket for a status flag.

## What does each option actually own?

| You need | Raw WebSockets | SignalR |
|---|---|---|
| Frame-level binary protocol you already specified | You own it | You fight the hub protocol |
| Angular notifications, groups, "user is online" | You build it | Built in |
| Reconnect and transport fallback | You build it | Built in |
| Call the connection from a `BackgroundService` | You track sockets | `IHubContext` |
| Scale-out across instances | Sticky sessions or your own fan-out | Redis backplane or Azure SignalR Service |
| Non-.NET client that speaks WebSocket only | Natural fit | Needs a SignalR client |
| Payload inspection in browser DevTools | Opaque frames you defined | JSON hub messages, easy to read |

SignalR's wire protocol is not "WebSockets plus nothing." Clients invoke hub methods, the server sends invocations, and connection lifetime is negotiated. That is a feature until an external gateway already defined opcode bytes.

## When do raw WebSockets win?

> **Watch:** A raw socket has no groups and no reconnect. A background worker cannot push progress unless you kept a handle to that socket; that is what IHubContext is for.

Pick `UseWebSockets` when at least one of these is true.

**An existing protocol.** Market data, a device gateway, MQTT-over-WebSocket, or a partner that sends length-prefixed binary frames. Mapping that onto `InvokeAsync("OnTick", ...)` hides the protocol and still leaves you parsing inside the hub.

**You need backpressure and partial frames.** `WebSocket.ReceiveAsync` tells you `EndOfMessage`, message type, and count. You can stop reading when a producer is faster than your store. SignalR streaming exists, but it is still the hub streaming model, not your frame format.

**The client cannot take a SignalR library.** A small embedded browser, a third-party script, or a gateway that only has a WebSocket client. Forcing `@microsoft/signalr` on that peer is a political problem disguised as a NuGet problem.

**Connection count and protocol overhead dominate.** At very high fan-in of tiny binary frames, the hub dispatcher, JSON (or MessagePack) envelope, and group tables are real costs. Measure before you claim this. Most line-of-business apps never get there. If you have not load-tested, you have not earned raw sockets.

**You do not want fallbacks.** If the product requirement is "WebSocket or nothing" (so you fail closed when a proxy strips upgrade), a raw endpoint makes that obvious. SignalR will quietly succeed on long polling and hide a broken network path.

Raw sockets lose as soon as product language shows up: "notify this user," "join this tenant," "reconnect and resume," "send progress from a worker." That language is a hub.

## When does SignalR win?

Pick SignalR for Angular product features:

- in-app notifications and live lists
- progress from a background report or import
- presence and "someone else is editing"
- anything that must work from `IHubContext` inside a worker, with the request already finished

You also get a client that retries, a server that can target `User`, `Group`, or `Client`, and a hosting story (Azure SignalR Service) when you outgrow one node. Building those on raw sockets is a second product.

If the only reason you are avoiding SignalR is "I want fewer dependencies," read the raw endpoint below and count the lines you still owe: accept loop, fragmentation buffer, close handshake, cancellation, auth, and a map of connection ids. The dependency is usually cheaper.

## How do you map a production-shaped raw endpoint?

> **Watch:** Cap fragmented messages. EndOfMessage false with an unbounded buffer can stream a huge body into the process. Do not put the access token in the query string.

Map a path. Do not run the socket on every request. Authenticate before `AcceptWebSocketAsync`. Browsers cannot set `Authorization` on the `WebSocket` constructor, so the practical options are a same-site cookie or a short-lived ticket redeemed on the first message. A long-lived JWT in the query string ends up in logs and Referer headers. Prefer the cookie or a one-time ticket.

```csharp
app.UseWebSockets(new WebSocketOptions
{
    KeepAliveInterval = TimeSpan.FromSeconds(30)
});

app.Map("/ws/telemetry", async (HttpContext context, ITelemetrySink sink) =>
{
    if (context.User.Identity?.IsAuthenticated != true)
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return;
    }

    if (!context.WebSockets.IsWebSocketRequest)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        return;
    }

    using var socket = await context.WebSockets.AcceptWebSocketAsync();
    var buffer = new byte[8 * 1024];
    var tenant = context.User.FindFirstValue("tenant_id") ?? "";

    while (socket.State == WebSocketState.Open &&
           !context.RequestAborted.IsCancellationRequested)
    {
        var result = await socket.ReceiveAsync(buffer, context.RequestAborted);
        if (result.MessageType == WebSocketMessageType.Close)
        {
            await socket.CloseAsync(
                WebSocketCloseStatus.NormalClosure,
                "closing",
                CancellationToken.None);
            break;
        }

        if (!result.EndOfMessage)
        {
            await socket.CloseAsync(
                WebSocketCloseStatus.MessageTooBig,
                "fragmented frames are not accepted on this endpoint",
                CancellationToken.None);
            break;
        }

        var payload = buffer.AsMemory(0, result.Count);
        await sink.WriteAsync(tenant, payload, context.RequestAborted);
    }
});
```

This is intentionally strict: one complete message per receive, tenant taken from the authenticated principal, no static `ConcurrentDictionary` of sockets shown because that dictionary becomes your backplane and your memory leak. If you need fan-out to other connections, you are rewriting SignalR. Stop and use a hub, or put a real pub/sub behind the socket.

Angular, cookie auth already established on the API origin:

```typescript
const socket = new WebSocket("wss://app.example.com/ws/telemetry");
socket.binaryType = "arraybuffer";
socket.onmessage = (ev) => this.frames.update((n) => n + 1);
socket.onclose = () => this.scheduleReconnect(); // you own this policy
```

There is no `withAutomaticReconnect()`. If you copy a blog's `setTimeout(connect, 1000)` you will stampede the API after a deploy. Back off, and stop after the user signs out.

## How does SignalR look for the same product need?

> **Watch:** Reimplementing groups in a static dictionary next to a hub means you now run two realtime stacks.

If the feature is "push a notification to this user," do not open `/ws`. The hub is smaller because the framework owns the loop:

```csharp
builder.Services.AddSignalR();
app.MapHub<NotificationsHub>("/hubs/notifications");

[Authorize]
public sealed class NotificationsHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        var tenant = Context.User?.FindFirstValue("tenant_id");
        if (string.IsNullOrEmpty(tenant))
            throw new HubException("Missing tenant.");
        await Groups.AddToGroupAsync(Context.ConnectionId, $"tenant:{tenant}");
        await base.OnConnectedAsync();
    }
}
```

A worker publishes with `IHubContext<NotificationsHub>`. That call is local unless you configured a backplane. On two App Service instances with no backplane, the user connected to instance A never hears a send executed on instance B. Raw sockets have the same split-brain unless the load balancer sticks the connection and you never fan out across instances.

## How do auth, proxies, and scale-out differ?

**Auth.** Hub `[Authorize]` runs on the negotiate request and the connection. A raw Map endpoint must check `HttpContext.User` itself. Anonymous `AcceptWebSocketAsync` is a public TCP socket with extra steps.

**Proxies.** Both need `Upgrade` and `Connection` headers preserved, a long idle timeout, and `wss`. Azure App Service and most ingress controllers support this. If a corporate proxy strips upgrade, SignalR can fall back; a raw socket cannot. Decide whether fallback is a requirement before you "simplify" to WebSockets.

**Scale-out.** SignalR: Azure SignalR Service or a Redis backplane. Raw: session affinity plus a single instance, or an external bus and your own connection registry. Affinity alone does not deliver a message from a background worker on another pod.

**Cancellation.** Tie `ReceiveAsync` to `HttpContext.RequestAborted` (and the host stopping token if you hold the socket in a service). A loop that ignores abort survives the request and pins the connection.

## What fails in review?

- Treating SignalR as "just WebSockets" and then reimplementing groups in a static dictionary beside a hub. You now have two realtime stacks.
- Putting access tokens in the query string for a raw socket because a sample did it for SignalR's `accessTokenFactory`. Query strings are logged. Use cookies or a one-time ticket.
- Accepting fragmented messages without a size cap. `EndOfMessage == false` can stream a gigabyte into your process if you keep appending.
- Using raw sockets for server-to-browser progress while the worker has no handle to the socket. That is `IHubContext`'s job. See the report walkthrough.
- Forgetting close frames. Browsers show a dirty disconnect and intermediaries keep the connection half-open.
- Load-testing with one local tab and declaring raw sockets "faster."

## How do you verify the choice?

1. Open the site signed in, start the socket or hub, and confirm the negotiate or upgrade returns 101. A 401 means auth ran before accept. Good.
2. From a second browser profile (different user, different tenant), confirm you do not receive the first user's frames. If you do, the group or sink key is wrong.
3. Restart the pod that holds the connection. SignalR client should reconnect if you enabled it. A raw client should follow your backoff, not a hot loop.
4. Scale to two instances with no backplane and no affinity. Send from instance B. If the browser on instance A stays silent, you have reproduced the scale-out gap before production does.
5. Send a message larger than your buffer with `EndOfMessage` false and confirm the socket closes instead of buffering without limit.

## Which transport should you ship?

Default to SignalR for Angular and ASP.NET Core product realtime. Drop to raw WebSockets when the bytes on the wire are a protocol you do not control, or when you have measured hub overhead and you accept owning reconnect, auth tickets, and fan-out yourself.

If you hear "we might need groups later," start with SignalR. Migrating a homemade socket registry onto hubs is a rewrite, not a refactor.


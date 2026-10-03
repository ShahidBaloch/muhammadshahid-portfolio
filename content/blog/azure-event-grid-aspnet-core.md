---
title: "Azure Event Grid with ASP.NET Core: Handshake and Idempotent Ack"
description: "Azure Event Grid with ASP.NET Core webhooks: the OPTIONS or validationResponse handshake, caller authentication, and a fast ack that stays safe on retry."
date: "2026-10-03"
category: "architecture"
tags: ["Azure Event Grid", "ASP.NET Core", "Webhooks", "CloudEvents", "C#"]
related:
  - azure-service-bus-aspnet-core
  - idempotency-key-aspnet-core
  - aspnet-core-jwt-auth
  - azure-key-vault-secrets-aspnet-core
faq:
  - q: "Why does creating an Event Grid subscription fail against my ASP.NET Core endpoint?"
    a: "Event Grid proves you own the URL before it delivers events. CloudEvents subscriptions use an HTTP OPTIONS handshake. Event Grid schema subscriptions POST a validation event and expect the validation code echoed as JSON. If you only implemented POST for real events, creation fails."
  - q: "Should the webhook run business logic before it returns 200?"
    a: "No. Validate, persist the event id, queue the work, and return 2xx. Event Grid retries non-success responses, so a slow handler times out and then runs again."
  - q: "Is a shared secret in the query string enough to trust Event Grid?"
    a: "It is a weak signal and it lands in logs. Prefer delivery authenticated with Microsoft Entra ID, or a custom delivery header whose value comes from Key Vault. Still dedupe on the event id."
---

**Azure Event Grid with ASP.NET Core webhooks** means your API is a push subscriber: Event Grid POSTs CloudEvents or Event Grid events to an HTTPS endpoint you host, after a validation handshake that proves the endpoint agreed to receive them.

```text
Publisher (your API, storage, a custom topic)
    v
Event Grid topic
    v  HTTPS push
ASP.NET Core  /webhooks/eventgrid
    |  1. handshake (OPTIONS or validation event)
    |  2. authenticate the caller
    |  3. dedupe on event id
    v
Queue / channel  --> worker does the real work
    v
200 as soon as the event is durable
```

Event Grid is a mailbox that knocks twice. Your handler's job is to accept the envelope quickly and make the second knock harmless.

**Queues instead of webhooks** -> [Azure Service Bus](/blog/azure-service-bus-aspnet-core). **Dedupe** -> [idempotency keys](/blog/idempotency-key-aspnet-core). **Tokens** -> [JWT auth](/blog/aspnet-core-jwt-auth). **Secrets** -> [Key Vault](/blog/azure-key-vault-secrets-aspnet-core).

Search intent for **azure event grid asp.net core** is a how-to for the subscriber: pass validation, reject anyone who is not Event Grid, and process at-least-once delivery without double side effects.

## Pick CloudEvents or the Event Grid schema

Event Grid can deliver two envelopes. The handshake differs. Configure the subscription and the code for the same one.

| | Event Grid schema | CloudEvents 1.0 |
|---|---|---|
| Body | JSON array of events | One CloudEvent or a batch, depending on settings |
| Handshake | POST `Microsoft.EventGrid.SubscriptionValidationEvent`, echo `validationCode` | HTTP OPTIONS with `WebHook-Request-Origin` |
| Success for handshake | HTTP 200 and `{ "validationResponse": "<code>" }` | HTTP 200 and `WebHook-Allowed-Origin` |
| SDK type | `EventGridEvent` | `CloudEvent` |

Both live in `Azure.Messaging.EventGrid`. HTTP 202 is not a successful validation response for the Event Grid schema handshake; return 200. The validation POST has to finish quickly (tens of seconds, not "whenever the DB migration lock frees"). A handshake that blocks on a cold start you have not warmed will fail subscription creation and look like a bad URL.

Namespace topics and custom topics both use the CloudEvents abuse-protection OPTIONS flow when the output schema is CloudEvents. Do not implement only the validation-event POST and assume namespace delivery will accept it.

## Answer the CloudEvents OPTIONS handshake

> **Watch:** The validation response property name is picky. Echoing validationCode instead of validationResponse fails subscription creation, and SPA auth middleware can swallow OPTIONS so you log nothing.

Event Grid sends `OPTIONS` to the exact URL you registered, with `WebHook-Request-Origin`. You allow that origin or you do not. Event Grid does not honor `WebHook-Request-Callback` (you cannot validate asynchronously) and it ignores `WebHook-Allowed-Rate`. Respond in-process.

```csharp
app.MapMethods("/webhooks/eventgrid", new[] { HttpMethods.Options }, (HttpRequest request) =>
{
    if (!request.Headers.TryGetValue("WebHook-Request-Origin", out var origin))
        return Results.BadRequest();

    if (!string.Equals(origin.ToString(), "eventgrid.azure.net", StringComparison.OrdinalIgnoreCase))
        return Results.StatusCode(StatusCodes.Status403Forbidden);

    request.HttpContext.Response.Headers["WebHook-Allowed-Origin"] = origin.ToString();
    return Results.Ok();
});
```

Allow-list the origin. Echoing whatever header arrived, or always sending `*`, makes the handshake succeed for any caller who can hit the route. The value Event Grid sends in current documentation is `eventgrid.azure.net`; if a specific subscription documents a different origin, put that exact string in configuration rather than reflecting input. Compare ordinally, do not parse it as a URL and "normalize."

`OPTIONS` must reach the app. A CORS middleware that short-circuits `OPTIONS` and strips unknown response headers will eat the handshake. Exempt this path, or handle Event Grid's headers inside the same middleware on purpose. App Service and Front Door easy-auth that challenges `OPTIONS` will also fail subscription creation. The handshake is anonymous unless you configured Entra delivery and matched that on the subscription. Do not put an interactive login in front of it.

## Echo validationResponse, then accept the batch

```csharp
app.MapPost("/webhooks/eventgrid", async (
    HttpRequest request,
    IEventInbox inbox,
    CancellationToken ct) =>
{
    var body = await BinaryData.FromStreamAsync(request.Body, ct);

    EventGridEvent[] events;
    try
    {
        events = EventGridEvent.ParseMany(body);
    }
    catch (JsonException)
    {
        return Results.BadRequest();
    }

    foreach (var gridEvent in events)
    {
        if (gridEvent.TryGetSystemEventData(out var system) &&
            system is SubscriptionValidationEventData validation)
        {
            return Results.Ok(new { validationResponse = validation.ValidationCode });
        }
    }

    foreach (var gridEvent in events)
    {
        await inbox.AcceptAsync(new IncomingEvent(
            gridEvent.Id,
            gridEvent.EventType,
            gridEvent.Subject,
            gridEvent.Data), ct);
    }

    return Results.Ok();
});
```

`SubscriptionValidationEventData.ValidationCode` goes back as `validationResponse`. There is also a `validationUrl` for manual handshake when the endpoint cannot answer programmatically (Zapier-style tools). Your own ASP.NET Core endpoint can answer programmatically; do not leave creation sitting in `AwaitingManualAction` unless you meant to. The manual URL is short-lived. Do not log it.

A batch can contain the validation event only during subscribe. Do not require every POST to be a validation event, and do not run business code on the validation event.

CloudEvents delivery uses `CloudEvent.Parse` or `CloudEvent.ParseMany` on the notification POST, not `EventGridEvent.ParseMany`. If you guess wrong, every delivery looks like a poison message. Branch on the schema you configured, or on `Content-Type` (`application/cloudevents+json` versus `application/json`) once you have seen a real request from your topic. Log the content type at information when parsing fails. Do not log the body until you know it is free of payload data you would not put in Application Insights.

Register this POST only when the subscription output schema is CloudEvents. Do not also run `EventGridEvent.ParseMany` on the same URL.

```csharp
app.MapPost("/webhooks/cloudevents", async (
    HttpRequest request,
    IEventInbox inbox,
    CancellationToken ct) =>
{
    var body = await BinaryData.FromStreamAsync(request.Body, ct);
    var batch = request.ContentType?.Contains(
        "application/cloudevents-batch+json",
        StringComparison.OrdinalIgnoreCase) == true;

    CloudEvent[] events = batch
        ? CloudEvent.ParseMany(body)
        : [CloudEvent.Parse(body) ?? throw new JsonException("Empty CloudEvent.")];

    foreach (var cloudEvent in events)
    {
        await inbox.AcceptAsync(new IncomingEvent(
            cloudEvent.Id,
            cloudEvent.Type ?? "",
            cloudEvent.Subject,
            cloudEvent.Data ?? BinaryData.Empty), ct);
    }

    return Results.Ok();
});
```

## Authenticate the caller before you parse

> **Watch:** Do not trust a published source IP list, and do not log the full event data. Dead-letter storage is an inbox you still have to read.

Network location is not authentication. Event Grid's source IPs change. Pick one:

**Microsoft Entra delivery.** Configure the subscription to fetch a token for your app registration (audience = your API's App ID URI). Validate it with the same JWT bearer handler as the rest of the API, on this route only, with a policy that requires the Event Grid application identity rather than a human role. This is the option that matches [JWT auth](/blog/aspnet-core-jwt-auth) you already run. The OPTIONS handshake for CloudEvents stays unauthenticated; the notification POST does not.

**Custom delivery header.** Set a static header on the subscription, value stored in [Key Vault](/blog/azure-key-vault-secrets-aspnet-core), compared with `CryptographicOperations.FixedTimeEquals` on the UTF-8 bytes. Do not put that secret in the query string. Query strings are copied into access logs by every proxy you own and several you do not.

Reject missing or wrong credentials with 401 before you parse into your domain. Still parse only after auth. A validation handshake that is supposed to be anonymous has to be excluded from this check, or you will not be able to create the subscription.

## Ack only after the inbox insert commits

> **Watch:** Event Grid is at-least-once. Email and stock changes need an inbox unique key. Doing the EF work before you ack makes the whole batch retry.

Event Grid retries when the endpoint does not return success, then dead-letters if you configured a dead-letter destination. Retries are normal. Your handler must be idempotent.

```csharp
public async Task AcceptAsync(IncomingEvent incoming, CancellationToken ct)
{
    var inserted = await _db.Database.ExecuteSqlInterpolatedAsync($"""
        INSERT INTO EventInbox (EventId, EventType, ReceivedUtc, Payload)
        SELECT {incoming.Id}, {incoming.Type}, {DateTimeOffset.UtcNow}, {incoming.Payload}
        WHERE NOT EXISTS (SELECT 1 FROM EventInbox WHERE EventId = {incoming.Id})
        """, ct);

    if (inserted == 0)
        return;

    await _queue.EnqueueAsync(incoming.Id, ct);
}
```

The unique key on `EventId` is the dedupe. The queue is your worker, not the webhook thread. Same pattern as an [idempotency key](/blog/idempotency-key-aspnet-core): the first delivery wins, the retry hits the unique constraint and returns 200 anyway.

Return 200 after the insert commits. If you return 200 before the insert, a crash loses the event and Event Grid will not retry. If you do the business write in the request and it is slow, Event Grid times out, retries, and you get a second write unless the unique key saved you.

Poison messages: a payload you can never process should be stored and acknowledged, or it will burn the retry budget and block the subscription's health. Park it in an `EventDead` row and return 200. Reserve non-success status for "try again" (database unavailable). A 400 on a permanently bad body still retries on Event Grid until the retry policy ends, so 400 is not a reliable "drop this" signal.

Filter event types on the subscription (`SubjectBeginsWith`, included event types) so the endpoint does not wake up for blobs you do not care about. Filtering in code is a backup, not the design.

Publishing is the other half and it is smaller than receiving. `EventGridPublisherClient` with `EventGridEvent` or `CloudEvent`, credential from `DefaultAzureCredential`, and a subject that your subscribers can filter. Do not publish and subscribe inside one HTTP request in a loop; that couples their outages. Publish after your own transaction commits, or write an outbox row and let a worker publish. The outbox is what keeps "saved the order" and "emitted OrderPlaced" from diverging.

## What makes the subscription fail or double-apply?

- **CORS or the SPA auth middleware answering OPTIONS** with the wrong headers. Subscription creation fails with a generic webhook validation error and the app logs nothing useful. Log OPTIONS on this path while you integrate.
- **Returning the validation code with the wrong JSON name** (`validationCode` echoed back instead of `validationResponse`). The handshake is picky about the property name.
- **Treating at-least-once as exactly-once.** Email, invoices, and stock decrements need the inbox unique key. "Event Grid probably will not retry" is not a design.
- **Doing EF work per event before ack on a batch of hundreds.** One slow batch fails the whole POST and the whole batch is retried. Accept the batch, commit the inbox, return.
- **Logging full CloudEvent data.** Partner payloads carry data you would not put in a log sink. Log id, type, subject, and trace id.
- **Using the dead-letter blob as a second processor without a consumer.** Dead-letter is an inbox you are not reading. Alert on it.
- **Disabling HTTPS validation in dev and leaving it disabled.** Event Grid requires HTTPS for real subscriptions. A self-signed cert will not pass.
- **Assuming source IP allow lists from a blog stay current.** They do not. Authenticate the call.

## How do you verify handshake, auth, and dedupe?

1. Create the subscription against a dev URL (or a tunnel you control) and watch for either the OPTIONS request or the validation POST, matching the schema you selected. Creation reaches Succeeded without a manual browser GET of `validationUrl`.
2. A notification with a new id inserts one inbox row and returns 200. The same body posted again returns 200 and does not enqueue a second job.
3. A request without the Entra token or the delivery header returns 401 and inserts nothing.
4. An OPTIONS request with a random `WebHook-Request-Origin` does not receive `WebHook-Allowed-Origin`.
5. Stop SQL during a notification and confirm the status is a retryable failure, then start SQL and confirm the retried delivery lands once.
6. A deliberately unknown event type is parked or ignored once, and does not flap the subscription into an error state overnight.

When the handshake is boring and the inbox constraint is in place, Event Grid is just another authenticated POST with retries. That is the shape you want.


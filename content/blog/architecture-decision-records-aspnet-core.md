---
title: "Architecture Decision Records (ADRs) for ASP.NET Core Teams"
description: "Architecture decision records (ADR) for ASP.NET Core: one numbered file per choice, the old text left intact, and a new file when it changes."
date: "2026-10-03"
category: "architecture"
tags: ["ADR", "ASP.NET Core", "Architecture", "Documentation"]
faq:
  - q: "What is an Architecture Decision Record for an ASP.NET Core team?"
    a: "An ADR is a short, immutable note in the repo that states one decision, the context that forced it, and the consequences you accept. It is stored next to the code, numbered, and superseded by a later ADR instead of being silently rewritten."
  - q: "When should we write an ADR instead of a wiki page or a long ticket?"
    a: "Write an ADR when the choice is hard to reverse or easy to relitigate: public API shape, tenant data boundaries, broker choice, auth protocol, or where secrets live. Skip it for local refactors and for anything a pull request diff already explains."
  - q: "How does this differ from a design document or the threat-model post?"
    a: "A design doc explores options before you choose. A threat model enumerates abuses. An ADR records the choice you actually made so the next person does not reopen it by accident. STRIDE work can be the context section of an ADR; it is not a substitute for the decision line."
---

**Architecture decision records (ADRs) for an ASP.NET Core team** are markdown files in the repository. Each one freezes one decision: what you chose, why the context forced a choice, and what you are willing to live with. It is not a wiki, and it is not a second copy of the code.

```text
Proposal in a PR
    |
    v
docs/adr/0014-inbound-rate-limiting.md   status: Accepted
    |
    +-- later: 0022-... status: Accepted, supersedes 0014
    |
    v
0014 status flipped to Superseded, body left intact
```

**New to this** - stay here for the habit. **A decision worth recording** - [rate limiting vs Polly](/blog/aspnet-core-rate-limiting-vs-polly), [Kafka adoption](/blog/kafka-dotnet-aspnet-core), [WebSockets vs SignalR](/blog/aspnet-core-websockets-vs-signalr). **Threats that feed the context** - [STRIDE for APIs](/blog/stride-threat-modeling-aspnet-core-apis).

## How do you write an architecture decision record (ADR)?

Search intent for **architecture decision records adr** from a team shipping ASP.NET Core and Angular is practical: where the file lives, how long it is, who has to write it, and how it stays true after the decision changes. They have seen a `docs` folder rot. They do not need a survey of every ADR tool.

This page is the lightweight Michael Nygard shape, adapted to a .NET repo. It is not a Confluence rollout and not a rule that every pull request needs a new number.

## When does an ASP.NET Core team need an ADR?

Use ADRs on a codebase more than one person will touch in a year, especially when you already argue about the same topics: shared-schema multi-tenancy, JWT in local storage, Service Bus versus Kafka, server-side versus raw WebSockets. Solo prototypes do not need the ceremony until a second developer arrives. Start the folder on the first decision you would hate to re-explain.

The record lives in git (`docs/adr/` or `adr/` at the repo root), not in a chat thread. Chat is where the argument happened. The ADR is the outcome. Link the PR. Do not paste the argument transcript.

> **Watch:** A decision that lives only in chat will be reopened. If the ADR is not in the repo, the next pull request treats the choice as undocumented taste.

## What goes in the ADR file?

Name: `docs/adr/NNNN-short-kebab-title.md`. Numbers are monotonic and never reused. Gaps are fine if you abandon a draft. Dates are ISO dates. Status is one of: Proposed, Accepted, Superseded, Deprecated.

```markdown
# ADR 0014: Inbound rate limiting uses ASP.NET Core middleware

- Status: Accepted
- Date: 2026-10-03
- Deciders: API guild
- Supersedes: none
- Related: docs/adr/0009-httpclient-polly.md

**Context**

The public Angular API and partner keys share one App Service plan.
A single client can drive SQL and a billing HttpClient hard enough to time out everyone else.
We already run more than one instance, so an in-memory limiter is per process, not a global contract quota.
Polly is already on outbound HttpClients for retry and for the billing quota.

**Decision**

Use `AddRateLimiter` / `UseRateLimiter` for inbound calls, partitioned by `sub` (or API key), with `QueueLimit = 0` and HTTP 429 plus `Retry-After`.
Keep Polly's rate limiter on named outbound clients only.
Do not implement inbound limiting as a Polly policy wrapped around controllers.
A shared, cross-instance daily quota is out of scope until a partner contract requires it; that will be a gateway or Redis decision, not a middleware flag.

**Consequences**

- Each instance enforces its own window. Two instances approximately double the ceiling. We accept that until we have a global quota requirement.
- Angular must surface 429 instead of retrying immediately.
- A new outbound dependency needs its own limiter. Reviewers reject a typed client with no policy when the dependency documents a quota.
- Operators cannot read this decision from NuGet names alone. This ADR is the place we look before "simplifying" one of the limiters away.
```

That is a complete ADR. If yours is longer than two screens, you are writing a design doc. Link the doc from Context and keep the decision paragraph short enough to quote in review.

## How does a second ADR map to C#?

The rate-limiting record above is the shape. This one is a second complete ADR for a choice ASP.NET Core teams reopen: cache a public catalog in memory, or bring in a Redis output-cache store on day one. The record stays short. The implementation lives in the API project, not in the markdown file.

```markdown
# ADR 0015: Public catalog uses in-memory output cache

- Status: Accepted
- Date: 2026-10-03
- Deciders: API guild
- Supersedes: none
- Related: docs/adr/0014-inbound-rate-limiting.md

**Context**

GET /api/catalog is anonymous, varies only by page and page size, and runs on every Angular home screen.
The API runs as one instance today. A second instance is not scheduled.
Redis is already in the solution for a different feature, which makes "just use Redis" the easy slide.
Authenticated responses include tenant prices and must not share a cache entry.

**Decision**

Use ASP.NET Core output caching for an anonymous catalog policy only, with the in-memory store, a two-minute TTL, and vary-by page and pageSize.
Tag the entry catalog and evict that tag when a product write commits.
Do not call AddStackExchangeRedisOutputCache until a second API instance is an Accepted decision of its own.
Do not apply the catalog policy to any endpoint that reads User or a tenant claim.

**Consequences**

- Two instances would each keep their own copy. We accept that while hosting is still one instance.
- A product write that forgets to evict the catalog tag serves stale cards for up to two minutes. An application test covers that eviction.
- Redis output cache is the expected supersession, not a flag we flip quietly inside this file.
```

This is the code that makes ADR 0015 true. `AddOutputCache`, `CacheOutput`, and `IOutputCacheStore` are in the shared ASP.NET Core framework.

```csharp
public sealed record CatalogItem(string Sku, string Name, decimal Price);
public sealed record CreateProduct(string Sku, string Name, decimal Price);

public sealed class Product
{
    public required string Sku { get; set; }
    public required string Name { get; set; }
    public decimal Price { get; set; }
}

public sealed class CatalogDb : DbContext
{
    public CatalogDb(DbContextOptions<CatalogDb> options) : base(options) { }
    public DbSet<Product> Products => Set<Product>();
}

builder.Services.AddAuthorization();
builder.Services.AddOutputCache(options =>
{
    options.AddPolicy("catalog", policy => policy
        .Expire(TimeSpan.FromMinutes(2))
        .SetVaryByQuery("page", "pageSize")
        .Tag("catalog"));
});

var app = builder.Build();
app.UseOutputCache();

app.MapGet("/api/catalog", async (
    CatalogDb db,
    int? page,
    int? pageSize,
    CancellationToken cancellationToken) =>
{
    var index = Math.Clamp(page ?? 1, 1, 10_000);
    var size = Math.Clamp(pageSize ?? 20, 1, 50);

    var items = await db.Products.AsNoTracking()
        .OrderBy(product => product.Sku)
        .Skip((index - 1) * size)
        .Take(size)
        .Select(product => new CatalogItem(product.Sku, product.Name, product.Price))
        .ToListAsync(cancellationToken);

    return Results.Ok(items);
}).CacheOutput("catalog");

app.MapPost("/api/catalog/products", async (
    CreateProduct body,
    CatalogDb db,
    IOutputCacheStore cache,
    CancellationToken cancellationToken) =>
{
    db.Products.Add(new Product { Sku = body.Sku, Name = body.Name, Price = body.Price });
    await db.SaveChangesAsync(cancellationToken);
    await cache.EvictByTagAsync("catalog", cancellationToken);
    return Results.Created($"/api/catalog/products/{body.Sku}", new { body.Sku });
}).RequireAuthorization();
```

When a later ADR accepts a second instance, the superseding code is one package, `Microsoft.AspNetCore.OutputCaching.StackExchangeRedis`, and one registration. The policy name and the tag stay. The connection string stays in configuration or user-secrets, not in the ADR and not in source. `InstanceName` prefixes the keys. If the options type in the package version you restore has no `InstanceName` property, set `Configuration` only and confirm the prefix in that package's docs.

```csharp
builder.Services.AddStackExchangeRedisOutputCache(options =>
{
    options.Configuration = builder.Configuration.GetConnectionString("Redis");
    options.InstanceName = "clinic-output:";
});
```

A reviewer can reject a pull request that puts `.CacheOutput("catalog")` on a tenant endpoint. ADR 0015 already says that endpoint is out of scope. That is the point of having the decision and the code in the same conversation: the file states the rule, the endpoint attributes show whether the rule survived.

## What decision earns a number?

Write one when all of these are true:

- More than one reasonable option exists.
- Reversing it touches many projects, data, or clients (Angular, partners, mobile).
- A future hire will otherwise re-open it because the code alone looks arbitrary.

Good ASP.NET Core examples:

- JWT bearer versus cookie sessions for the SPA
- Shared schema plus query filters versus database per tenant
- Problem Details as the only error body
- SignalR versus raw WebSockets for notifications
- Data Protection for app tokens versus AES-GCM for columns other systems decrypt
- Where the key ring is stored (blob plus Key Vault, not the container disk)

Do not write an ADR for:

- renaming a private method
- which logging library wraps `ILogger` if the choice is already organization-wide and recorded
- a bug fix
- "we will add tests" 

A pull request description is enough for those. An ADR that restates the diff will not be maintained, and then the folder loses trust.

## What workflow survives a sprint?

1. Open the ADR as `Proposed` in the same PR as the first code that depends on it, or in a PR immediately before it. A decision recorded six months later is fan fiction.
2. Review the decision, not the prose. Ask: what did we reject, and where does this break at two instances, two tenants, or a hostile client?
3. Merge as `Accepted`. Link the ADR from the README section "Decisions" with one line per file. A table of contents is the only index you need.
4. When the decision changes, add a new ADR. Set the old status to `Superseded` and add "Superseded by ADR 0022" under the old status. Do not edit the old Decision section to pretend you always believed the new thing. You may fix a typo. You may not quietly replace the choice.
5. Rejected proposals can stay as `Deprecated` or as an Accepted ADR that says "we will not adopt X" if the rejection itself will be re-litigated. Deleting the file restarts the argument.

Deciders should be a role ("API guild"), not a single engineer, unless one person really is the owner. A name with no role becomes a ghost when they leave, and the team treats the ADR as their personal preference.

> **Watch:** One engineer's name on the file makes the next team treat the decision as that person's preference. When they leave, people rewrite the choice instead of superseding it.

## How do you tie the record to code without copying it?

The ADR should name the extension method or project (`UseRateLimiter` in `Clinic.Api`, or `AddOutputCache` in the example above) and the test that would fail if someone removes it. The file in `docs/adr` should not paste the implementation. Code changes; the decision paragraph should not. The C# further up this page is for the article, so you can see the decision and the code together. It does not belong copied into the ADR file.

In review, a PR that deletes `UseRateLimiter` without a superseding ADR is incomplete. You can enforce that socially. You can also add a one-line comment above the registration: "ADR 0014. Do not replace with an outbound-only policy." Comments rot faster than `docs/adr`, so the comment points at the file, not the other way around.

Angular decisions belong in the same folder if it is one repo (Nx or a `/client` folder). A separate front-end repo gets its own `docs/adr` and a link when the decision crosses the HTTP boundary (cookie auth, BFF, error shape). Two ADRs that disagree about who sends `traceparent` means you do not have a decision yet.

## How do you supersede a decision that failed?

ADR 0007 said "produce Kafka events from the order controller." Production lost messages after `SaveChanges` when the pod died, and produced ghosts when produce succeeded and the transaction rolled back. ADR 0018 supersedes it: "orders commit an outbox row; `KafkaOutboxPublisher` is the only producer; consumers are idempotent." The old file stays, status `Superseded`, so the next person sees the scar. Deleting 0007 is how the controller produce call comes back in a refactor.

> **Watch:** Deleting the old ADR because the new one is cleaner erases the scar. The controller-side produce comes back because nobody can see why it was rejected.

That pair is more valuable than a blank template. Steal the shape, not a tool that promises ADRs as a service.

## What fails in review?

- A `docs/adr` folder of empty templates and one real file. Either write the real file or do not add the folder.
- Status left at `Proposed` after the code shipped. Proposed means "not true yet." If the code is in production, the status is lying.
- Recording vendor marketing ("we chose Kafka because it is web scale") with no rejected alternative and no consequence. That cannot guide a later review.
- Putting secrets, tenant data, or customer names in the context. The repo is widely readable. Speak in roles and systems.
- One mega-ADR titled "backend architecture" that tries to freeze the whole system. It will be wrong in a quarter and nobody will supersede it because the diff is too big. One decision per file.
- Editing Accepted text in place during a incident so the file matches the hotfix. Write ADR N+1 tomorrow morning. The hotfix PR can say "supersedes pending."
- Confusing an ADR with a threat model. STRIDE finds issues. The ADR records which mitigation you adopted (and which you explicitly will not do).

## How do you verify the folder still matches the code?

1. A new hire can open `docs/adr`, sort by number, and answer "why is rate limiting not only Polly?" without asking in chat. If they cannot, the decision paragraph is vague.
2. Pick a live decision in code (auth scheme, hosting model, broker). Confirm exactly one Accepted ADR owns it. Zero means the next refactor is a coin flip. Two Accepted ADRs means the index is stale.
3. Change a decision in a drill: add a superseding file and flip status. Confirm the old decision sentence is still visible. If git blame only shows a rewritten file, the habit has already failed.
4. Review one recent PR that changed infrastructure. It should link an ADR or explicitly say "no decision; local change." Silence is how the folder stops matching the system.
5. Search the ADR folder for connection strings and real tenant identifiers. There should be none.

## How small should the folder stay?

The win is the next argument that does not happen, or that happens against a written consequence instead of a memory. Ten short Accepted records beat a documentation initiative. When a choice in this series (sockets, Kafka, aggregates, key management) survives contact with production, give it a number and move on.


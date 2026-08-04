---
title: "Deploying ASP.NET Core APIs to Azure App Service — What Actually Breaks"
description: "Lessons from shipping ASP.NET Core APIs to Azure App Service in healthcare and SaaS — configuration, deployment slots, secrets, health checks, and the failures that only show up after go-live."
date: "2026-03-20"
category: "architecture"
tags: ["Azure", "ASP.NET Core", "App Service", "DevOps"]
---

Azure App Service is the default landing zone for a lot of ASP.NET Core APIs I build for healthcare portals, SaaS billing backends, and eCommerce marketplaces. The first deploy always feels clean. The interesting work starts when IdentityServer token validation, SQL Server connection pooling, and Angular production builds all depend on the same App Service configuration being correct across staging and production.

This post is not a portal click-through. It is what I watch for when a team moves from "it works on my machine" to "it works under real traffic with secrets, slots, and on-call."

## Configuration is the product, not a side quest

The most expensive App Service incidents I have cleaned up were not code bugs. They were configuration drift.

App Service merges settings from several layers: `appsettings.json`, environment-specific files, Application settings in the portal, Key Vault references, and slot-specific overrides. ASP.NET Core reads them in a predictable order, but humans do not always write them in a predictable order. A staging slot that inherits production connection strings because someone checked "slot setting" wrong will ruin your weekend faster than any NullReferenceException.

My baseline for any API:

- **Never commit secrets.** Connection strings, IdentityServer client secrets, SendGrid keys, and Stripe webhooks live in App Service settings or Key Vault references.
- **Name settings consistently.** `ConnectionStrings__Default`, `IdentityServer__Authority`, `Cors__AllowedOrigins__0`. Typos in double-underscore nesting fail silently until runtime.
- **Fail fast on startup.** If a required setting is missing, throw during host build. A 503 at startup is easier to diagnose than partial success where auth works but reporting does not.

```csharp
var authority = builder.Configuration["IdentityServer:Authority"]
    ?? throw new InvalidOperationException("IdentityServer:Authority is not configured.");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = authority;
        options.Audience = "orders-api";
    });
```

Healthcare clients often ask for an audit trail of who changed production settings. Document that App Service configuration changes belong in Infrastructure as Code or a controlled pipeline, not ad hoc portal edits.

## Deployment slots: powerful when disciplined, dangerous when casual

Slots are the feature I recommend most often for SaaS APIs with an Angular front end. They are also the feature that causes the worst "we thought we were in staging" stories.

A healthy slot workflow:

1. Deploy to **staging** slot on every merge to main.
2. Run automated smoke tests against the staging URL.
3. **Swap** staging into production during a planned window.
4. Keep the previous production bits in the old staging slot for instant rollback (swap back).

What breaks in practice:

- **Sticky settings vs slot settings.** Connection strings marked as slot settings must differ between staging and production. If they do not, your staging deploy writes to production SQL Server. I have seen this in a clinic scheduling API where test appointments appeared on the live calendar.
- **Warm-up after swap.** Cold instances after swap can spike latency. Use `WEBSITE_SWAP_WARMUP_PING_PATH` pointing at your health endpoint so Azure hits `/health` before traffic shifts.
- **Identity redirect URIs.** If your API generates absolute URLs or your IdentityServer clients whitelist origins, verify both slot hostnames. A swap without updating Entra or IdentityServer client config produces opaque 401s that look like token bugs.

For eCommerce stacks, I also validate that webhook URLs registered with payment providers match the slot you are testing. Stripe does not care that you "meant" to hit staging.

## Secrets: Key Vault references and the permission gap

Key Vault references in App Service (`@Microsoft.KeyVault(SecretUri=...)`) are the right long-term pattern when multiple APIs share SQL credentials or signing keys. The failure mode is almost always **managed identity permissions**, not the syntax.

Checklist I run before calling secrets "done":

- System-assigned or user-assigned managed identity enabled on the App Service
- Key Vault access policy or RBAC granting **Get** on secrets to that identity
- Secret version strategy documented (auto-rotate vs pinned version)
- Local development uses `dotnet user-secrets` or `.env` — never production vault from a laptop

SQL Server authentication deserves its own note. For Azure SQL, prefer Entra ID auth where the client supports it. For legacy SQL Server VMs, store the connection string in Key Vault and use least-privilege logins per environment. Shared `sa`-style accounts across slots are a compliance finding waiting to happen in healthcare engagements.

## Health checks that Azure and your team can trust

App Service health checks are simple to configure and easy to misconfigure. Point the health check path at an endpoint that validates what "healthy" means for your API — not just `return Ok()`.

```csharp
builder.Services.AddHealthChecks()
    .AddSqlServer(
        builder.Configuration.GetConnectionString("Default")!,
        name: "sql",
        tags: new[] { "ready" })
    .AddUrlGroup(
        new Uri($"{authority}/.well-known/openid-configuration"),
        name: "identity",
        tags: new[] { "ready" });

app.MapHealthChecks("/health", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready")
});
```

Separate **liveness** from **readiness** when you can. Liveness can be cheap. Readiness should include SQL and any hard dependency your API cannot serve without.

What breaks:

- Health check hits `/health` but the endpoint requires authentication. Azure's probe gets 401 and cycles instances.
- Health check runs an expensive query. Under load, the probe itself becomes a denial of service.
- SQL firewall allows App Service outbound IPs in production but someone forgot to update the list after scaling the plan.

For Always On plans, enable Always On. APIs that idle out look like intermittent outages to Angular clients retrying failed calls.

## What breaks in real projects (the recurring list)

After several App Service migrations, the same categories of pain appear:

**Environment name surprises.** `ASPNETCORE_ENVIRONMENT` not set to `Production` in the App Service configuration means wrong logging, developer exception pages leaking stack traces, or Swagger enabled publicly. Verify in Application settings, not assumptions.

**Forwarded headers and HTTPS.** App Service terminates TLS at the edge. If your API builds redirect URLs or sets cookie `Secure` flags incorrectly, login flows from Angular break in production only. `UseForwardedHeaders()` with known proxy networks is not optional for OAuth and IdentityServer.

**File system assumptions.** App Service local storage is ephemeral and not shared across instances. Uploads to `wwwroot/uploads` disappear on restart and never sync between scaled instances. Use Azure Blob Storage for user files, exports, and report artifacts.

**EF Core migrations on startup.** Running `Database.Migrate()` on every instance start in a scaled-out farm causes migration locks and race conditions. Run migrations from CI or a one-off job, then deploy the app.

**Logging volume and cost.** Verbose logging to Application Insights without sampling can spike cost after launch. Set sensible defaults in production and use structured logging with correlation IDs so Angular-to-API traces line up.

**CORS and production Angular URLs.** Local `localhost:4200` in CORS policy is easy to forget removing. Production-only failures where preflight fails are classic first-week issues after DNS cutover.

## CI/CD habits that survive handoff

Whether the pipeline lives in GitHub Actions or Azure DevOps, I keep the deploy stage boring:

```yaml
- run: dotnet publish src/Api/Api.csproj -c Release -o ./publish
- uses: azure/webapps-deploy@v3
  with:
    app-name: clinic-api-prod
    slot-name: staging
    package: ./publish
```

Run unit and integration tests before publish. Deploy to staging slot first. Gate production swap on smoke tests hitting `/health`, one authenticated read, one write, and a CORS preflight from the production Angular origin.

Document rollback: swap back, or redeploy the last known-good artifact from pipeline artifacts. Clients remember the rollback path more than the deploy path.

## Observability before you need it

Application Insights wired at host startup pays off on day three, not day three hundred. Track dependency calls to SQL Server, outbound HTTP to IdentityServer, and request duration per controller. Alert on failure rate and dependency latency — not just CPU.

For healthcare APIs, also log **who** performed sensitive actions at the application layer. App Service access logs tell you who hit the server; they do not replace audit events in your domain.

## Bottom line

App Service is a strong host for ASP.NET Core when configuration, slots, secrets, and health checks are treated as part of the release — not as infrastructure tickets filed after launch. Most production fires I have seen were preventable with slot discipline, honest health probes, and secrets outside source control.

If you are planning an Azure App Service deployment for a .NET API with staging slots, Key Vault, and a proper smoke-test gate, [reach out](/contact) — I help teams get the boring path right so the product work can continue.

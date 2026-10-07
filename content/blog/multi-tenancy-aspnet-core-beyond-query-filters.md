---
title: "Multi-Tenancy in ASP.NET Core Beyond Query Filters"
description: "Multi-tenancy in ASP.NET Core beyond EF Core query filters — connection-per-tenant, tenant resolution middleware, and resource-based auth."
date: "2026-10-01"
category: "architecture"
tags: ["ASP.NET Core", "Multi-Tenancy", "EF Core", "SaaS", "C#"]
related:
  - ef-core-global-query-filters-soft-delete
  - aspnet-core-rbac-guide
  - modular-monolith-vs-microservices-dotnet
faq:
  - q: "Are EF Core global query filters enough for multi-tenancy?"
    a: "No. Filters help enforce TenantId on queries, but multi-tenancy also needs tenant resolution, write-path enforcement, connection strategy, cache keys, and authorization. Filters can be bypassed with IgnoreQueryFilters."
  - q: "Shared schema vs database-per-tenant in ASP.NET Core?"
    a: "Shared schema with TenantId is cheaper and simpler ops for most SaaS. Database-per-tenant increases isolation and compliance flexibility at the cost of migrations, connection routing, and tooling complexity."
  - q: "How do I resolve the current tenant in ASP.NET Core?"
    a: "Common options: subdomain host, header, path prefix, or a claim on the JWT/BFF session. Resolve once per request into ITenantContext and use that in EF and caches — never trust a raw client-supplied tenant id without authZ."
---

**Multi-tenancy in ASP.NET Core beyond query filters** means resolving *which tenant* is speaking, isolating reads/writes for that tenant, and picking a data strategy (shared schema vs DB-per-tenant) — not only adding `HasQueryFilter(e => e.TenantId == current)`.

```text
Request
  │
  ├─ resolve tenant (host/header/claim)
  ├─ ITenantContext
  ├─ authN/authZ
  └─ EF: filters + explicit TenantId on inserts
           │
           └─ caches keyed by tenant
```

**New to this** → stay here. **Filter mechanics / soft delete** → [EF global query filters](/blog/ef-core-global-query-filters-soft-delete). **Roles/policies** → [RBAC](/blog/aspnet-core-rbac-guide).

Search intent for **asp.net core multi tenancy ef core** is how-to architecture — not an Azure SaaS sales page.

## Project layout

Tenant infrastructure is cross-cutting but must not bleed into Domain. Keep the interface in Application; keep the implementation and middleware in Infrastructure.

```text
src/
├── Clinic.Domain/
│   └── Tenancy/
│       └── ITenantEntity.cs               # interface for EF entities
├── Clinic.Application/
│   └── Tenancy/
│       └── ITenantContext.cs              # only this crosses layer boundaries
├── Clinic.Infrastructure/
│   └── Tenancy/
│       ├── TenantContext.cs               # scoped implementation
│       ├── TenantResolutionMiddleware.cs  # claim → host → slug resolution
│       └── TenantConnectionFactory.cs    # DB-per-tenant connection routing
├── Clinic.Data/
│   └── AppDbContext.cs                   # filters + SaveChanges enforcement
└── Clinic.Web/
    └── Authorization/
        └── EncounterTenantHandler.cs     # BOLA defense — TenantId ownership check
```

The domain project references nothing from Infrastructure or Web. The only tenant type Application imports is `ITenantContext`.

## Multi-tenancy goals: isolation, cost, ops complexity

| Goal | Shared schema | DB-per-tenant |
|---|---|---|
| Cost | Lower | Higher |
| Blast radius of bad query | Higher | Lower |
| Migrations | One | N databases |
| Noisy neighbor | Possible | Reduced |
| Custom schema per customer | Hard | Easier |

Most Angular + ASP.NET Core healthcare/SaaS products I ship start **shared schema** with strong `TenantId` discipline. Move hot/regulated tenants to dedicated DBs when a contract demands it — not on day one for vanity isolation.

Modular monolith boundaries still apply ([modular monolith vs microservices](/blog/modular-monolith-vs-microservices-dotnet)).

## Shared schema + TenantId vs database-per-tenant

### Shared schema

```csharp
public interface ITenantEntity
{
    Guid TenantId { get; set; }
}

public class Encounter : ITenantEntity
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Mrn { get; set; } = "";
}
```

Indexes almost always start with `TenantId` for hot tables:

```csharp
builder.Entity<Encounter>()
    .HasIndex(e => new { e.TenantId, e.Id });
```

### Database-per-tenant

You need a **catalog** DB mapping tenant → connection string (or naming convention), plus a safe connection factory. Migrations become a fleet problem. Use when enterprise contracts require physical isolation.

Hybrid exists: shared for SMB, dedicated for enterprise — keep `ITenantContext` stable so application code does not fork.

## Tenant resolution: host, header, path, token claim

```csharp
public interface ITenantContext
{
    Guid TenantId { get; }
    string TenantSlug { get; }
    bool IsResolved { get; }
}

public sealed class TenantContext : ITenantContext
{
    public Guid TenantId { get; set; }
    public string TenantSlug { get; set; } = "";
    public bool IsResolved => TenantId != Guid.Empty;
}
```

Middleware (claim-preferred for authenticated APIs):

```csharp
public sealed class TenantResolutionMiddleware
{
    private readonly RequestDelegate _next;

    public async Task InvokeAsync(HttpContext http, TenantContext tenant, ITenantCatalog catalog)
    {
        // 1) Authenticated claim wins for APIs
        var claim = http.User.FindFirst("tenant_id")?.Value;
        if (Guid.TryParse(claim, out var fromClaim))
        {
            tenant.TenantId = fromClaim;
            tenant.TenantSlug = http.User.FindFirst("tenant_slug")?.Value ?? "";
            await _next(http);
            return;
        }

        // 2) Host subdomain for marketing/public
        var host = http.Request.Host.Host; // acme.app.example.com
        var slug = host.Split('.').FirstOrDefault();
        var info = await catalog.FindBySlugAsync(slug, http.RequestAborted);
        if (info is not null)
        {
            tenant.TenantId = info.Id;
            tenant.TenantSlug = info.Slug;
        }

        await _next(http);
    }
}
```

**Never** take `X-Tenant-Id` from the Angular client as sole truth for authorized APIs. A header is fine as a *hint* for public sites; for PHI APIs the tenant must come from the authenticated session/token and match resource ownership ([RBAC](/blog/aspnet-core-rbac-guide)).

Path-based (`/t/{slug}/...`) works but complicates Angular routing and deep links.

## ITenantContext and EF Core integration (beyond HasQueryFilter)

Registration:

```csharp
builder.Services.AddScoped<TenantContext>();
builder.Services.AddScoped<ITenantContext>(sp => sp.GetRequiredService<TenantContext>());
```

DbContext:

```csharp
public class AppDbContext : DbContext
{
    private readonly ITenantContext _tenant;

    public AppDbContext(DbContextOptions<AppDbContext> options, ITenantContext tenant)
        : base(options) => _tenant = tenant;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Encounter>()
            .HasQueryFilter(e => e.TenantId == _tenant.TenantId);
    }

    public override Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        foreach (var entry in ChangeTracker.Entries<ITenantEntity>())
        {
            if (entry.State == EntityState.Added)
                entry.Entity.TenantId = _tenant.TenantId;
            else if (entry.State == EntityState.Modified)
            {
                // prevent tenant reassignment
                entry.Property(nameof(ITenantEntity.TenantId)).IsModified = false;
            }
        }
        return base.SaveChangesAsync(ct);
    }
}
```

Why filters alone fail:

1. **`IgnoreQueryFilters()`** in reports accidentally returns all tenants  
2. **Raw SQL** bypasses filters  
3. **Missing TenantId on insert** if someone uses another DbContext path  
4. **Global admin** features need an explicit, audited bypass — not a forgotten Ignore  

Soft-delete filters often compose with tenant filters — understand both ([query filters post](/blog/ef-core-global-query-filters-soft-delete)).

## Index and connection-switching considerations

**Shared schema:** composite indexes `(TenantId, ...)` on almost every tenant table. Watch parameter sniffing across uneven tenants ([parameter sniffing](/blog/ef-core-sql-server-parameter-sniffing)).

**DB-per-tenant:**

```csharp
builder.Services.AddDbContext<AppDbContext>((sp, options) =>
{
    var tenant = sp.GetRequiredService<ITenantContext>();
    var cs = sp.GetRequiredService<ITenantConnectionFactory>().GetConnectionString(tenant.TenantId);
    options.UseSqlServer(cs);
});
```

Cache connection strings carefully; do not let an unauthenticated user force open connections to arbitrary DBs.

## Angular SPA tenant switcher pitfalls

Symptoms:

- User switches clinic in UI; API still serves old tenant because JWT claim unchanged  
- `IMemoryCache` / Redis keys without tenant prefix leak data across switch  
- Interceptor sends `X-Tenant-Id` but API ignores it (good) while UI thinks it worked (bad)

Patterns that work:

1. **Switch = re-login or token exchange** that issues new claims for the target tenant  
2. **BFF session** updates server-side tenant and rotates cookie  
3. Cache keys: `tenant:{id}:patients:page:{n}`  
4. Clear TransferState/client stores on switch  

UI hiding of other tenants is not isolation.

## Testing tenant isolation

```csharp
[Fact]
public async Task Cannot_read_other_tenant_encounter()
{
    var factory = _factory.WithAuthenticatedUser(tenantA);
    var client = factory.CreateClient();
    var otherId = await SeedEncounterAsync(tenantB);

    var res = await client.GetAsync($"/api/encounters/{otherId}");
    Assert.True(res.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Forbidden);
}
```

Add tests that `IgnoreQueryFilters` code paths used by admins require a special policy. Integration tests with [WebApplicationFactory](/blog/aspnet-core-webapplicationfactory) catch horizontal leaks early.

## Migration path from single-tenant apps

1. Add `TenantId` nullable → backfill → non-nullable  
2. Introduce `ITenantContext` defaulting to the single known tenant  
3. Add query filters behind a feature flag in staging  
4. Fix `IgnoreQueryFilters` call sites  
5. Update Angular env to host/claim model  
6. Only then onboard tenant #2  

Expand/contract migrations apply ([EF migrations production](/blog/ef-core-migrations-production)).

## Checklist

1. Document resolution strategy (claim/host/path)  
2. `ITenantContext` scoped per request  
3. Filters **and** SaveChanges enforcement  
4. Indexes start with TenantId  
5. Cache keys tenant-scoped  
6. Ban unaudited `IgnoreQueryFilters`  
7. Angular switch triggers new authz context  
8. Isolation tests in CI  
9. Admin cross-tenant tools explicitly authorized  
10. Decide shared vs dedicated per tier  

## Common mistakes I still see

1. **Filters without write-path TenantId assignment**  
2. **Trusting Angular-sent tenant headers** for PHI APIs  
3. **Redis keys without tenant**  
4. **Reporting queries with IgnoreQueryFilters in a shared service used by tenants**  
5. **Assuming Clean Architecture folders equal tenancy** — see [clean architecture](/blog/clean-architecture-aspnet-core) for structure, not isolation  

## Verification

- User A token cannot read User B tenant resources by id  
- Inserted rows always carry server TenantId  
- Switching tenant in UI changes claim/session; old token fails  
- Admin bypass requires policy and is audited  
- Explain plans show TenantId predicates on hot queries  

## If an interviewer asks

How do you implement multi-tenancy in ASP.NET Core with EF Core?

**Strong answer:** Resolve tenant into `ITenantContext`, enforce on SaveChanges, use query filters as a safety net not the only control, key caches by tenant, and never trust the SPA for tenant identity. Choose shared schema first; dedicated DB when contracts require isolation.

**Related:** [EF global query filters](/blog/ef-core-global-query-filters-soft-delete) · [RBAC](/blog/aspnet-core-rbac-guide) · [Clean architecture](/blog/clean-architecture-aspnet-core) · [Modular monolith](/blog/modular-monolith-vs-microservices-dotnet)


## Hosted services and tenant context

Background workers do not have an HTTP tenant. Patterns:

1. **Message carries TenantId** — processor sets `TenantContext` manually before calling handlers  
2. **Per-tenant loop** — night job iterates tenants from catalog with a scope each  

```csharp
foreach (var t in await catalog.ListActiveAsync(ct))
{
    await using var scope = _scopes.CreateAsyncScope();
    var tenant = scope.ServiceProvider.GetRequiredService<TenantContext>();
    tenant.TenantId = t.Id;
    tenant.TenantSlug = t.Slug;
    var job = scope.ServiceProvider.GetRequiredService<INightlyJob>();
    await job.RunAsync(ct);
}
```

Forgetting this is how “global” jobs write rows with `Guid.Empty` TenantId.

## Authorization handlers that double-check tenant

Even with filters, authorize resources:

```csharp
public sealed class EncounterTenantHandler : AuthorizationHandler<SameTenantRequirement, Encounter>
{
    private readonly ITenantContext _tenant;
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        SameTenantRequirement requirement,
        Encounter resource)
    {
        if (resource.TenantId == _tenant.TenantId)
            context.Succeed(requirement);
        return Task.CompletedTask;
    }
}
```

BOLA across tenants is a Top-10 item — filters help, handlers finish the job.

## Feature flags and per-tenant configuration

Store overrides keyed by tenant (`MaxUploadMb`, `EnableExperimentalUi`). Load via `IOptionsMonitor` snapshots carefully — do not leak Tenant A’s flags into Tenant B’s scoped services. A `ITenantFeatureSet` resolved per request is clearer than global statics.

## Data retention and deletion

Tenant offboarding is part of multi-tenancy:

- Soft-delete tenant + background purge  
- Or hard delete with legal hold exceptions  
- Shared schema makes “DELETE WHERE TenantId=” straightforward; DB-per-tenant drops a database  

Document the runbook before sales promises “we’ll delete everything in 24h.”

## Extra verification drills

1. Two tenants seeded with colliding natural keys (same MRN string) — both exist, queries never mix  
2. Admin API with IgnoreQueryFilters requires `PlatformAdmin` policy  
3. Redis FLOOD test: warm cache as tenant A, switch user, ensure miss for tenant B  

## Practitioner note

The day a clinic called saying they saw another clinic’s schedule, the root cause was a reporting endpoint with `IgnoreQueryFilters()` reused by a “quick” Angular admin widget. Filters are a seatbelt; review every bypass like a privileged API.


## Onboarding tenant #2 checklist (expanded)

1. Create tenant row in catalog with slug + status  
2. Issue first admin invite bound to tenant claim  
3. Smoke: create patient, list patients, negative cross-tenant GET  
4. Verify email templates show correct branding per tenant  
5. Verify blob container prefix / key prefix isolation  
6. Load test with uneven data sizes (parameter sniffing awareness)  

## Soft-delete interaction

A global `IsDeleted` filter plus tenant filter means every query has two predicates. Admin “restore” tools must know which filters to ignore — and must still constrain TenantId unless platform admin.

## Angular route guards are not tenant isolation

`canActivate` that checks `user.tenantId` improves UX. Attackers call the API directly. Pair with server `ITenantContext` + resource auth.


## Caching and output cache vary-by-tenant

If you enable output caching for any public tenant-branded page, vary by tenant key. A cached HTML snippet from Tenant A served to Tenant B is a high-severity incident. Prefer `no-store` for authenticated API JSON.

## ITenantContext in tests

Set tenant on the scoped `TenantContext` inside WebApplicationFactory setups before seeding and calling HTTP. Reset between tests to avoid cross-test bleed when the factory is cached.


## Row-level security in SQL as defense in depth

Some teams add SQL Server RLS predicates matching `SESSION_CONTEXT` tenant id. EF filters remain; RLS catches raw SQL mistakes. It is operationally heavier — use when compliance asks for defense in depth, not as a substitute for application discipline.

## Domain events and tenant stamps

When raising domain events, include `TenantId` in the payload. Downstream bus consumers must set `ITenantContext` before touching EF. Silent `Guid.Empty` creates orphan data.

## Practical “beyond filters” summary

Filters are necessary seatbelts. Multi-tenancy is resolution + write enforcement + cache keys + authZ + ops. If your design doc only mentions `HasQueryFilter`, it is incomplete.

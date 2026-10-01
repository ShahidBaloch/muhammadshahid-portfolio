---
title: "Testcontainers for ASP.NET Core: Real SQL and Redis Testing"
description: "ASP.NET Core integration tests with Testcontainers — real SQL or Postgres and Redis beside WebApplicationFactory. Extends WebApplicationFactory; not Angular E2E."
date: "2026-10-01"
category: "testing"
tags: ["ASP.NET Core", "Testcontainers", "Integration Testing", "EF Core", "Redis"]
related:
  - aspnet-core-webapplicationfactory
  - redis-caching-aspnet-core
  - ef-core-migrations-production
  - aspnet-core-unable-to-resolve-service
faq:
  - q: "What are Testcontainers for ASP.NET Core?"
    a: "Testcontainers spins real Docker containers from tests so WebApplicationFactory talks to real SQL and Redis instead of in-memory fakes."
  - q: "When should I use Testcontainers instead of EF InMemory?"
    a: "When bugs depend on real SQL constraints, concurrency tokens, migrations, or Redis semantics. Keep InMemory for unit tests."
  - q: "How do Testcontainers relate to WebApplicationFactory?"
    a: "WebApplicationFactory hosts the API. Testcontainers provides dependencies. Override config with container connection strings."
---


**Testcontainers for ASP.NET Core** means your integration tests boot real SQL and Redis in Docker, point WebApplicationFactory at those endpoints, and assert HTTP plus data behavior that in-memory providers cannot simulate honestly.

```text
xUnit test
   |
   |- Testcontainers: SQL Server / Postgres
   |- Testcontainers: Redis
   |- WebApplicationFactory<Program>
          |  overrides ConnectionStrings + Redis
          v
     ASP.NET Core pipeline + EF Core + IDistributedCache
```

Metaphor: InMemory EF is a flight simulator. Testcontainers is a runway check with a real engine.

**New to this** stay here for SQL/Redis containers and factory wiring. **Factory basics** see [WebApplicationFactory](/blog/aspnet-core-webapplicationfactory). **Redis usage** see [Redis caching](/blog/redis-caching-aspnet-core). **Migrations** see [EF migrations production](/blog/ef-core-migrations-production).

Search intent for **testcontainers asp.net core** is how-to: real dependencies in CI with the factory pattern you already use.

## When in-memory EF lies to you

InMemory (and often SQLite compatibility mode) will not catch incorrect filtered unique indexes under concurrency, raw SQL assumptions, provider-specific concurrency token failures, migration drift (EnsureCreated is not migrate), or Redis TTL and serializer issues.

If production is SQL Server, your highest-value integration tests should speak SQL Server — or Postgres if that is prod. Matching engines beats false green builds.

## WebApplicationFactory refresher

You host the API with WebApplicationFactory and WithWebHostBuilder to replace services. This post assumes that comfort level — see the factory intro. Here we add external connection strings from containers.

## Testcontainers SQL module setup

```bash
dotnet add package Testcontainers.MsSql
dotnet add package Testcontainers.Redis
dotnet add package Microsoft.AspNetCore.Mvc.Testing
```

Collection fixture so one SQL container serves many tests:

```csharp
public sealed class SqlContainerFixture : IAsyncLifetime
{
    public MsSqlContainer Sql { get; } = new MsSqlBuilder()
        .WithImage("mcr.microsoft.com/mssql/server:2022-latest")
        .WithPassword("Your_strong_password123")
        .Build();

    public string ConnectionString => Sql.GetConnectionString();

    public async Task InitializeAsync()
    {
        await Sql.StartAsync();
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer(ConnectionString)
            .Options;
        await using var db = new AppDbContext(opts);
        await db.Database.MigrateAsync();
    }

    public Task DisposeAsync() => Sql.DisposeAsync().AsTask();
}

[CollectionDefinition("Sql")]
public class SqlCollection : ICollectionFixture<SqlContainerFixture> { }
```

Postgres uses PostgreSqlBuilder the same way. Prefer the engine you run in Azure. First CI run is slow while images pull; cache layers on self-hosted runners when you can.


## Redis container for IDistributedCache tests

```csharp
public sealed class RedisContainerFixture : IAsyncLifetime
{
    public RedisContainer Redis { get; } = new RedisBuilder()
        .WithImage("redis:7-alpine")
        .Build();

    public string ConnectionString => Redis.GetConnectionString();

    public Task InitializeAsync() => Redis.StartAsync();
    public Task DisposeAsync() => Redis.DisposeAsync().AsTask();
}
```

Wire both in a custom factory:

```csharp
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    private readonly SqlContainerFixture _sql;
    private readonly RedisContainerFixture _redis;

    public ApiFactory(SqlContainerFixture sql, RedisContainerFixture redis)
    {
        _sql = sql;
        _redis = redis;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:AppDb"] = _sql.ConnectionString,
                ["ConnectionStrings:Redis"] = _redis.ConnectionString
            });
        });
    }
}
```

Your production Program should register stack exchange Redis cache from configuration. Then tests exercise cache-aside paths for real — see [Redis caching](/blog/redis-caching-aspnet-core).

## Connection string injection pattern

Rules:

1. Do not hard-code localhost,1433 in tests — container host and port are dynamic.
2. Override configuration early so AddDbContext reads the container string.
3. If DbContext is registered with a hard-coded lambda, remove and re-add in ConfigureTestServices (classic factory pitfall; overlaps [unable to resolve service](/blog/aspnet-core-unable-to-resolve-service)).

```csharp
builder.ConfigureTestServices(services =>
{
    var descriptor = services.SingleOrDefault(
        d => d.ServiceType == typeof(DbContextOptions<AppDbContext>));
    if (descriptor is not null) services.Remove(descriptor);

    services.AddDbContext<AppDbContext>(o =>
        o.UseSqlServer(_sql.ConnectionString));
});
```

Use either configuration override or service replace — not three conflicting strategies.

## Auth helpers and seed data

```csharp
public sealed class TestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public TestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : base(options, logger, encoder) { }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, "test-user"),
            new Claim("clinic_id", "11111111-1111-1111-1111-111111111111"),
            new Claim(ClaimTypes.Role, "ClinicAdmin")
        };
        var identity = new ClaimsIdentity(claims, "Test");
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), "Test");
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
```

Seed per test or per fixture with a scope from factory.Services. Prefer migrated schema over EnsureCreated so you test the same migrations you deploy ([migrations](/blog/ef-core-migrations-production)).

## CI runners and Docker

GitHub-hosted Linux runners support Docker. Run dotnet test on ubuntu-latest after setup-dotnet. SQL Server images are memory-heavy — Postgres or Azure SQL Edge can be leaner for PR builds when dialects align.

Mark integration tests with a Trait Category so unit-only jobs stay fast:

```csharp
[Fact]
[Trait("Category", "Integration")]
public async Task Put_appointment_roundtrips() { }
```

```bash
dotnet test --filter Category!=Integration
dotnet test --filter Category=Integration
```

## Flake control and cleanup

| Cause | Mitigation |
|---|---|
| Shared mutable DB state | Respawn reset between tests, or transaction rollback |
| Fixed port collisions | Let Testcontainers assign ports |
| Cold image pull timeouts | Increase first-start timeout; pre-pull in CI |
| Parallel tests fighting one DB | Collection fixtures + limited parallelization |
| Time-dependent assertions | Use TimeProvider / clock abstraction |

Always DisposeAsync containers via IAsyncLifetime fixtures.

## Example test

```csharp
[Collection("Sql")]
public sealed class AppointmentsTests
{
    private readonly ApiFactory _factory;

    public AppointmentsTests(SqlContainerFixture sql, RedisContainerFixture redis)
    {
        _factory = new ApiFactory(sql, redis);
    }

    [Fact]
    public async Task Get_appointment_returns_seeded_row()
    {
        var client = _factory.CreateClient();
        var res = await client.GetAsync($"/api/appointments/{id}");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }
}
```

Assert SQL row effects and Redis key presence when the feature claims to cache — status codes alone are not enough.

## Pitfalls

- Reusing one dirty database across unrelated tests without reset.
- Calling EnsureCreated and Migrate inconsistently.
- Forgetting Redis when testing cache invalidation.
- Pulling Angular Playwright into this suite — keep E2E elsewhere.
- SQL Server on ARM runners — image availability differs.
- Starting a new container per Fact — too slow; share via fixtures.

## Verification

1. Disable Docker; confirm tests fail clearly, not hang forever.
2. Run twice locally — second run should not require logic changes.
3. Break a migration deliberately — suite should fail at fixture init.
4. Assert a unique constraint violation bubbles as your API designs — InMemory may have allowed the insert.
5. In CI logs, confirm container start and migrate lines once per job.

## Practitioner checklist

1. Add MsSql/Postgres and Redis Testcontainers packages.
2. Collection fixtures start containers and migrate once.
3. WebApplicationFactory overrides connection strings.
4. Test auth handler for happy and forbidden paths.
5. Trait-filter integration tests in CI.
6. Reset data between tests.
7. Keep pure unit tests on fakes — do not force Docker on every edit.

## If an interviewer asks

**How do you integration-test ASP.NET Core APIs?** WebApplicationFactory for the pipeline; Testcontainers for real SQL/Redis; migrate schema; seed; assert HTTP and side effects; run in CI with Docker.

**Why not just SQLite?** Closer than InMemory, still not your production engine. Prefer matching provider for migration and SQL fidelity.


## Choosing SQL Server vs Postgres vs SQL Edge in tests

| Engine | When I pick it | Watch-outs |
|---|---|---|
| SQL Server 2022 image | Production is Azure SQL / SQL Server | Heavy RAM; slow cold start |
| Azure SQL Edge | Linux/ARM-friendly SQL surface | Feature subset — validate you need nothing Edge lacks |
| Postgres | Production is Flexible Server / PG | Different SQL dialect — do not mix with SQL Server prod |

Do not run SQL Server tests against a Postgres production mental model. The point of Testcontainers is fidelity, not "any container."

## Respawn pattern for clean state

When collection fixtures keep one database alive, wipe user tables between tests:

```csharp
public async Task ResetAsync(string connectionString)
{
    await using var conn = new SqlConnection(connectionString);
    await conn.OpenAsync();
    var respawner = await Respawner.CreateAsync(conn, new RespawnerOptions
    {
        DbAdapter = DbAdapter.SqlServer,
        SchemasToInclude = new[] { "dbo" }
    });
    await respawner.ResetAsync(conn);
}
```

Call ResetAsync in the test constructor or before each Fact that mutates data. Migrations stay applied; rows do not leak.

## Testing cache invalidation end-to-end

1. Seed an entity; GET once — assert Redis key created (ConnectionMultiplexer in the test).
2. PUT update; GET again — assert payload changed and cache rebuilt or invalidated per your policy.
3. With InMemory DistributedCache, you can pass this accidentally while production Redis serialization fails. Containers catch that.

```csharp
var mux = await ConnectionMultiplexer.ConnectAsync(_redis.ConnectionString);
var db = mux.GetDatabase();
Assert.True(await db.KeyExistsAsync($"appt:{id}"));
```

Only do this when your product code uses predictable key names — or expose a test-only diagnostic endpoint guarded by Environment.

## Parallelization policy

xUnit runs collections in parallel by default collections isolation. Put all SQL-backed tests in one collection if they share one container, or use multiple containers if you need speed and have RAM. Document the choice in the test project README so someone does not add [Collection("Sql")] and [Collection("Other")] that both migrate the same fixed port.

## Local developer experience

- Require Docker Desktop / engine running; fail fast with a clear message if `docker info` fails.
- Optional: `USE_TESTCONTAINERS=0` fallback to a developer local SQL — but then CI must still use containers.
- Keep unit test projects free of Testcontainers package references so IDE test explorers stay snappy.



## Mapping failures back to product code

When a containerized test fails, classify quickly:

1. **HTTP 500 with EF exception** — migration missing column, or test used EnsureCreated against Migrate-shaped schema.
2. **Timeout connecting** — container not ready; wait for `GetConnectionString` only after StartAsync completes; add health wait if needed.
3. **Redis connection refused** — wrong connection string key override; print effective config in failure message (never in production logs).
4. **Auth 401** — TestAuthHandler not registered on the same scheme name the API expects.

Add a single dump helper in the test project that writes environment name and connection host (not password) on failure — saves an hour of "works on my machine" debates.

## What this page deliberately skips

- Angular Playwright or Cypress E2E against a full stack — different job, different flake profile.
- Kafka/Service Bus containers — same Testcontainers idea; worth a sibling post when messaging is in scope.
- Performance benchmarking in integration tests — keep these correctness-focused; put load tests elsewhere.


## Related

**Related:** [WebApplicationFactory](/blog/aspnet-core-webapplicationfactory) · [Redis caching](/blog/redis-caching-aspnet-core) · [EF migrations](/blog/ef-core-migrations-production) · [DI unable to resolve](/blog/aspnet-core-unable-to-resolve-service)

---
title: "ASP.NET Core Integration Tests with WebApplicationFactory"
description: "Master ASP.NET Core integration testing with WebApplicationFactory, Testcontainers SQL Server, synthetic Auth handlers, and Respawn isolation."
date: "2026-09-18"
updated: "2026-10-03"
category: "testing"
tags: ["ASP.NET Core", "Testing", "WebApplicationFactory", "Testcontainers", "xUnit", "Architecture"]
related:
  - testcontainers-aspnet-core-sql-redis
  - aspnet-core-api-validation
  - aspnet-core-global-exception-handling
  - aspnet-core-jwt-auth
faq:
  - q: "What does WebApplicationFactory test that unit tests miss?"
    a: "WebApplicationFactory spins up the full Kestrel pipeline in memory: middleware order, authentication/authorization handlers, FluentValidation filters, model binding, dependency injection lifetimes, and global exception handlers. Unit tests testing controller classes directly bypass all these critical failure points."
  - q: "Why is Program inaccessible from the xUnit test project?"
    a: "In .NET 6+, top-level statements compile into an internal Program class. To expose it to WebApplicationFactory<Program>, declare 'public partial class Program { }' at the bottom of Program.cs or add InternalsVisibleTo in the csproj."
  - q: "How should I isolate the database between tests with WebApplicationFactory?"
    a: "Use Testcontainers to spin up a real, ephemeral SQL Server Docker container for the test suite, and use Respawn to reset the database state (truncate tables) between individual test executions in milliseconds."
  - q: "How do I bypass external Identity Providers (Entra ID, Auth0) in integration tests?"
    a: "Register a custom TestAuthHandler inheriting from AuthenticationHandler<AuthenticationSchemeOptions> in ConfigureTestServices. This allows tests to authenticate with synthetic user IDs and roles via request headers without making network calls to external OAuth servers."
---

**`WebApplicationFactory<Program>`** is the cornerstone of integration testing in ASP.NET Core. Instead of instantiating controller classes as raw objects with mocked dependencies, `WebApplicationFactory` boots the complete ASP.NET Core hosting pipeline in memory—routing, model binding, filters, DI registrations, and exception handlers—and issues real HTTP calls via `HttpClient`.

```text
xUnit Integration Test
       │
       ▼
Test HttpClient ──► WebApplicationFactory<Program> (In-Memory Kestrel)
                          │
                          ├── Middleware Pipeline (Auth, Validation, Exceptions)
                          ├── DI Container (Overridden with Test Services)
                          └── Real SQL Server (Managed via Testcontainers)
```

**New to this** → start with [Making Program visible](#1-making-program-visible-to-tests). **Testcontainers setup** → [Testcontainers with SQL & Redis](/blog/testcontainers-aspnet-core-sql-redis). **Validation testing** → [API validation guide](/blog/aspnet-core-api-validation). **Interview prep** → [If an interviewer asks](#if-an-interviewer-asks).

## Real-world analogy

Testing a restaurant by calling controller methods directly is like testing a chef by asking them to chop an onion in an isolated room with no oven, no waiters, and no dining room. The onion is chopped, but you haven't tested if the order ticket reached the kitchen, if the stove works, or if the waiter dropped the plate.

`WebApplicationFactory` tests the entire restaurant: you sit in the dining room, submit an order ticket via the front desk (`HttpClient`), and verify that the food arriving on your plate matches the menu specification.

## 1. Making Program visible to tests

In modern C# with top-level statements, append this single line to the bottom of `Program.cs` in your API project:

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

// ... services and middleware configuration ...

app.Run();

// Required to allow WebApplicationFactory<Program> in xUnit test project
public partial class Program { }
```

## 2. Building a robust CustomWebApplicationFactory with Testcontainers

Instead of using the deprecated in-memory EF Core database provider (which fails to enforce foreign keys, transactions, or SQL-specific constraints), use Testcontainers to run real SQL Server instances:

```csharp
// Tests/Infrastructure/CustomWebApplicationFactory.cs
using System.Data.Common;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Testcontainers.MsSql;
using Xunit;

namespace Portfolio.Tests.Infrastructure;

public sealed class CustomWebApplicationFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly MsSqlContainer _dbContainer = new MsSqlBuilder()
        .WithImage("mcr.microsoft.com/mssql/server:2022-latest")
        .Build();

    public string ConnectionString => _dbContainer.GetConnectionString();

    public async Task InitializeAsync()
    {
        // 1. Start the ephemeral SQL Server container
        await _dbContainer.StartAsync();

        // 2. Apply EF Core migrations once
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.MigrateAsync();
    }

    public new async Task DisposeAsync()
    {
        await _dbContainer.StopAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureTestServices(services =>
        {
            // 3. Remove production DbContext registration
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.RemoveAll<DbConnection>();

            // 4. Inject Testcontainers SQL Server connection string
            services.AddDbContext<AppDbContext>(options =>
                options.UseSqlServer(_dbContainer.GetConnectionString()));

            // 5. Replace external OAuth with synthetic Test Authentication Handler
            services.AddAuthentication(defaultScheme: "TestScheme")
                .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(
                    "TestScheme", options => { });
        });
    }
}
```

## 3. Synthetic TestAuthHandler for Role-based testing

Avoid calling external OAuth identity providers (Entra ID, Auth0, IdentityServer) in integration tests:

```csharp
// Tests/Infrastructure/TestAuthHandler.cs
using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

public sealed class TestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string DefaultUserId = "usr_test_123";
    public const string DefaultUserRole = "Administrator";

    public TestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder) : base(options, logger, encoder) { }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        // Allow tests to override User ID and Roles via HTTP headers
        var userId = Request.Headers["X-Test-UserId"].FirstOrDefault() ?? DefaultUserId;
        var role = Request.Headers["X-Test-Role"].FirstOrDefault() ?? DefaultUserRole;

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, userId),
            new Claim(ClaimTypes.Name, "Test User"),
            new Claim(ClaimTypes.Role, role),
            new Claim("tenant_id", "tenant_alpha")
        };

        var identity = new ClaimsIdentity(claims, "TestScheme");
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, "TestScheme");

        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
```

## 4. Writing clean xUnit integration tests

```csharp
// Tests/Features/Orders/CreateOrderTests.cs
using System.Net;
using System.Net.Http.Json;
using Portfolio.Tests.Infrastructure;
using Xunit;

public class CreateOrderTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;
    private readonly CustomWebApplicationFactory _factory;

    public CreateOrderTests(CustomWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task CreateOrder_WithValidPayload_Returns201Created()
    {
        // Arrange
        var request = new CreateOrderRequest(
            CustomerId: Guid.NewGuid(),
            TotalAmount: 250.00m,
            Currency: "USD"
        );

        // Act
        var response = await _client.PostAsJsonAsync("/api/v1/orders", request);

        // Assert
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var result = await response.Content.ReadFromJsonAsync<OrderDto>();
        Assert.NotNull(result);
        Assert.Equal(250.00m, result.TotalAmount);
    }

    [Fact]
    public async Task CreateOrder_WithEmptyBody_Returns400BadRequestProblemDetails()
    {
        // Act - Empty body triggers FluentValidation / Model Validation
        var response = await _client.PostAsJsonAsync("/api/v1/orders", new { });

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
        Assert.NotNull(problem);
        Assert.Contains("TotalAmount", problem.Errors.Keys);
    }

    [Fact]
    public async Task CreateOrder_AsViewerRole_Returns403Forbidden()
    {
        // Arrange - Send custom role header to test authorization policy
        using var requestMessage = new HttpRequestMessage(HttpMethod.Post, "/api/v1/orders")
        {
            Content = JsonContent.Create(new { CustomerId = Guid.NewGuid(), TotalAmount = 50.0m })
        };
        requestMessage.Headers.Add("X-Test-Role", "Viewer"); // Non-admin

        // Act
        var response = await _client.SendAsync(requestMessage);

        // Assert
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
```

## Common mistakes and pitfalls

- **Using EF Core InMemory Provider instead of SQL Containers**: EF Core InMemory does not enforce foreign keys, unique indexes, or raw SQL queries, leading to false-positive tests that break in production. Use Testcontainers with real SQL Server.
- **Using `ConfigureServices` instead of `ConfigureTestServices`**: Registrations in `ConfigureServices` run before `Program.cs` finishes, causing your test replacements to be overwritten by production registrations. Always use `ConfigureTestServices`.
- **Booting a new `WebApplicationFactory` per test**: Creating a new factory instance for every test method destroys performance. Share the factory instance across tests in the test class using `IClassFixture<CustomWebApplicationFactory>`.
- **Database state contamination between tests**: Tests writing duplicate IDs or modifying shared rows will cause race conditions when xUnit executes tests in parallel. Use Respawn or transactional rollbacks to reset table states between test runs.

## If an interviewer asks

**30-second answer:** `WebApplicationFactory<Program>` boots the complete ASP.NET Core pipeline in memory, executing real middleware, routing, model binding, authorization, and exception handlers. By replacing external dependencies with Testcontainers (SQL/Redis) and synthetic authentication schemes, it provides high-fidelity integration testing with fast in-memory HTTP execution.

**Strong answer:** In production enterprise engineering, testing controllers directly in unit tests is an anti-pattern because it skips 90% of what fails in production: pipeline ordering, custom auth handlers, filter validation, and SQL constraints. We build a shared `CustomWebApplicationFactory` using Testcontainers for realistic SQL Server and Redis instances. We override services cleanly using `ConfigureTestServices`, bypass external OAuth using a header-configurable `TestAuthHandler`, and reset database state using Respawn between test runs to guarantee deterministic, isolated test executions.

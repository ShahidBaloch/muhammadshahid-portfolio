---
title: "ASP.NET Core Integration Tests with WebApplicationFactory"
description: "Test an ASP.NET Core API through its real pipeline with WebApplicationFactory: replace the database, send HTTP, and check status codes instead of calling controllers as classes."
date: "2026-09-18"
updated: "2026-09-18"
category: "api-design"
tags: ["ASP.NET Core", "Testing", "WebApplicationFactory", "xUnit"]
related:
  - aspnet-core-api-validation
  - aspnet-core-minimal-apis
  - aspnet-core-global-exception-handling
  - aspnet-core-jwt-auth
faq:
  - q: "What does WebApplicationFactory test?"
    a: "It boots your real Program, middleware, routing, and validation, then lets the test send HTTP. It does not replace the framework with mocks. Replace only external systems such as the database or a downstream HTTP client."
  - q: "Why is Program inaccessible from the test project?"
    a: "The top-level statements generate an internal Program class. Add a public partial class Program at the bottom of Program.cs, and InternalsVisibleTo if you still need internals. The test project then uses WebApplicationFactory<Program>."
  - q: "Should integration tests hit the production database?"
    a: "No. Point the factory at a local SQL container or a dedicated test database and migrate that. Do not share a developer database across tests that delete rows."
---

Controller unit tests skip the bugs that reach production: model validation, the exception handler, and auth. `WebApplicationFactory` sends a real request through that pipeline.

Hub: [API design](/learning/api-design). Validation behavior these tests should lock: [API validation](/blog/aspnet-core-api-validation).

## Real-world analogy

You taste a dish in the real kitchen, on the real plates, with the real pass. You do not cook it in a toy oven and declare the restaurant fine. The only swap is the meat: a test cut, not the walk-in freezer. `WebApplicationFactory` is the kitchen. The database is the test cut.

## Worked example

A controller test builds `CreateOrderRequest` and calls the action method. It returns 200. In production an empty body returns 400, because the validation filter never ran in the unit test. The factory boots `Program`, the test posts `{}` to `/api/v1/orders`, and the status is 400 with the same error body Angular already handles. That is the bug the unit test could not see. Auth in that test is a local scheme, not a call to Entra.

## Make Program visible

At the bottom of `Program.cs`:

```csharp
public partial class Program { }
```

The test project references the API and does not need a copied `Startup`.

## Factory

```csharp
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureTestServices(services =>
        {
            // Remove the production DbContext registration and add a test one.
        });
    }
}
```

`ConfigureTestServices` runs after the app's registrations, so you can remove and replace. `ConfigureServices` runs too early and your replacement loses.

## One test

```csharp
public class OrderTests : IClassFixture<ApiFactory>
{
    private readonly HttpClient _client;

    public OrderTests(ApiFactory factory) =>
        _client = factory.CreateClient();

    [Fact]
    public async Task Create_rejects_an_empty_body()
    {
        var response = await _client.PostAsJsonAsync("/api/v1/orders", new { });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
```

Assert the status code and the error envelope, not a private method. The empty-body case is how you know [validation](/blog/aspnet-core-api-validation) is actually wired.

## Auth in tests

Do not call Entra in a test. Add a test scheme that reads a header, or issue a JWT with the test signing key from [JWT auth](/blog/aspnet-core-jwt-auth). The middleware still runs. You only skip the identity provider.

## Isolation

Give each test its own rows, or reset the schema between tests. A shared fixture is fast and then flaky when two tests insert `Order 1`. Create the client per test if auth headers differ. Reuse the factory: booting the host is the expensive part.

Unhandled exceptions should still become the JSON your Angular client expects. Hit a route that throws and assert 500 plus that body, which is [the exception handler](/blog/aspnet-core-global-exception-handling), not a debugger breakpoint.

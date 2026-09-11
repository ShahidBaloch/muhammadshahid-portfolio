---
title: "Asynchronous Class in C#: Writing Async Methods on a Type"
description: "What an asynchronous class means in C# — async methods, Task return types, IAsyncDisposable, and ASP.NET Core service patterns. Plus how asynchronous class differs from online course terminology."
date: "2026-09-08"
updated: "2026-09-08"
category: "async-concurrency"
tags: ["Asynchronous Programming", "C#", "async await", ".NET", "ASP.NET Core"]
related:
  - asynchronous-meaning-definition
  - csharp-async-await-aspnet-core
  - async-vs-sync-programming
  - csharp-task-vs-thread
faq:
  - q: "What is an asynchronous class in C#?"
    a: "C# does not have a special async class keyword. An asynchronous class is a type whose public API exposes async methods returning Task or Task<T>, uses await for I/O, and optionally implements IAsyncDisposable. Examples: repositories, HttpClient wrappers, and application services injected into ASP.NET Core controllers."
  - q: "What is asynchronous class meaning in education?"
    a: "In online learning, an asynchronous class is a self-paced course without required live meetings. That is different from C# async methods. This article covers the programming meaning."
  - q: "Should every method on a class be async?"
    a: "Only methods that perform I/O or call other async APIs. Keep fast synchronous helpers synchronous. Mixing .Result on async methods inside a class causes the same starvation as in controllers."
  - q: "Can a class constructor be async?"
    a: "No. Use async factory methods (public static async Task<MyService> CreateAsync(...)) or initialize after construction via an IAsyncInitializer pattern. Constructors cannot be async."
---

**Asynchronous class** means two different things on Google — online education and programming. This article covers the **C# meaning**: how to design a type whose methods use `async`/`await` correctly on ASP.NET Core.

Education definitions: [async vs sync](/blog/async-vs-sync-programming) (includes synchronous class meaning). Foundations: [asynchronous meaning and definition](/blog/asynchronous-meaning-definition).

## Asynchronous class in C# (programming)

There is no `async class` keyword in C#. Developers say **asynchronous class** when a type's contract is mostly **async methods** that return `Task` or `Task<T>` and perform I/O with `await`.

```csharp
public sealed class OrderService
{
    private readonly AppDbContext _db;

    public OrderService(AppDbContext db) => _db = db;

    public async Task<OrderDto?> GetByIdAsync(Guid id, CancellationToken ct)
    {
        var order = await _db.Orders
            .AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == id, ct);
        return order is null ? null : Map(order);
    }

    public async Task<IReadOnlyList<OrderDto>> ListRecentAsync(int take, CancellationToken ct)
    {
        var rows = await _db.Orders
            .AsNoTracking()
            .OrderByDescending(o => o.CreatedAt)
            .Take(take)
            .ToListAsync(ct);
        return rows.Select(Map).ToList();
    }

    private static OrderDto Map(Order order) => new(order.Id, order.Total);
}
```

Properties of a well-designed asynchronous class:

| Practice | Why |
|---|---|
| `Async` suffix on method names | Convention — signals Task-returning API |
| `CancellationToken` last parameter | Client disconnect stops SQL |
| `Task` / `Task<T>` return types | Never `async void` except rare event handlers |
| `await` all the way down | No `.Result` inside the class |
| Scoped dependencies (`DbContext`) | Injected per request — not stored on singletons |

Register in DI as usual. The class does not need special registration because it is "async."

## Async factory — when construction needs I/O

Constructors cannot be `async`. If creation requires I/O (load config from blob, warm cache), use a static factory:

```csharp
public sealed class RateClient
{
    private readonly HttpClient _http;

    private RateClient(HttpClient http) => _http = http;

    public static async Task<RateClient> CreateAsync(
        IHttpClientFactory factory,
        CancellationToken ct)
    {
        var http = factory.CreateClient("rates");
        // Warm-up or metadata fetch during creation
        using var response = await http.GetAsync("/health", ct);
        response.EnsureSuccessStatusCode();
        return new RateClient(http);
    }

    public Task<decimal> GetUsdAsync(string pair, CancellationToken ct) =>
        _http.GetFromJsonAsync<decimal>($"/rates/{pair}", ct)!;
}
```

Use sparingly — most services should rely on injected `IHttpClientFactory` without async construction.

## IAsyncDisposable — async cleanup

When a class holds resources that need async teardown:

```csharp
public sealed class BlobLeaseWorker : IAsyncDisposable
{
    private readonly BlobClient _blob;

    public async ValueTask DisposeAsync()
    {
        await _blob.DeleteIfExistsAsync();
    }
}
```

`await using` ensures cleanup runs asynchronously. Pair with `BackgroundService` for long-lived workers — see [BackgroundService async patterns](/blog/csharp-backgroundservice-hosted-service-async).

## Controller consuming an asynchronous class

```csharp
[ApiController]
[Route("api/orders")]
public sealed class OrdersController : ControllerBase
{
    private readonly OrderService _orders;

    public OrdersController(OrderService orders) => _orders = orders;

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<OrderDto>> Get(Guid id, CancellationToken ct)
    {
        var order = await _orders.GetByIdAsync(id, ct);
        return order is null ? NotFound() : Ok(order);
    }
}
```

The controller and service are both "asynchronous classes" in the informal sense — async methods end to end.

## Online asynchronous vs asynchronous class (education)

| Phrase | Usually means | This article |
|---|---|---|
| **Asynchronous class** | Self-paced online course | C# type with async methods |
| **Online asynchronous** | Remote learning without live sessions | N/A — see [async vs sync](/blog/async-vs-sync-programming) education table |
| **Synchronous class** | Live scheduled lectures | Blocking C# methods |

If you are building a learning platform on .NET, your **domain** might model "async courses" while your **API** uses async I/O — different layers, same vocabulary.

## Mistakes in asynchronous classes

| Mistake | Fix |
|---|---|
| `.Result` in a service method | `await` |
| `async void` helper | `async Task` |
| Singleton holding scoped `DbContext` | Scoped service or `IDbContextFactory` |
| `Task.Run` wrapping every EF call | `await ToListAsync` directly |
| No `CancellationToken` parameter | Add and pass through to EF/HTTP |

## If an interviewer asks

**"Design an asynchronous repository."**  
Methods return `Task<T>`, accept `CancellationToken`, use EF async extensions, no `.Result`, registered scoped with `DbContext`.

**"Can a class be async?"**  
Methods can be async. The class itself is not marked async — only methods use `async`/`await`.

**"Async class vs async method?"**  
Colloquial vs precise. Only methods are `async`. "Async class" means the type's surface is Task-based.

More: [async/await in ASP.NET Core](/blog/csharp-async-await-aspnet-core). Hub: [async & threading](/learning/async-concurrency).

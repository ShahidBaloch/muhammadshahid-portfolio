---
title: "C# Delegates Explained: Func, Action, and Events in Plain English"
description: "C# delegates explained simply: what a delegate is, Func vs Action vs Predicate, lambdas, multicast delegates, events, and where you already use them in ASP.NET Core."
date: "2026-11-16"
category: "csharp"
tags: ["C#", ".NET", "Delegates", "ASP.NET Core"]
related:
  - csharp-strategy-pattern
  - aspnet-core-middleware-order
  - csharp-records-explained
faq:
  - q: "What is a delegate in C#?"
    a: "A delegate is a type that holds a reference to a method with a specific signature. You can store it in a variable, pass it to another method, and call it later, just like a value."
  - q: "What is the difference between Func and Action?"
    a: "Func returns a value: Func<int, string> takes an int and returns a string. Action returns nothing: Action<string> takes a string and returns void. Predicate<T> is an older name for Func<T, bool>."
  - q: "What is the difference between a delegate and an event?"
    a: "An event is a delegate with restrictions. Code outside the class can only subscribe (+=) and unsubscribe (-=). Only the class that owns the event can raise it or replace its subscribers."
---

Most developers use C# delegates every day without thinking of them that way. Every LINQ `Where`, every `app.MapGet(...)` handler, every `services.AddScoped(sp => ...)` passes a delegate. Once you see that, a lot of .NET stops feeling like magic.

## A delegate is a variable that holds a method

That's the whole idea. A delegate type describes a method signature, and a delegate value points to a method that matches it.

```csharp
public delegate decimal PriceRule(decimal price);

decimal TenPercentOff(decimal price) => price * 0.9m;

PriceRule rule = TenPercentOff;   // store the method
decimal result = rule(100m);      // call it later: 90
```

`rule` isn't the result of calling `TenPercentOff`. It's the method itself, ready to be called whenever you want, by whoever has it.

## Func, Action and Predicate: delegates you don't have to declare

Writing a custom delegate type for every signature gets old fast, so .NET ships generic ones. In modern code, these cover almost every case:

```csharp
Func<decimal, decimal> discount = price => price * 0.9m;    // takes decimal, returns decimal
Action<string> log = message => Console.WriteLine(message); // takes string, returns nothing
Predicate<Order> isLarge = order => order.Total > 1000m;    // takes Order, returns bool
```

- **`Func<..., TResult>`**: the last type parameter is the return type.
- **`Action<...>`**: returns `void`.
- **`Predicate<T>`**: same as `Func<T, bool>`. You'll see it in older APIs like `List<T>.Find`.

The arrow syntax (`price => price * 0.9m`) is a lambda: an inline, unnamed method. A lambda becomes a delegate as soon as you assign it to a delegate type.

I declare my own delegate type only when a name makes the code clearer, like `PriceRule` above, or when I need `ref` or `out` parameters, which `Func` can't express.

## Where you already use C# delegates

Look at a normal ASP.NET Core `Program.cs`:

```csharp
builder.Services.AddScoped<IClock>(sp => new SystemClock());        // Func<IServiceProvider, IClock>

app.Use(async (context, next) =>                                     // middleware delegate
{
    context.Response.Headers["X-Request-Id"] = context.TraceIdentifier;
    await next(context);
});

app.MapGet("/orders/{id:int}", (int id, AppDb db) => db.Orders.Find(id)); // route handler
```

Three delegates in six lines. The middleware pipeline itself is a chain of `RequestDelegate` values, where each piece calls `next`. That's why [middleware order](/blog/aspnet-core-middleware-order) matters so much: you're building a chain of function calls.

LINQ works the same way:

```csharp
var bigOrders = orders.Where(o => o.Total > 1000m).Select(o => o.Id);
```

`Where` takes a `Func<Order, bool>`. One detail worth knowing: with EF Core, `Where` on an `IQueryable` takes an **expression tree** (`Expression<Func<Order, bool>>`) instead, so it can be translated to SQL. The lambda looks identical, but it becomes data, not compiled code. That's why some C# methods inside an EF Core query can't be translated.

## Passing behaviour into a method

This is where C# delegates really pay off. Instead of an `if`/`switch` that grows forever, the caller passes in the part that varies:

```csharp
public static async Task<T> RetryAsync<T>(Func<Task<T>> operation, int attempts = 3)
{
    for (var i = 1; ; i++)
    {
        try { return await operation(); }
        catch when (i < attempts) { await Task.Delay(200 * i); }
    }
}

var invoice = await RetryAsync(() => billingClient.GetInvoiceAsync(id));
```

`RetryAsync` doesn't know or care what it's retrying. For bigger rules, an interface and the [strategy pattern](/blog/csharp-strategy-pattern) is usually cleaner, but for small, one-method variations, a `Func` is less ceremony.

## Multicast delegates

A delegate can hold more than one method. `+=` adds one, `-=` removes one, and calling the delegate calls them all in order:

```csharp
Action<string> notify = msg => Console.WriteLine($"console: {msg}");
notify += msg => File.AppendAllText("log.txt", msg + Environment.NewLine);

notify("Order 42 shipped"); // runs both
```

Two things trip people up here. If the delegate returns a value, you only get the **last** method's result. And if one method throws, the ones after it never run.

## Events: delegates with guard rails

An event is a delegate field that outside code can only subscribe to or unsubscribe from:

```csharp
public class OrderService
{
    public event EventHandler<OrderPlacedEventArgs>? OrderPlaced;

    public void Place(Order order)
    {
        // ... save the order
        OrderPlaced?.Invoke(this, new OrderPlacedEventArgs(order.Id));
    }
}

orderService.OrderPlaced += (sender, e) => emailSender.Queue(e.OrderId);
```

Without the `event` keyword, any caller could write `OrderPlaced = null` and wipe out every other subscriber, or raise the event themselves. The keyword stops both.

A classic memory leak: a short-lived object subscribes to an event on a long-lived one (say, a singleton) and never unsubscribes. The singleton keeps a reference to it forever. If you subscribe, make sure something unsubscribes.

## Mistakes I see in code reviews

- **Capturing a loop variable** in old `for` loops and getting the last value in every lambda. `foreach` has been safe since C# 5, but `for (var i = 0; ...)` still captures the same `i`.
- **`async void` lambdas** passed to an `Action`. Exceptions inside them crash the process instead of reaching your `catch`. Use `Func<Task>` for async callbacks.
- **Heavy work in a delegate that runs per item**, like database calls inside a LINQ `Select` over thousands of rows.

## The short version

C# delegates let you treat a method like a value: store it, pass it, call it later. Use `Func` when you need a result, `Action` when you don't, and `event` when other classes should listen but not interfere. You've been using them all along in LINQ, DI registrations, middleware and minimal APIs. Now you know what's going on underneath.

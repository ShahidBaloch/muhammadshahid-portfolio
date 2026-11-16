---
title: "C# Generics Explained: Constraints, Variance, and Real Examples"
description: "C# generics in plain English: generic classes and methods, where constraints, covariance and contravariance, and the generic repository and Result<T> patterns from real APIs."
date: "2026-11-16"
category: "csharp"
tags: ["C#", ".NET", "Generics"]
related:
  - repository-pattern-dotnet
  - csharp-delegates-func-action-events
  - csharp-records-explained
faq:
  - q: "Why use generics in C#?"
    a: "To write one class or method that works with many types while keeping type safety. List<Customer> only holds customers, and the compiler checks that. Without generics you'd use object and cast, which is slower and fails at runtime instead of compile time."
  - q: "What does the where keyword do in C# generics?"
    a: "It adds a constraint: it limits which types can be used for T. For example, where T : class means T must be a reference type, and where T : IEntity means T must implement IEntity, so you can use its members inside the generic code."
  - q: "What is covariance in C#?"
    a: "Covariance lets you use a more specific type where a more general one is expected, like passing IEnumerable<Customer> where IEnumerable<object> is wanted. It's marked with out on interface and delegate type parameters."
---

C# generics are everywhere in .NET: `List<T>`, `Task<T>`, `ILogger<T>`, `DbSet<T>`, `IOptions<T>`. Most developers use them daily but only write their own generic code now and then. That's fine. But knowing how constraints and variance work saves you from some very confusing compiler errors.

## The problem C# generics solve

Before generics (C# 1), collections held `object`:

```csharp
var list = new ArrayList();
list.Add(42);
list.Add("forty-two");      // compiles fine
int first = (int)list[1];   // InvalidCastException at runtime
```

With generics, the type is part of the declaration, and the compiler stops mistakes before you run anything:

```csharp
var list = new List<int>();
list.Add(42);
list.Add("forty-two");      // compile error
```

You also avoid boxing value types into `object`, which used to cost real performance in hot loops.

## Writing a generic method

Put the type parameter after the method name. The compiler usually figures out `T` from the arguments:

```csharp
public static T MaxBy<T>(IEnumerable<T> items, Func<T, decimal> selector)
{
    T? best = default;
    decimal bestValue = decimal.MinValue;
    foreach (var item in items)
    {
        var value = selector(item);
        if (value > bestValue) { best = item; bestValue = value; }
    }
    return best ?? throw new InvalidOperationException("Sequence is empty.");
}

var topOrder = MaxBy(orders, o => o.Total); // T inferred as Order
```

(.NET 6 added a built-in `MaxBy` to LINQ, so you don't need this one. It's just a clear example of the shape.)

## Constraints: telling the compiler what T can do

Inside a generic method, the compiler only knows `T` is "some type", so you can't call anything on it except what `object` has. Constraints add that knowledge:

```csharp
public interface IEntity { int Id { get; } }

public static T? FindById<T>(IEnumerable<T> items, int id) where T : IEntity
    => items.FirstOrDefault(x => x.Id == id); // allowed: T has Id
```

The common constraints:

| Constraint | Means |
|---|---|
| `where T : class` | Reference type |
| `where T : struct` | Non-nullable value type |
| `where T : notnull` | Any non-nullable type |
| `where T : new()` | Has a public parameterless constructor |
| `where T : SomeBase` | Inherits from `SomeBase` |
| `where T : ISomething` | Implements the interface |
| `where T : unmanaged` | Value type with no references (for low-level code) |

You can combine them: `where T : class, IEntity, new()`.

## A real example: a generic repository

This is where most teams first write C# generics of their own:

```csharp
public class Repository<T>(AppDbContext db) where T : class, IEntity
{
    public Task<T?> GetAsync(int id, CancellationToken ct) =>
        db.Set<T>().FirstOrDefaultAsync(x => x.Id == id, ct);

    public void Add(T entity) => db.Set<T>().Add(entity);
}
```

`where T : class` is required because `DbSet<T>` needs reference types. `IEntity` lets us filter on `Id`.

A word of caution from experience: a generic repository on top of EF Core often adds little, because `DbSet<T>` is already a generic repository. I explain when it's worth it, and when it isn't, in [the repository pattern in .NET](/blog/repository-pattern-dotnet).

## Another real example: Result<T>

I use something like this in APIs to return either a value or an error without throwing:

```csharp
public readonly record struct Result<T>(T? Value, string? Error)
{
    public bool IsSuccess => Error is null;
    public static Result<T> Ok(T value) => new(value, null);
    public static Result<T> Fail(string error) => new(default, error);
}

Result<Invoice> result = await billing.CreateInvoiceAsync(order, ct);
if (!result.IsSuccess) return Results.Problem(result.Error);
```

One type, works for any payload, and the compiler keeps track of what's inside.

## Covariance and contravariance, without the jargon

These words scare people, but the idea is simple. They answer: "can I use a `Thing<Dog>` where a `Thing<Animal>` is expected?"

**Covariance (`out`)**: yes, when the type only *gives out* T.

```csharp
IEnumerable<string> names = new List<string> { "Ali", "Sara" };
IEnumerable<object> things = names; // OK: IEnumerable<out T> only returns T
```

It's safe because you can only read from an `IEnumerable`. Every string you read is also an object.

**Contravariance (`in`)**: yes, the other way round, when the type only *takes in* T.

```csharp
Action<object> logAnything = o => Console.WriteLine(o);
Action<string> logString = logAnything; // OK: something that accepts any object can accept a string
```

**Invariance**: `List<T>` is neither, because it both reads and writes T. If `List<string>` could be treated as `List<object>`, someone could add an `int` to your list of strings. So the compiler says no.

Variance only works on **interfaces and delegates**, and only for reference types. You mark it on your own interfaces with `out` or `in`:

```csharp
public interface IReadRepository<out T> { T? Get(int id); }
```

## Mistakes I see with C# generics

- **Generic everything.** A `Service<TRequest, TResponse, TValidator, TMapper>` that only ever has one implementation is harder to read than a plain class. Generics pay off when there are really many types.
- **Static fields in generic classes.** Each closed type (`Cache<User>`, `Cache<Order>`) gets its own copy. Sometimes that's handy, sometimes it's a bug.
- **Using `typeof(T)` checks inside generic code** to branch on type. That's usually a sign you want an interface or overloads instead.
- **Forgetting `default` for unconstrained T.** `return null;` won't compile for an unconstrained `T`; use `default` or add `where T : class`.

## Summary

C# generics let you write code once and keep full type checking. Use constraints to say what `T` must support, reach for `out`/`in` only on interfaces and delegates where it makes sense, and don't make code generic unless several types really need it. If you want to see generics working together with delegates like `Func<T, decimal>`, my [C# delegates post](/blog/csharp-delegates-func-action-events) goes through those.

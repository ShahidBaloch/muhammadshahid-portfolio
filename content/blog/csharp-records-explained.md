---
title: "C# Records Explained: When to Use Them (and When Not To)"
description: "C# records in plain English: value equality, with-expressions, record vs class vs record struct, and where records work well or cause trouble with EF Core."
date: "2026-11-16"
category: "csharp"
tags: ["C#", ".NET", "Records", "EF Core"]
related:
  - value-objects-ef-core
  - csharp-oop-interview-questions
  - csharp-nullable-reference-types
faq:
  - q: "What is the difference between a record and a class in C#?"
    a: "A class compares by reference: two objects are equal only if they are the same object. A record compares by value: two records are equal when all their properties are equal. Records also give you with-expressions and a readable ToString for free."
  - q: "Are C# records immutable?"
    a: "Positional records get init-only properties, so they are immutable after creation by default. But you can still declare settable properties on a record, and a record holding a List can have that list changed. Records make immutability easy, not guaranteed."
  - q: "Should I use records for EF Core entities?"
    a: "Usually not. Entities have identity and change over time, while a record's equality and hash code follow its data. That clashes with change tracking and HashSet-based navigations. Records fit DTOs, API contracts, and value objects much better."
---

C# records arrived in C# 9, and many teams started turning classes into records "because they're modern". Some of those changes are great. A few cause bugs that are hard to track down. This post covers what C# records actually do, so you can pick them for the right reasons.

## What a record is

A record is a class (or struct) that the compiler fills in for you. The shortest form is a positional record:

```csharp
public record Money(decimal Amount, string Currency);
```

From that single line, the compiler generates:

- A constructor and init-only `Amount` and `Currency` properties.
- **Value equality**: `Equals`, `GetHashCode`, `==` and `!=` compare the property values.
- A `ToString()` that prints `Money { Amount = 10, Currency = USD }`.
- A `Deconstruct` method, so you can write `var (amount, currency) = price;`.
- Support for `with` expressions.

Writing all that by hand in a class takes about 40 lines, and it's easy to forget a property in `GetHashCode` when someone adds one later.

## Value equality is the main feature

This is the part that matters most in day-to-day code:

```csharp
var a = new Money(10m, "USD");
var b = new Money(10m, "USD");

Console.WriteLine(a == b);            // True  (record)
Console.WriteLine(ReferenceEquals(a, b)); // False (still two objects)
```

With a class, `a == b` would be `false`, because two different objects live at two different addresses. With C# records, equal data means equal objects. That's exactly what you want for things like money, date ranges, addresses or coordinates, where two values with the same content really are the same thing.

## with-expressions: copy and change

Records are meant to be treated as values, so instead of changing one, you make a changed copy:

```csharp
var price = new Money(10m, "USD");
var discounted = price with { Amount = 8m };
```

`price` is untouched. `discounted` is a new record. This is handy in reducers, event handlers, and anywhere you pass data around and don't want someone else's code to change it under you.

One warning: `with` makes a **shallow** copy. If the record holds a `List<string>`, both copies share the same list.

## record vs class vs record struct

| | `class` | `record` (class) | `record struct` |
|---|---|---|---|
| Equality | By reference | By value | By value |
| Stored | Heap | Heap | Usually stack / inline |
| Can be null | Yes | Yes | No (unless `Nullable<T>`) |
| Properties from positional syntax | – | `init` (immutable) | `set` (mutable!) |
| Good for | Entities, services | DTOs, value objects, messages | Small, hot-path values |

The "positional syntax" row surprises people. A positional `record struct` gives you **settable** properties. If you want an immutable one, write `readonly record struct`:

```csharp
public readonly record struct Point(int X, int Y);
```

## Where C# records work well

In my projects, records earn their place in a few spots:

- **API request and response DTOs.** `public record CreateOrderRequest(Guid CustomerId, List<OrderLineDto> Lines);` reads well and model binding handles it fine in ASP.NET Core.
- **Value objects in DDD.** Money, Email, DateRange. Value equality is the whole point. My [value objects with EF Core](/blog/value-objects-ef-core) post shows how to map them with `OwnsOne` and `HasConversion`.
- **Messages and events.** `public record OrderPlaced(Guid OrderId, DateTimeOffset At);` Events describe something that already happened, so they shouldn't change.
- **Query results.** Projecting EF Core queries into records keeps read models small and clear.

## Where they cause trouble

**EF Core entities.** An entity has identity: patient #42 is still patient #42 after their phone number changes. Value equality breaks that idea. A record's hash code changes whenever its data changes, and EF Core uses `HashSet<T>` for collection navigations by default, so an entity you just edited can get "lost" inside its own parent's collection. Your own `==` checks also start comparing data instead of identity. Keep entities as classes.

**Records as dictionary keys or in HashSets, then mutated.** If you add settable properties to a record and change one after adding it to a `HashSet`, the hash code changes and the set can't find it anymore.

**Huge records.** Equality compares every property. A record with 30 properties and nested collections makes `==` expensive, and collections compare by reference anyway, so two records with equal lists are still "not equal". That one surprises people in unit tests.

```csharp
public record Basket(List<string> Items);

var x = new Basket(new() { "apple" });
var y = new Basket(new() { "apple" });
Console.WriteLine(x == y); // False: the two lists are different objects
```

## Inheritance with records

Records can inherit from other records (not from classes). Equality also checks the runtime type, so a `Dog` record and an `Animal` record with the same properties are not equal. That's usually what you want, but it's worth knowing before you build deep record hierarchies. In practice I keep record hierarchies shallow, one level at most.

## How I decide

I ask one question: **does this thing have an identity that survives changes to its data?**

- Yes (a customer, an order, an appointment): use a class.
- No, it's just data or a value (a price, a request body, an event): use C# records.

If you remember only that, you'll pick the right one most of the time. The rest is detail.

Records also come up a lot in interviews. If you're preparing, my [C# OOP interview questions](/blog/csharp-oop-interview-questions) cover record vs class with a scenario answer.

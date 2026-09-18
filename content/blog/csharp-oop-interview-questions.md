---
title: "C# OOP Interview Questions"
description: "C# OOP interview questions with scenario answers: abstract class vs interface, records, virtual and sealed, composition over inheritance, and what to say when the interviewer asks why."
date: "2026-09-18"
updated: "2026-09-18"
category: "interview-questions"
tags: ["Interview Questions", "C#", "OOP", ".NET"]
related:
  - csharp-expert-interview-questions
  - csharp-strategy-pattern
  - csharp-factory-pattern
  - solid-principles-aspnet-core
faq:
  - q: "What C# OOP interview questions are actually asked?"
    a: "Interviewers ask abstract class versus interface, when a record replaces a class, why virtual and override exist, when sealed is a design choice not a performance trick, and composition over a deep hierarchy. They want a production failure, not a textbook definition."
  - q: "Should I use an abstract class or an interface in C#?"
    a: "Use an interface when the type is a capability with no shared state. Use an abstract class only when subclasses truly share state and a protected implementation. Default interface methods do not make the abstract class obsolete."
  - q: "When is a C# record the right answer in an interview?"
    a: "Use a record for an immutable value: a DTO, a command, a domain event. Use a class when identity matters across time, such as an EF Core entity with a change tracker."
---

**This page is for 3-5 year C# interviews.** Reciting "OOP is encapsulation, inheritance, polymorphism" is table stakes. The next question is a design choice you already made in a production API.

If the loop is runtime and concurrency, use [expert C# interview questions](/blog/csharp-expert-interview-questions). If they want ASP.NET Core scenarios, start from [ASP.NET Core interview questions](/blog/aspnet-core-interview-questions-scenarios). Hub: [interview questions](/learning/interview-questions).

## Real-world analogy

An interface is a job description posted on a board: "must take an order and return a receipt." Any person can accept the job. An abstract class is an in-house training program: the company already taught the shared steps, and the new hire only fills in the parts that differ. A sealed class is a role the company will not subcontract. You do not interview someone by asking them to recite the company handbook. You hand them a ticket and see which tool they pick.

## Worked example

The prompt is: "We have `IPayment` and `PaymentBase`. Where does the sales-tax rule live?" A weak answer says "in the interface because interfaces are flexible." The tax rule is shared behavior, and an interface cannot hold it (unless you are on a default interface method you did not mean to ship). The answer that matches the code is: the interface stays as `Charge` and `Refund`. The tax calculation lives on `PaymentBase` if every payment uses it, or in the one card class if only cards are taxed. Sealing `CardPayment` is the follow-up: a later hire cannot subclass it and skip the tax call.

## Short answers

| Question | Crisp answer |
|---|---|
| Abstract class vs interface | Shared state and a base implementation vs a capability contract |
| `record` vs `class` | Value equality and immutability vs identity over time |
| `virtual` / `override` | Opt-in polymorphism. Methods are not virtual by default in C# |
| `sealed` | Stop a hierarchy you do not intend to support |
| Composition | A type *has* a behavior instead of *is* a base class |

## The questions they ask

1. Abstract class versus interface for a payment provider
2. Why a `record` for a command and a `class` for an order entity
3. `virtual` missing, so a subclass method never runs
4. `sealed` on a type the team will never extend
5. A five-level inheritance tree that should have been composition
6. `protected` fields leaking into every subclass

## Scenario 1: abstract class versus interface

**Prompt:** You have Stripe and a local card terminal. A colleague adds `abstract class PaymentProvider` with a protected `HttpClient`. The terminal has no HTTP. What do you say?

**Answer:** The terminal is not an HTTP client with a different URL. Make `IPaymentProvider` the contract (`Authorize`, `Capture`). Put HTTP only in `StripePaymentProvider`. An abstract class is justified only if every provider shares real state, such as an idempotency store both implementations write.

Default interface methods in C# 8 do not change this. They share behavior without shared fields. Shared fields still belong on a class, and only if every subtype needs them.

## Scenario 2: record versus class

**Prompt:** The interviewer shows `record Order` mapped with EF Core. Saves look random. Why?

**Answer:** A record uses value equality. EF Core entities need identity equality (same key, same instance in the tracker). Use a `record` for `PlaceOrderCommand` and `OrderPlaced`. Use a `class` for the `Order` entity. Say that out loud. Mixing them is a common interview trap.

```csharp
public sealed record PlaceOrderCommand(Guid CustomerId, IReadOnlyList<Line> Lines);

public sealed class Order
{
    public Guid Id { get; private set; }
    public OrderStatus Status { get; private set; }
}
```

## Scenario 3: virtual, override, and sealed

**Prompt:** A derived `TaxCalculator` "overrides" `Compute` but production still uses the base rates.

**Answer:** In C# a method is not virtual unless marked `virtual`. The derived method hid the base method. The call site held a `TaxCalculator` base reference, so the base method ran. Mark `virtual` and `override`, or stop the hierarchy and inject a strategy.

`sealed` on the class means "this is not an extension point." `sealed override` means "this override is the last one." Use `sealed` when supporting subclasses would freeze a public API you do not want.

Related: [strategy pattern](/blog/csharp-strategy-pattern), [factory pattern](/blog/csharp-factory-pattern), [SOLID in ASP.NET Core](/blog/solid-principles-aspnet-core).

## What to skip

Do not recite the four pillars unless they ask. Do not claim records are always faster. Do not inherit to reuse one helper method. Extract the helper.

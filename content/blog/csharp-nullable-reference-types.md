---
title: "C# Nullable Reference Types"
description: "What C# nullable reference types actually check, when string? is the right type, and why the null-forgiving operator hides the bug instead of fixing it."
date: "2026-09-18"
updated: "2026-09-18"
category: "architecture"
tags: ["C#", "Nullable", ".NET", "ASP.NET Core"]
related:
  - csharp-oop-interview-questions
  - csharp-expert-interview-questions
  - aspnet-core-api-validation
faq:
  - q: "What do nullable reference types do?"
    a: "They are a compile-time warning. string means this reference should not be null. string? means null is a value you handle. They do not stop a null from arriving at runtime if another assembly, or the null-forgiving operator, lied."
  - q: "Should I turn warnings off for a new project?"
    a: "No. Enable nullable. Fix the warnings at the boundary, where JSON and the database enter. Silencing the project is how nulls come back six months later with no line to blame."
  - q: "Is string? the same as Nullable<string>?"
    a: "No. Nullable<T> is for value types. string? is still a reference type. The ? is an annotation the compiler reads. The CLR does not grow a new string type."
---

`string name` and `string? name` are the same type at runtime. The difference is a contract the compiler enforces in this project. Ignore it and you are back to null checks you hoped the type system had finished.

This is not the OOP question bank. Class versus interface lives on [C# OOP interview questions](/blog/csharp-oop-interview-questions). Hub: [Architecture](/learning/architecture).

## Real-world analogy

A form field marked "required" does not weld the pen to the page. It tells the clerk to send the form back if the field is empty. Nullable annotations are that mark. Someone can still smuggle a blank form through if the clerk stamps it with "I checked" without looking. That stamp is the `!` operator.

## Worked example

A DTO has `string Email { get; set; } = ""` only to silence a warning. JSON posts `{ "email": null }` because the Angular side sent a cleared input. The deserializer sets `Email` to null. The compiler was happy. The next line calls `email.Trim()` and throws. The honest property is `string? Email` if missing is allowed, and the action returns 400 before `Trim`. If missing is not allowed, a required validation attribute rejects the body. The empty-string initializer was a lie that moved the crash one line later.

| You mean | Write | Do not write |
|---|---|---|
| Caller must pass a string | `string` | `string name = null!` |
| Missing is normal | `string?` | a magic `""` that means missing |
| You just proved it is not null | a local check, then use it | `!` on a value from JSON |

## Code

```xml
<Nullable>enable</Nullable>
```

```csharp
public sealed record CreateUser(string Email, string? DisplayName);

static string Normalize(CreateUser input)
{
    if (string.IsNullOrWhiteSpace(input.Email))
        throw new ArgumentException("Email is required.", nameof(input));

    var email = input.Email.Trim();
    var label = input.DisplayName ?? email;
    return label;
}
```

Do not sprinkle `!` through a controller to get a green build. Each one is a claim. Request bodies are the place that claim is usually false. Validation of that body is [API validation](/blog/aspnet-core-api-validation), which is the runtime half of the same rule.

Profile and account fields on [Ecom_NET10](/work/ecom-net10) are the kind of boundary this shows up on.

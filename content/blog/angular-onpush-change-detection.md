---
title: "Angular OnPush Change Detection"
description: "OnPush rerenders a component when an input identity changes, an event fires, or a signal updates. Mutating an object in place does not. This is the change-detection page, not the signals guide and not the interview list."
date: "2026-09-18"
updated: "2026-09-18"
category: "architecture"
tags: ["Angular", "OnPush", "Change Detection", "TypeScript"]
related:
  - angular-signals-aspnet-core
  - angular-interview-questions-aspnet-core
  - angular-dotnet-integration
faq:
  - q: "When does an OnPush component update?"
    a: "When an input is a new reference, when an event handler in the template runs, when an async pipe emits, or when a signal read in the template changes. Editing a property on the same object does not."
  - q: "Does OnPush replace signals?"
    a: "No. Signals are a state tool. OnPush is when Angular checks the template. They work together. The signals guide is the state page. This is the check page."
  - q: "Should every component be OnPush?"
    a: "New components, yes, if inputs are treated as immutable. A large Default tree that you flip in one commit will look broken until every mutated input is replaced with a new object."
---

Default change detection walks the tree and checks everything. OnPush checks a component when it has a reason. The reason is not "someone changed a field inside an object I already hold."

State with signals is [Angular signals](/blog/angular-signals-aspnet-core). A one-line mention in a question list is not this page: [Angular interview questions](/blog/angular-interview-questions-aspnet-core). Hub: [Architecture](/learning/architecture).

## Real-world analogy

Default mode is a guard who re-reads every badge in the building on a timer. OnPush is a guard who only looks up when someone new walks through the door, or when that person speaks. Changing your shoes in the hallway does not make the guard look up. You are the same person walking in. A new object reference is a new person at the door.

## Worked example

An order row is `@Input() order`. The parent loads orders, then does `order.status = "paid"` on the object already in the array. The child is OnPush. The badge on screen still says "open." The click handler in the child would have refreshed it, but this write happened in the parent, on the same reference. The fix is `this.orders.update(list => list.map(o => o.id === id ? { ...o, status: "paid" } : o))`. The child input is a new object. OnPush checks. Flipping the component back to Default hides the bug and checks the whole page on every event.

| Update | OnPush sees it? |
|---|---|
| New object passed as an input | Yes |
| Field changed on the same object | No |
| DOM event in that template | Yes |
| Signal read in the template changes | Yes |
| `async` pipe emits | Yes |

## Code

```typescript
@Component({
  selector: "app-order-row",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span>{{ order().status }}</span>`,
})
export class OrderRow {
  readonly order = input.required<Order>();
}
```

Pass a new `Order` when the status changes. Do not call `markForCheck` from a parent as the design. That call is the escape hatch for a subscription you do not own yet, and it is a smell if it is the only way the row updates. HTTP and DTO habits stay on [Angular and .NET](/blog/angular-dotnet-integration).

Order rows on [Ecom_NET10](/work/ecom-net10) are the screen where a stale status shows up.

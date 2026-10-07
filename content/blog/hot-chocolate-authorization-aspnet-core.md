---
title: "Hot Chocolate Authorization in ASP.NET Core for GraphQL"
description: "Hot Chocolate authorization in ASP.NET Core for GraphQL fields: policies, the right Authorize attribute, validation versus BeforeResolver, and partial errors."
date: "2026-10-03"
category: "security"
tags: ["Hot Chocolate", "GraphQL", "ASP.NET Core", "Authorization", "Angular"]
related:
  - hot-chocolate-graphql-aspnet-core
  - aspnet-core-rbac-guide
  - aspnet-core-jwt-auth
  - prevent-bola-idor-aspnet-core
faq:
  - q: "Does authorizing the /graphql endpoint protect individual fields?"
    a: "No. An authenticated caller who can reach the endpoint can still request every field unless those fields or their types carry Hot Chocolate authorization. Lock the HTTP endpoint and the schema."
  - q: "Which Authorize attribute should I put on a Hot Chocolate resolver?"
    a: "Use HotChocolate.Authorization.AuthorizeAttribute. The Microsoft.AspNetCore.Authorization attribute does not join Hot Chocolate's directive pipeline, so the field looks protected and is not."
  - q: "Why does a policy handler see no resolver arguments?"
    a: "Hot Chocolate 13 and later evaluates field policies during validation by default, before resolver arguments exist. Handlers that need those arguments must run at ApplyPolicy.BeforeResolver."
---

**Hot Chocolate authorization in ASP.NET Core** means each GraphQL type and field makes its own allow or deny decision through the same policy engine your REST API already uses. One `/graphql` URL is not one authorization decision.

```text
Angular Apollo / HttpClient
    |  POST /graphql   Authorization: Bearer
    v
ASP.NET Core authn (JWT validated once per request)
    v
Hot Chocolate document validation
    |  @authorize on types and fields  --> policy / role check
    v
Resolvers (only for fields that passed)
    v
Application service / EF Core
```

Think of the schema as a building, not a door. Endpoint authentication is the lobby badge reader. Field policies are the locks on individual rooms. A badge that opens the lobby does not open the records room.

**New to the schema itself** -> [Hot Chocolate GraphQL primer](/blog/hot-chocolate-graphql-aspnet-core). **Roles and policies on REST** -> [RBAC guide](/blog/aspnet-core-rbac-guide). **JWT setup** -> [JWT auth](/blog/aspnet-core-jwt-auth). **Object-level access** -> [prevent BOLA / IDOR](/blog/prevent-bola-idor-aspnet-core).

Search intent for **hot chocolate authorization asp.net core** is a how-to: wire ASP.NET Core policies into Hot Chocolate fields, know when the check runs, and teach the Angular client to treat partial graphs as failures.

## Authorize the field, not only the /graphql endpoint

Hot Chocolate turns `[Authorize]` into the `@authorize` directive. Applied to a type, it covers every field of that type. Applied to a field, it overrides the type directive for that field. `[AllowAnonymous]` (the Hot Chocolate one) opts a field back out, which is how a public `health` or `apiVersion` field can live on an otherwise private query root.

The directive answers "may this principal ask for this field?" It does not:

- Replace authentication. If JWT validation is wrong, every policy sees an empty principal.
- Hide the field from introspection. Attackers can still learn that `ssn` exists. Authorization has to null the value, not merely hope nobody asks.
- Implement object-level checks by itself. A policy of "has the BillingClerk role" does not prove this clerk may see this patient. That second check is resource authorization, covered below.
- Change HTTP status into 401 or 403 for a normal query. GraphQL reports authorization failure inside the `errors` array and sets the forbidden field to null, usually with HTTP 200. Clients that only check `response.ok` will render a half-empty screen as success.

Coarse rules belong in claims and roles (cheap, no I/O). Object rules belong in a handler that sees the id argument, or in the application service the resolver calls. Do both. A field policy that forgets the object check is the GraphQL version of IDOR.

## Register the ASP.NET Core policies Hot Chocolate will call

> **Watch:** The attribute has to be HotChocolate.Authorization.Authorize. The ASP.NET Core Authorize attribute on a resolver does not add @authorize, and locking only MapGraphQL makes every signed-in user equivalent.

Define policies in the ASP.NET Core authorization stack you already trust. Do not invent a second policy language inside resolvers.

```csharp
builder.Services.AddAuthentication().AddJwtBearer(); // your existing scheme

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("CanViewPatients", policy =>
        policy.RequireAuthenticatedUser()
              .RequireClaim("permission", "patients.read"));

    options.AddPolicy("CanViewPhi", policy =>
        policy.RequireClaim("permission", "phi.read"));

    options.AddPolicy("CanRecordVitals", policy =>
        policy.RequireClaim("permission", "vitals.write"));
});

builder.Services
    .AddGraphQLServer()
    .AddAuthorization()
    .AddQueryType<Query>()
    .AddMutationType<Mutation>()
    .AddType<PatientType>();
```

`.AddAuthorization()` on the GraphQL server registers Hot Chocolate's authorization middleware. It is not a substitute for `services.AddAuthorization(...)`. You need both: one builds the policy catalog, the other executes `@authorize` against that catalog.

Package names moved as Hot Chocolate grew. On the 13 line the authorization types ship in `HotChocolate.AspNetCore.Authorization`. Later majors fold the same extension into the server package. Trust the package your pinned major documents, and import `HotChocolate.Authorization`, not `Microsoft.AspNetCore.Authorization`, when you attribute resolvers.

Confirm the JWT bearer events you use for REST also run for `/graphql`. A second auth scheme that only hooks minimal API endpoints leaves GraphQL anonymous while REST looks locked down.

## Put Authorize on types, fields, and mutations

```csharp
using HotChocolate.Authorization;

[Authorize(Policy = "CanViewPatients")]
public sealed class Query
{
    public async Task<Patient?> GetPatient(
        Guid id,
        [Service] IPatientReader patients,
        ClaimsPrincipal user,
        CancellationToken ct)
        => await patients.FindAsync(id, user, ct);

    [AllowAnonymous]
    public string ApiVersion => "2026.10";
}

public sealed class PatientType : ObjectType<Patient>
{
    protected override void Configure(IObjectTypeDescriptor<Patient> descriptor)
    {
        descriptor.Field(p => p.DisplayName);

        descriptor.Field(p => p.NationalId)
            .Authorize("CanViewPhi");

        descriptor.Field(p => p.InternalCost)
            .Authorize("CanViewPhi");
    }
}

public sealed class Mutation
{
    [Authorize(Policy = "CanRecordVitals")]
    public async Task<RecordVitalsPayload> RecordVitals(
        RecordVitalsInput input,
        [Service] IVitalsService vitals,
        ClaimsPrincipal user,
        CancellationToken ct)
    {
        var id = await vitals.RecordAsync(input, user, ct);
        return new RecordVitalsPayload(id);
    }
}
```

Put the same `[Authorize]` on the mutation you would put on the REST POST. Mutations that skip the attribute because "the query root is already authorized" are how a read-only principal writes data. Type-level authorize on `Query` does not cover `Mutation`.

Repeat the attribute when a field needs every policy:

```csharp
[Authorize(Policy = "CanViewPatients")]
[Authorize(Policy = "CanViewPhi")]
public string NationalId { get; set; } = "";
```

Multiple `@authorize` directives are a conjunction: the principal must satisfy all of them. There is no implicit OR. If you need OR, write one policy that composes the requirements.

Schema-first teams apply the same rule in SDL. The directive is the contract; the attribute is only a way to emit it.

```graphql
type Patient @authorize(policy: "CanViewPatients") {
  displayName: String!
  nationalId: String @authorize(policy: "CanViewPhi")
}
```

Keep the policy name identical to the ASP.NET Core policy. A typo does not fail at compile time. Add a startup test that resolves `IAuthorizationPolicyProvider` for every policy name you referenced.

## Choose validation or BeforeResolver

> **Watch:** A validation-phase policy runs before arguments exist. Do not hit the database there, and do not succeed the requirement when the resource is missing.

![Validation has no field arguments; BeforeResolver can see the id; AfterResolver has already run the resolver](/images/blog/hot-chocolate-authorization-aspnet-core-phases.png)

From Hot Chocolate 13 onward, field authorization runs during document validation by default. That is the right default for role and claim checks: forbidden fields never reach a resolver, so a buggy resolver cannot touch SQL "just in case."

It is the wrong phase when the decision depends on resolver arguments or on a row. During validation there is no `IResolverContext`, and custom handlers that call `context.Resource` as if it were the GraphQL argument will fail closed (good) or, worse, be written to succeed when the resource is missing (bad).

```csharp
public sealed class PatientAssignedRequirement : IAuthorizationRequirement;

public sealed class PatientAssignedHandler
    : AuthorizationHandler<PatientAssignedRequirement, Guid>
{
    private readonly IPatientAccess _access;

    public PatientAssignedHandler(IPatientAccess access) => _access = access;

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        PatientAssignedRequirement requirement,
        Guid patientId)
    {
        var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (userId is not null &&
            await _access.IsAssignedAsync(userId, patientId, CancellationToken.None))
        {
            context.Succeed(requirement);
        }
    }
}
```

Wire it only on the field that has the id, and force the later phase. Confirm the enum member against your package; the name below is the 13/14 shape:

```csharp
descriptor.Field(q => q.GetPatient(default, default!, default!, default))
    .Authorize(ApplyPolicy.BeforeResolver, "AssignedToPatient");
```

Register the requirement inside the policy:

```csharp
options.AddPolicy("AssignedToPatient", policy =>
    policy.RequireAuthenticatedUser()
          .AddRequirements(new PatientAssignedRequirement()));
```

Register the handler or the requirement never succeeds. The field then fails closed, and the error looks like a policy miss rather than a missing registration.

```csharp
builder.Services.AddSingleton<IAuthorizationHandler, PatientAssignedHandler>();
```

Passing the resource into ASP.NET Core's `IAuthorizationService` from Hot Chocolate's middleware is version-sensitive. If the handler never runs, do not "fix" it by deleting the check. Log the phase, read the release notes for your major, and keep a domain-service check inside `IPatientReader.FindAsync` as the backstop. Defense in depth here is intentional: the directive stops casual queries, the service stops a resolver that was wired without the directive.

`ApplyPolicy.AfterResolver` is rarely what you want. The resolver has already run, so a denied field may already have read the row, written an audit, or triggered a side effect. Use it only when the decision truly depends on the resolver result, and make the resolver free of side effects.

Do not hit the database from a policy that decorates a list field evaluated for every element, unless that handler batches. A per-row round trip inside authorization recreates the N+1 problem under a security name. Load the caller's allowed ids once per request (claims, or a scoped cache) and test membership in memory.

## Handle partial GraphQL errors in Angular

A forbidden field produces a GraphQL error and a null at that path. Sibling fields that were allowed still resolve. That is a feature when a screen can degrade, and a bug when the screen cannot.

Typical extension codes:

| Situation | Code you should assert in tests | HTTP |
|---|---|---|
| No usable principal | `AUTH_NOT_AUTHENTICATED` when the version distinguishes it | usually 200 |
| Principal failed the policy | `AUTH_NOT_AUTHORIZED` | usually 200 |
| Policy name missing at startup | server misconfiguration, not a client case | request fails |

Some 13.x builds collapsed both authentication and authorization failures into `AUTH_NOT_AUTHORIZED` even though older docs mentioned two codes. Do not branch the Angular UI on a code you have not seen from your pinned server. Capture a golden response in an integration test and parse that.

```typescript
export function assertFieldAllowed(result: {
  data?: { patient?: { nationalId?: string | null } | null };
  errors?: { message: string; path?: (string | number)[]; extensions?: { code?: string } }[];
}): void {
  const blocked = result.errors?.some(e =>
    e.path?.join('.') === 'patient.nationalId' &&
    (e.extensions?.code === 'AUTH_NOT_AUTHORIZED' ||
     e.extensions?.code === 'AUTH_NOT_AUTHENTICATED'));

  if (blocked) {
    throw new Error('nationalId is not available to this user');
  }
}
```

Map those errors in the same place you map ProblemDetails for REST. Do not toast the raw `message`. Hot Chocolate's default text is generic; keep it that way. Never configure an error filter that appends the policy name, the claim diff, or the patient id. That turns authorization into an oracle.

If product wants HTTP 401 for an entirely anonymous operation, do that in an `IHttpResult` inspector or error filter that checks the operation, not by throwing from a resolver. Mixed queries (one public field, one private field) must stay HTTP 200 so the public field still returns.

## Keep the resolver from being the only check

> **Watch:** A list of 200 patients each calling IsAssignedAsync will time out and tempt someone to delete the check. Hiding introspection is not authorization.

```csharp
public async Task<Patient?> FindAsync(Guid id, ClaimsPrincipal user, CancellationToken ct)
{
    var patient = await _db.Patients.AsNoTracking()
        .SingleOrDefaultAsync(p => p.Id == id, ct);

    if (patient is null) return null;

    if (!await _access.IsAssignedAsync(user, id, ct))
        throw new UnauthorizedAccessException(); // last line of defense, not the UX

    return patient;
}
```

Prefer returning a domain `AccessDenied` that the resolver converts to a GraphQL error with a stable code, and log the user id plus patient id server-side. Do not return `null` for both "missing" and "forbidden" unless you have deliberately chosen to hide existence. Hiding existence and returning `AUTH_NOT_AUTHORIZED` answer different product questions. Pick one per field and test it. The [BOLA write-up](/blog/prevent-bola-idor-aspnet-core) covers the same choice on REST routes.

Share the policy names with REST. If `POST /api/vitals` requires `vitals.write` and the mutation requires a different string, the two stacks drift the first time someone updates only `AddAuthorization`.

## What fails if the attribute or the phase is wrong?

- **Wrong attribute namespace.** `Microsoft.AspNetCore.Authorization.Authorize` on a resolver class does not create `@authorize`. The endpoint can still execute the resolver. Import `HotChocolate.Authorization`.
- **Authorizing only `MapGraphQL().RequireAuthorization()`.** Every authenticated user becomes equivalent. Field policies are the real boundary.
- **Assuming type-level authorize covers mutations, subscriptions, and node resolvers.** Decorate each root. Global object identification (`node(id:)`) bypasses a query field you locked down if the node resolver is open.
- **Database work inside validation-phase policies.** The handler runs before arguments exist, so it cannot see `id`, and it may run for fields the client only used in a fragment that gets skipped. Keep validation policies pure.
- **Succeeding the requirement when the resource is null.** A handler written as "if I cannot tell, allow" fails open. Missing resource means fail.
- **Leaking through suggested errors and exception details.** `IncludeExceptionDetails` belongs in development only. A stack trace from a policy handler is a map of your authorization code.
- **Disabling introspection and calling it authorization.** Hiding the schema is optional hygiene. It does not stop a client that already knows the query text.
- **N+1 authorization.** A list of 200 patients, each triggering `IsAssignedAsync`, will time out the request and tempt someone to remove the check. Batch it.

## How do you prove a field is locked?

Prove the negative paths. Happy-path queries do not show a missing attribute.

1. Integration test with `WebApplicationFactory`: anonymous `patient(id)` returns an error code and null data, and the EF log contains no `SELECT` against the patient table for a validation-phase policy.
2. A principal with `patients.read` but not `phi.read` receives `displayName` and an error on `nationalId` in the same response. Assert the path `patient.nationalId`.
3. A principal with the role but not the assignment receives denial from `GetPatient` for someone else's id, and success for their own. This is the IDOR test.
4. The mutation `recordVitals` rejects a read-only principal even when `Query` is authorized.
5. A unit test reflects each GraphQL field you consider sensitive and asserts the authorize directive is present, so a refactor that drops the attribute fails CI.
6. Angular unit test: an `errors` entry with that path does not get written into the signal or store as a normal patient.

Ship the field locks before you add more types to the schema. Retrofitting `@authorize` onto a graph clients already query is how you break production screens that were quietly over-fetching.


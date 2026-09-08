const CANONICAL_SITE_ORIGIN = "https://www.muhammadshahid.dev";

/** Apex host 308s to www in next.config — sitemap/canonicals must use the same origin. */
function resolveSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? CANONICAL_SITE_ORIGIN;
  try {
    const url = new URL(raw);
    if (url.hostname === "muhammadshahid.dev") {
      url.hostname = "www.muhammadshahid.dev";
    }
    return url.origin;
  } catch {
    return CANONICAL_SITE_ORIGIN;
  }
}

export const siteConfig = {
  name: "Muhammad Shahid",
  title: "Senior Full Stack Engineer (.NET + Angular)",
  description:
    "Senior .NET + Angular engineer helping teams design and ship secure healthcare, SaaS, and eCommerce systems — APIs, SPAs, Azure, identity, and clean architecture.",
  url: resolveSiteUrl(),
  locale: "en_US",
  email: "info@muhammadshahid.dev",
  personalEmail: "muhammadshahid6528@gmail.com",
  phone: "+92 308 8067617",
  phoneE164: "+923088067617",
  whatsapp: "https://wa.me/923088067617",
  linkedin: "https://linkedin.com/in/muhammad-shahid-8a66a7234",
  github: "https://github.com/ShahidBaloch",
  location: "Lahore, Pakistan · Remote-friendly",
  tagline:
    "I design and ship production .NET + Angular systems for healthcare, SaaS, and eCommerce teams.",
  availability: "Open for freelance & contract engagements",
  inquiryCta: "Hire me",
} as const;

export const inquiryTimelines = [
  "As soon as possible",
  "This month",
  "1–3 months",
  "Exploring / not sure",
] as const;

export const inquiryBudgets = [
  "Under $5k",
  "$5k–$15k",
  "$15k–$40k",
  "$40k+",
  "Hourly / not sure yet",
] as const;

export const navLinks = [
  { href: "/work", label: "Work" },
  { href: "/services", label: "Services" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
] as const;

export type LearningFaq = {
  q: string;
  a: string;
};

export type LearningTrack = {
  title: string;
  slugs: string[];
  /** Unique copy under the H2 so tracks are not link-only lists. */
  blurb?: string;
};

export type LearningTopic = {
  slug: string;
  label: string;
  title: string;
  description: string;
  intro: string;
  /** Extra tags that also qualify a post for this topic hub. */
  matchTags: string[];
  /** When true, list category matches and pinSlugs only — no tag spill. */
  categoryOnly?: boolean;
  /** Hub order: Search Console winners and pillar URLs before newest dumps. */
  pinSlugs?: string[];
  /** Optional start-here groups with real links (crawlers and readers). */
  tracks?: LearningTrack[];
  /** Hub FAQs for visible answers + FAQPage JSON-LD. */
  faq?: LearningFaq[];
  /** Other topic slugs rendered as real links under the intro. */
  relatedTopicSlugs?: string[];
  keywords?: string[];
};

/** Topic hubs under Blog — SEO landing pages that group related articles.
 *  If you add a topic slug, also add it to LEARNING_SLUGS in scripts/generate-feeds.mjs. */
export const learningTopics: LearningTopic[] = [
  {
    slug: "interview-questions",
    label: "Interview Questions",
    title: "C# and ASP.NET Core Interview Questions",
    description:
      "Scenario-based C#, ASP.NET Core, Angular, and EF Core interview questions from production work — not trivia lists copied from a dump.",
    intro:
      "Scenario-based interview prep for C# and ASP.NET Core — production symptoms, strong oral answers, and links to implementation articles when the interviewer goes deeper.",
    matchTags: ["Interview Questions"],
    relatedTopicSlugs: ["async-concurrency", "ef-core", "authentication"],
    pinSlugs: [
      "dotnet-interview-questions-answers",
      "csharp-async-await-interview-questions",
      "csharp-expert-interview-questions",
      "aspnet-core-interview-questions-scenarios",
      "ef-core-interview-questions",
      "angular-interview-questions-aspnet-core",
    ],
    faq: [
      {
        q: "Where do I start for .NET interview questions?",
        a: "Open the [.NET interview questions and answers](/blog/dotnet-interview-questions-answers) map — it links to async, ASP.NET Core scenarios, EF Core, and Angular tracks. Mid-level: async await + ASP.NET scenarios. Staff: expert C# questions.",
      },
      {
        q: "What ASP.NET Core interview questions are asked most?",
        a: "Captive DI, JWT + Angular CORS, middleware order, thread pool starvation, and EF slowness — scenario answers on [ASP.NET Core interview questions](/blog/aspnet-core-interview-questions-scenarios).",
      },
      {
        q: "What C# interview questions and answers should I prepare?",
        a: "Task vs Thread, .Result starvation, async void, WhenAll on one DbContext, ConfigureAwait in libraries. Full list: [C# async await interview questions](/blog/csharp-async-await-interview-questions).",
      },
      {
        q: "Where do I start for C# async interview questions?",
        a: "Know **Task vs Thread** and **starvation vs deadlock** first. Then rehearse scenario prompts: `.Result`, `async void`, `WhenAll` on one DbContext, and `CancellationToken` through to SQL. Implementation checklists live on the [async & threading hub](/learning/async-concurrency).",
      },
      {
        q: "What is the difference between mid-level and expert C# interview posts?",
        a: "Mid-level loops test **async traps and API judgment** under load. Staff loops add **streams, Channels, Span, tenant maps**, and bounded concurrency — failures you see in dumps, not flashcards.",
      },
      {
        q: "Should I study ASP.NET Core and EF Core interview questions separately?",
        a: "Yes. ASP.NET Core scenarios are **pipeline, JWT, validation, middleware order**. EF Core scenarios are **change tracker, filters, concurrency, ExecuteUpdate** — not N+1 SQL tuning (that is a separate how-to track).",
      },
      {
        q: "How do interview posts relate to how-to articles?",
        a: "Interview URLs are **oral rehearsal** — definition, prompt, strong answer. How-tos are **merge checklists**. A strong candidate names the production symptom *and* the PR-shaped fix.",
      },
    ],
    tracks: [
      {
        title: "Async and threading (most common loop)",
        blurb:
          "Scenario answers for the 3–5 year async loop, then staff runtime (streams, channels, tenant maps). Read Task vs Thread first if definitions are still fuzzy.",
        slugs: [
          "csharp-async-await-interview-questions",
          "csharp-expert-interview-questions",
        ],
      },
      {
        title: "ASP.NET Core API scenarios",
        blurb:
          "Middleware order, JWT, validation, ProblemDetails, and production failure storytelling — not property-bag trivia.",
        slugs: ["aspnet-core-interview-questions-scenarios"],
      },
      {
        title: "EF Core change tracker and concurrency",
        blurb:
          "SaveChanges failures, global query filters, RowVersion, ExecuteUpdate — not an N+1 tutorial.",
        slugs: ["ef-core-interview-questions"],
      },
      {
        title: "Angular + ASP.NET Core",
        blurb:
          "JWT interceptors, guards, refresh races, and the SPA contract with a .NET API backend.",
        slugs: ["angular-interview-questions-aspnet-core"],
      },
    ],
  },
  {
    slug: "async-concurrency",
    label: "Async & Threading",
    title: "C# Async vs Multithreading for ASP.NET Core",
    description:
      "Asynchronous meaning and definition, async vs sync, promises (Task), and C# multithreading — definitions, ASP.NET Core rules, when to use each, and interview questions.",
    intro:
      "C# **async/await** and **multithreading** solve different problems. Start with [asynchronous meaning](/blog/asynchronous-meaning-definition) and [async vs sync](/blog/async-vs-sync-programming) if definitions are fuzzy. Async frees ThreadPool workers during I/O waits; multithreading coordinates parallel workers and in-memory synchronization.",
    matchTags: ["Asynchronous Programming", "Threading", "Concurrency"],
    keywords: [
      "asynchronous meaning",
      "asynchronous definition",
      "async vs sync",
      "promise async programming",
      "asynchronous class C#",
      "C# multithreading",
      "C# async vs multithreading",
      "ASP.NET Core threading",
      "C# concurrency",
    ],
    relatedTopicSlugs: ["interview-questions", "ef-core"],
    pinSlugs: [
      "asynchronous-meaning-definition",
      "async-vs-sync-programming",
      "async-promise-explained",
      "callback-vs-promise-async",
      "deadlock-csharp-explained",
      "asynchronous-class-csharp",
      "csharp-multithreading-primer",
      "csharp-async-await-aspnet-core",
      "csharp-threadpool-starvation-sync-over-async",
      "csharp-task-run-aspnet-core",
      "csharp-task-vs-thread",
      "csharp-cancellationtoken-aspnet-core",
      "csharp-configureawait-false-library",
      "csharp-backgroundservice-hosted-service-async",
      "csharp-async-await-interview-questions",
      "ihttpclientfactory-aspnet-core",
      "aspnet-core-rate-limiting",
    ],
    faq: [
      {
        q: "What is the asynchronous meaning in programming?",
        a: "**Asynchronous** means code can start slow work (SQL, HTTP) and release its worker while waiting — completion arrives later via a `Task`. See [asynchronous meaning and definition](/blog/asynchronous-meaning-definition) for the full explanation and C# examples.",
      },
      {
        q: "What is the difference between async and sync?",
        a: "**Sync** blocks the caller until each step finishes. **Async** starts I/O, frees the ThreadPool worker during the wait, and resumes on completion. On ASP.NET Core APIs, use async for EF Core and HttpClient — never `.Result` on the request path. Full comparison: [async vs sync](/blog/async-vs-sync-programming).",
      },
      {
        q: "What is a promise in async programming?",
        a: "A **promise** is a handle on work that will complete later — result, fault, or cancel. In C# that is `Task` or `Task<T>`, not an OS thread. JavaScript uses `Promise`. Details: [promise in async programming](/blog/async-promise-explained).",
      },
      {
        q: "What is a callback in async programming?",
        a: "A **callback** is a function invoked when async work completes. Promises and `async`/`await` replace nested callback pyramids with composable Tasks. Comparison: [callback vs promise](/blog/callback-vs-promise-async).",
      },
      {
        q: "What is deadlock and how do you avoid it?",
        a: "**Deadlock** is circular wait — each thread holds a resource another needs. Avoid with lock ordering, timeouts, no `await` inside `lock`, and async end-to-end instead of `.Result`. OS theory and C# examples: [deadlock explained](/blog/deadlock-csharp-explained).",
      },
      {
        q: "What is the difference between async and multithreading in C#?",
        a: "**Async/await** yields the ThreadPool worker during I/O waits — the `Task` is a promise, not a dedicated thread. **Multithreading** runs work on multiple workers (`Task.Run`, `Parallel`, `lock`, concurrent collections). On ASP.NET Core, default to async for SQL and HTTP; use threading primitives for CPU offload, in-memory gates, and background queues.",
      },
      {
        q: "Why does an ASP.NET Core API hang with idle CPU?",
        a: "Usually **thread pool starvation**: `.Result`, `.Wait()`, or `.GetAwaiter().GetResult()` block pool workers while async continuations still need workers to finish. The queue grows, gateways return 504, and CPU stays low because nobody is computing — they are waiting. Fix: async end to end, not more VMs.",
      },
      {
        q: "When is async void vs async Task acceptable in C#?",
        a: "Web APIs should return **`Task` or `Task<T>`** so Kestrel can observe completion and exceptions. **`async void`** is for UI event handlers that cannot return a Task. An `async void` controller action is an interview red flag.",
      },
      {
        q: "What is an async deadlock in C#?",
        a: "On **WPF/legacy ASP.NET**, blocking the UI/sync-context thread while an `await` tries to post back causes a classic deadlock. **ASP.NET Core** has no request sync context — `.Result` on Core **starves the pool** instead. Different symptom, same rule: do not block on `Task`.",
      },
      {
        q: "Should I use CancellationToken, Channels, or rate limiting?",
        a: "**CancellationToken** — cooperative cancel when the client disconnects; pass it to `ToListAsync` and `HttpClient`. **Channel + BackgroundService** — in-process work after `Ok()` (not `Task.Run` fire-and-forget). **Rate limiting middleware** — throttle *inbound* abuse (429). **SemaphoreSlim** — cap *outbound* partner calls. They solve different edges.",
      },
    ],
    tracks: [
      {
        title: "Start here: definitions (asynchronous, async vs sync, promise)",
        blurb:
          "Plain definitions before implementation — asynchronous meaning, async vs sync, what a promise is, and how an asynchronous class looks in C#.",
        slugs: [
          "asynchronous-meaning-definition",
          "async-vs-sync-programming",
          "async-promise-explained",
          "asynchronous-class-csharp",
        ],
      },
      {
        title: "Multithreading primer and async/await on ASP.NET Core",
        blurb:
          "One guided pass over threads, the pool, and async — then the ASP.NET Core checklist and CancellationToken before you touch the pool.",
        slugs: [
          "csharp-multithreading-primer",
          "csharp-task-vs-thread",
          "csharp-async-await-aspnet-core",
          "csharp-cancellationtoken-aspnet-core",
          "csharp-task-run-aspnet-core",
        ],
      },
      {
        title: "Diagnose idle-CPU 504s and thread pool starvation",
        blurb:
          "Idle CPU and 504s with healthy SQL is a queueing problem. Start with starvation, then ConfigureAwait if a library is in the dump, then AsyncLocal if the wrong tenant showed up after await.",
        slugs: [
          "csharp-threadpool-starvation-sync-over-async",
          "csharp-configureawait-false-library",
          "csharp-asynclocal-vs-threadlocal",
        ],
      },
      {
        title: "ASP.NET Core request-path async",
        blurb:
          "Await I/O end to end on the action: stream big exports, cap WhenAll, gate outbound calls, then a BackgroundService for work after Ok(). Do not WhenAll two queries on one DbContext.",
        slugs: [
          "csharp-iasyncenumerable-yield-return",
          "csharp-task-whenall-vs-parallel-foreach",
          "csharp-semaphore-slim-async-lock",
          "csharp-backgroundservice-hosted-service-async",
        ],
      },
      {
        title: "C# threading primitives",
        blurb:
          "lock is a short in-memory gate you cannot await. Channel, ConcurrentDictionary, Interlocked, TaskCompletionSource, and AsyncLocal each have their own URL. Task.Yield is UI-only — skip it on ASP.NET Core.",
        slugs: [
          "csharp-channel-producer-consumer",
          "csharp-concurrentdictionary-lock",
          "csharp-lock-statement-monitor-mutex",
          "csharp-interlocked-compareexchange",
          "csharp-taskcompletionsource-legacy-event",
          "csharp-task-yield-ui-thread",
        ],
      },
      {
        title: "Interview rehearsal (how-tos are above)",
        blurb:
          "Scenario answers, not trivia. Async await questions for the common loop; expert questions for staff (streams, channels, tenant maps).",
        slugs: [
          "csharp-async-await-interview-questions",
          "csharp-expert-interview-questions",
        ],
      },
    ],
  },
  {
    slug: "design-patterns",
    label: "C# Design Patterns",
    title: "C# Design Patterns",
    description:
      "Practical C# design patterns for real ASP.NET Core products — Factory, Strategy, and patterns that reduce switch-statement sprawl without ceremony.",
    intro:
      "Named patterns for real ASP.NET Core APIs — when Factory, Strategy, Repository, and SOLID actually reduce change cost, and when they are ceremony.",
    keywords: ["C# design patterns", "repository definition", "define repository", "Factory pattern C#", "Strategy pattern ASP.NET Core", "Repository pattern .NET", "SOLID principles"],
    relatedTopicSlugs: ["dependency-injection", "ef-core"],
    faq: [
      {
        q: "Which C# design pattern should I learn first for interviews?",
        a: "**SOLID** as a review lens, then **Factory** when construction branches grow, then **Strategy** when behavior swaps by tenant or product line. Repository only when query shape is reused — not as a default wrapper over DbContext.",
      },
      {
        q: "Is the Repository pattern required with EF Core?",
        a: "No. Use it when a named query or command is reused across handlers and tests. A pass-through repository over `DbContext` is ceremony.",
      },
      {
        q: "Strategy vs Factory — what is the difference?",
        a: "**Factory** chooses *which object to construct*. **Strategy** swaps *how an operation runs* after construction. Both beat giant `switch` statements when variants keep growing.",
      },
    ],
    matchTags: [
      "Design Patterns",
      "Factory Pattern",
      "Strategy Pattern",
      "Repository Pattern",
      "SOLID",
    ],
    pinSlugs: [
      "repository-definition-meaning",
      "repository-pattern-dotnet",
    ],
  },
  {
    slug: "dependency-injection",
    label: "Dependency Injection",
    title: "Dependency Injection in .NET",
    description:
      "ASP.NET Core DI lifetimes, registration habits, and factory delegates — how senior teams keep services testable and avoid captive dependencies.",
    intro:
      "ASP.NET Core dependency injection — lifetimes, captive dependencies, and registration mistakes that only show up under load or in Azure.",
    keywords: ["ASP.NET Core dependency injection", "DI lifetimes", "Unable to resolve service", "IOptions Snapshot"],
    relatedTopicSlugs: ["design-patterns"],
    faq: [
      {
        q: "What are ASP.NET Core DI lifetimes?",
        a: "**Singleton** — one instance per application. **Scoped** — one per HTTP request (DbContext). **Transient** — new instance every resolve. Never inject scoped into singleton without a scope factory.",
      },
      {
        q: "Why cannot I inject DbContext into a Singleton?",
        a: "DbContext is scoped and not thread-safe. A singleton holding it becomes a **captive dependency** — stale context, wrong tenant, or `ObjectDisposedException`.",
      },
      {
        q: "IOptions vs IOptionsSnapshot vs IOptionsMonitor?",
        a: "**IOptions** — singleton snapshot at first use. **Snapshot** — reloads per scope when config changes. **Monitor** — change notifications for singletons that must react to config updates.",
      },
    ],
    matchTags: ["Dependency Injection", "IoC", "DI"],
    pinSlugs: [
      "aspnet-core-dependency-injection",
      "aspnet-core-unable-to-resolve-service",
      "aspnet-core-ioptions-snapshot-monitor",
    ],
  },
  {
    slug: "authentication",
    label: "Auth & Tokens",
    title: "ASP.NET Core + Angular Authentication",
    description:
      "JWT refresh, Angular interceptors, BFF/YARP, cookies, CORS with credentials, and the production failures that look like “flaky auth.”",
    intro:
      "JWT, refresh tokens, Angular interceptors, CORS with credentials, and BFF patterns — definitions and failure modes before the deep-dive articles.",
    keywords: ["ASP.NET Core JWT", "Angular JWT interceptor", "refresh token rotation", "BFF pattern ASP.NET Core"],
    relatedTopicSlugs: ["identity", "interview-questions"],
    faq: [
      {
        q: "What is the difference between 401 and 403 for an Angular SPA?",
        a: "**401** — not authenticated or token invalid/expired; re-login or refresh. **403** — authenticated but forbidden; show an access-denied UI, do not automatically log the user out unless that is your product rule.",
      },
      {
        q: "Should refresh tokens live in localStorage?",
        a: "High-risk SPAs prefer **httpOnly cookies** and often a **BFF** so refresh tokens never sit in JavaScript-accessible storage. Trade-off: CSRF protection and CORS credentials configuration.",
      },
      {
        q: "Why does JWT validate on jwt.io but API returns 401?",
        a: "Wrong issuer/audience, clock skew, signing key disposed, or **`kid` missing from JWKS** after key rotation. Validate against the API's authority metadata, not jwt.io alone.",
      },
    ],
    matchTags: ["JWT", "CORS", "YARP"],
    pinSlugs: [
      "aspnet-core-jwt-auth",
      "aspnet-core-401-vs-403",
      "aspnet-core-idx10503-jwt-signature",
      "aspnet-core-idx10501-jwt-kid",
      "angular-jwt-interceptors",
    ],
  },
  {
    slug: "identity",
    label: "Identity",
    title: "Identity articles for ASP.NET Core",
    description:
      "IdentityServer, OpenIddict, ASP.NET Identity, and MapIdentityApi notes — the product choice, not interceptor plumbing.",
    intro:
      "IdentityServer, OpenIddict, ASP.NET Core Identity, and MapIdentityApi — product choice and migration, not interceptor plumbing.",
    keywords: ["IdentityServer vs ASP.NET Identity", "OpenIddict migration", "OIDC redirect URI", "MapIdentityApi JWT"],
    relatedTopicSlugs: ["authentication"],
    faq: [
      {
        q: "IdentityServer vs ASP.NET Core Identity?",
        a: "**Identity** is a user store in your app. **IdentityServer/OpenIddict** is an OAuth/OIDC **token issuer** for SSO across clients. APIs usually validate JWTs; they do not replace an identity server for multi-app login.",
      },
      {
        q: "Why am I stuck in an OIDC redirect loop?",
        a: "**redirect_uri** must match the client registration exactly — scheme, host, path, trailing slash. One character mismatch causes endless redirects.",
      },
      {
        q: "MapIdentityApi vs AddJwtBearer?",
        a: "**MapIdentityApi** issues Identity API tokens (often opaque). **JWT bearer** expects a signed JWT with issuer/audience your API trusts. Angular must send the token type your API is configured for.",
      },
    ],
    matchTags: ["IdentityServer", "OpenIddict", "OIDC", "ASP.NET Core Identity", "SSO"],
    pinSlugs: [
      "identityserver-vs-aspnet-identity",
      "identityserver-redirect-uri-login-loop",
      "identityserver4-openiddict-migration-checklist",
      "mapidentityapi-opaque-token-vs-jwt",
    ],
  },
  {
    slug: "ef-core",
    label: "EF Core",
    title: "EF Core and SQL Server articles",
    description:
      "N+1 versus Include versus AsSplitQuery, cartesian explosion, AsNoTracking identity, parameter sniffing, and query habits that survive real clinic and catalog data.",
    intro:
      "EF Core and SQL Server for ASP.NET Core APIs — N+1, cartesian explosion, tracking, query filters, and plans that fail only on real clinic or catalog data.",
    keywords: ["EF Core performance", "EF Core N+1", "AsSplitQuery", "EF Core global query filter", "SQL Server parameter sniffing"],
    relatedTopicSlugs: ["interview-questions", "async-concurrency"],
    faq: [
      {
        q: "What is EF Core N+1?",
        a: "One query for the parent list plus **one query per row** for a related entity — often from lazy loading or a loop calling the database. Fix with projection, Include, or a single SQL shape.",
      },
      {
        q: "Include vs AsSplitQuery?",
        a: "**Include** can create one large JOIN (cartesian explosion). **AsSplitQuery** runs multiple SQL statements without duplicating parent rows in memory.",
      },
      {
        q: "When should I use AsNoTracking?",
        a: "Read-only endpoints where you will not call `SaveChanges`. For updates, use tracking or attach explicitly. Lists should often **project to DTO** in SQL instead of loading full entities.",
      },
    ],
    matchTags: ["EF Core", "SQL Server"],
    pinSlugs: [
      "ef-core-sql-performance",
      "ef-core-nplus1-include-vs-assplitquery",
      "ef-core-cartesian-explosion-multiple-include",
      "ef-core-interview-questions",
    ],
  },
  {
    slug: "cqrs",
    label: "CQRS",
    title: "CQRS after MediatR licensing",
    description:
      "CQRS-lite in ASP.NET Core — when MediatR is worth a license, when Wolverine is a real upgrade, and when a mediator is ceremony.",
    intro:
      "CQRS-lite on ASP.NET Core — commands vs queries, when MediatR earns its license, and when a mediator is ceremony.",
    keywords: ["CQRS ASP.NET Core", "MediatR license", "Wolverine .NET", "IMediator"],
    relatedTopicSlugs: ["design-patterns", "architecture"],
    faq: [
      {
        q: "What is CQRS in ASP.NET Core?",
        a: "Separating **commands** (writes) from **queries** (reads) — often as MediatR handlers. It does not require two databases or event sourcing.",
      },
      {
        q: "MediatR vs calling a service directly?",
        a: "MediatR when pipelines (validation, logging, transactions) compose across many use cases. A plain service class is fine when handlers stay thin and few.",
      },
      {
        q: "Should I migrate from MediatR to Wolverine?",
        a: "Depends on handler count, notification usage, and license cost — not brand preference. See the licensing article for a slice-level migration lens.",
      },
    ],
    matchTags: ["MediatR", "CQRS", "Wolverine"],
  },
  {
    slug: "edi",
    label: "Healthcare EDI",
    title: "Healthcare EDI on .NET",
    description:
      "Vendor-neutral X12 intake on ASP.NET Core — envelopes, 837-shaped pipelines, and what not to log. Not a product pitch and not a compliance certificate.",
    intro:
      "X12 EDI on .NET — intake pipelines, mapping boundaries, and PHI-safe logging for healthcare integrations.",
    keywords: ["X12 EDI C#", "healthcare EDI ASP.NET Core", "837 parser .NET", "PHI logging Serilog"],
    relatedTopicSlugs: ["architecture"],
    faq: [
      {
        q: "How do you parse X12 in ASP.NET Core?",
        a: "Stream segments — do not load multi-gigabyte interchanges into a single string. Validate envelope and transaction control numbers, map to domain models, persist **idempotently**, ACK with 997/999.",
      },
      {
        q: "Can EDI parsing run on the HTTP request thread?",
        a: "No for production volume. Accept upload, enqueue, return **202**. Workers parse with bounded memory and retry policy.",
      },
      {
        q: "What EDI data should never hit default logs?",
        a: "Member identifiers, diagnoses, and full segment payloads. Use redaction or restricted sinks — see the Serilog PII article.",
      },
    ],
    matchTags: ["EDI", "X12", "Serilog"],
  },
  {
    slug: "caching",
    label: "Caching",
    title: "Caching for ASP.NET Core APIs",
    description:
      "What is a cache miss, caching system design with IMemoryCache and Redis, object cache patterns, and fixing error establishing a Redis connection on ASP.NET Core.",
    intro:
      "Caching trades freshness for latency — but only on **cache hits**. Start with [what is a cache miss](/blog/what-is-a-cache-miss), then [caching system in .NET](/blog/caching-system-dotnet-imemorycache-redis) and [Redis production patterns](/blog/redis-caching-aspnet-core).",
    keywords: [
      "what is a cache miss",
      "java caching system",
      "java object cache",
      "error establishing a redis connection",
      "IMemoryCache ASP.NET Core",
      "Redis caching",
    ],
    relatedTopicSlugs: ["architecture", "ef-core", "async-concurrency"],
    matchTags: ["Caching", "Redis", "IMemoryCache", "Performance"],
    pinSlugs: [
      "what-is-a-cache-miss",
      "caching-system-dotnet-imemorycache-redis",
      "redis-connection-error-aspnet-core",
      "redis-caching-aspnet-core",
    ],
    faq: [
      {
        q: "What is a cache miss?",
        a: "The requested key is not in the cache (or expired), so the app loads from SQL or HTTP — slower than a hit. Definition: [what is a cache miss](/blog/what-is-a-cache-miss).",
      },
      {
        q: "What is a Java object cache vs .NET?",
        a: "Java uses Caffeine/Ehcache in heap; .NET uses **IMemoryCache** for in-process object cache. Both mirror the same cache-aside pattern. Distributed layer: Redis in both stacks. Guide: [caching system in .NET](/blog/caching-system-dotnet-imemorycache-redis).",
      },
      {
        q: "How do I fix error establishing a Redis connection?",
        a: "Check host, port (6380 + SSL on Azure), password, Docker service name vs localhost, and firewall. Fail-open to SQL if cache is optional. [Redis connection fix](/blog/redis-connection-error-aspnet-core).",
      },
    ],
    tracks: [
      {
        title: "Definitions: cache miss and caching layers",
        blurb:
          "Hit vs miss, then IMemoryCache vs Redis — the vocabulary before production tuning.",
        slugs: ["what-is-a-cache-miss", "caching-system-dotnet-imemorycache-redis"],
      },
      {
        title: "Redis: patterns and connection errors",
        blurb:
          "Production cache-aside, stampede control, then troubleshooting when Redis will not connect.",
        slugs: ["redis-caching-aspnet-core", "redis-connection-error-aspnet-core"],
      },
    ],
  },
  {
    slug: "api-design",
    label: "API Design",
    title: "API Design for REST and ASP.NET Core",
    description:
      "What is an API, API design principles, REST resource naming, versioning, error envelopes, pagination, and auth — practical checklists for ASP.NET Core APIs consumed by Angular clients.",
    intro:
      "API design is the contract Angular, mobile, and partner clients depend on — URLs, status codes, ProblemDetails, versioning, and auth at the boundary. Start with [what is an API](/blog/what-is-an-api), then [API design principles](/blog/api-design-principles).",
    keywords: [
      "what is an API",
      "api design",
      "api design principles",
      "REST API design",
      "ASP.NET Core Web API",
    ],
    relatedTopicSlugs: ["architecture", "authentication", "interview-questions"],
    matchTags: ["API Design", "REST", "Web API"],
    pinSlugs: [
      "what-is-an-api",
      "api-design-principles",
      "aspnet-core-api-validation",
      "aspnet-core-global-exception-handling",
      "aspnet-core-minimal-apis",
      "angular-dotnet-integration",
    ],
    faq: [
      {
        q: "What is an API?",
        a: "An Application Programming Interface — a contract for one program to request data or actions from another. Web APIs use HTTP, JSON, and status codes. Definition and example: [what is an API](/blog/what-is-an-api).",
      },
      {
        q: "What are API design principles?",
        a: "Resource URLs (nouns), correct HTTP verbs, consistent ProblemDetails errors, pagination, versioning before breaking changes, auth at the boundary, and idempotent writes for payments. Checklist: [API design principles](/blog/api-design-principles).",
      },
      {
        q: "How do I design APIs for Angular?",
        a: "One validation envelope, CORS with credentials if using cookies, stable JSON field names, and refresh-token flow that matches your interceptor. See [API validation](/blog/aspnet-core-api-validation) and [Angular + .NET integration](/blog/angular-dotnet-integration).",
      },
    ],
    tracks: [
      {
        title: "Start here: definitions and principles",
        blurb:
          "What an API is, then the design principles checklist before you open validation and auth articles.",
        slugs: ["what-is-an-api", "api-design-principles"],
      },
      {
        title: "Errors, validation, and client contracts",
        blurb:
          "ProblemDetails, FluentValidation, and global exception handling so Angular parses one envelope.",
        slugs: [
          "aspnet-core-api-validation",
          "aspnet-core-global-exception-handling",
          "aspnet-core-json-object-cycle",
        ],
      },
      {
        title: "Auth, rate limits, and integration",
        blurb:
          "JWT, BFF, CORS, rate limiting, and the Angular HTTP contract.",
        slugs: [
          "aspnet-core-jwt-auth",
          "bff-pattern-aspnet-core-angular-yarp",
          "aspnet-core-rate-limiting",
          "angular-dotnet-integration",
        ],
      },
    ],
  },
  {
    slug: "architecture",
    label: "Architecture",
    title: "Software Architecture",
    description:
      "Architecture notes for .NET + Angular systems — config files, Clean Architecture, modular monolith vs services, Minimal APIs, and boundaries that survive healthcare, SaaS, and eCommerce delivery.",
    intro:
      "Architecture for .NET + Angular products — configuration, middleware, JSON contracts, Clean Architecture, and boundaries that survive the first production incident.",
    keywords: ["Clean Architecture ASP.NET Core", "appsettings ASP.NET Core", "middleware order", "modular monolith .NET"],
    relatedTopicSlugs: ["dependency-injection", "authentication", "ef-core", "api-design", "caching"],
    faq: [
      {
        q: "What is Clean Architecture in ASP.NET Core?",
        a: "Domain and application rules at the center; infrastructure and UI at the edges. Controllers stay thin. The goal is testable boundaries — not a folder template copied without domain complexity.",
      },
      {
        q: "Why does middleware order matter?",
        a: "**CORS** must run before the browser gives up on a 401 without headers. **Authentication** before **authorization**. **Exception handling** cannot fix responses that already started writing.",
      },
      {
        q: "Modular monolith vs microservices?",
        a: "Start monolith with **clear module boundaries**. Split services when independent deploy/scale is proven necessary — not because diagrams looked cleaner.",
      },
    ],
    matchTags: [],
    categoryOnly: true,
    pinSlugs: [
      "aspnet-core-appsettings-localappsettings",
      "clean-architecture-aspnet-core",
      "aspnet-core-json-object-cycle",
      "aspnet-core-middleware-order",
      "aspnet-core-headers-readonly-response-started",
      "aspnet-core-data-protection-xml-encryptor",
    ],
  },
];

export function getLearningTopic(slug: string): LearningTopic | undefined {
  return learningTopics.find((topic) => topic.slug === slug);
}

export type ProjectRelated = {
  href: string;
  title: string;
};

export type Project = {
  slug: string;
  title: string;
  summary: string;
  problem: string;
  solution: string;
  result: string;
  stack: string[];
  layers: string[];
  github?: string;
  liveUrl?: string;
  confidential?: boolean;
  domain: string;
  /** Extra case-page copy so /work/[slug] is not a thin duplicate of the listing card. */
  caseNotes: string[];
  related: ProjectRelated[];
};

/** If you add a project slug, also add it to PROJECT_SLUGS in scripts/generate-feeds.mjs. */
export const projects: Project[] = [
  {
    slug: "carbazaar",
    title: "CarBazaar",
    summary:
      "Microservices marketplace for vehicle auctions — designed around independent deployability and secure identity.",
    problem:
      "Auction platforms fail when identity, search, bidding, and gateway logic are trapped in one monolith that cannot scale or change safely.",
    solution:
      "Split the domain into Auction, Identity, Search, and API Gateway services on .NET + Angular. IdentityServer/OAuth/JWT for auth, RabbitMQ for async workflows, Docker for reproducible environments.",
    result:
      "A reference architecture clients can extend into real marketplaces — clear boundaries, event-driven flow, and production-grade auth patterns.",
    stack: [
      ".NET",
      "Angular",
      "IdentityServer",
      "RabbitMQ",
      "Docker",
      "JWT / OAuth 2.0",
    ],
    github: "https://github.com/ShahidBaloch/CarBazaar",
    layers: ["Angular SPA", "API Gateway", "Auction · Identity · Search", "RabbitMQ · Docker"],
    domain: "Marketplace architecture",
    caseNotes: [
      "The identity split was the decision that paid off. Buyer, seller, and ops surfaces needed one login without copying user tables into Auction and Search. IdentityServer sat behind the gateway as the token issuer; the other services validated JWTs and never saw passwords. That is the SSO shape I describe in the IdentityServer vs Identity article — not Identity bolted onto every microservice.",
      "Bidding and search change at different rates. Putting both in one ASP.NET Core host would have made a catalog index deploy wait on an auction bugfix. RabbitMQ carried bid events so Search could stay eventually consistent instead of joining live bids on every query. Docker made the four-process local story repeatable; the pain was redirect URIs and CORS across those hosts, not the container files.",
      "If I rebuilt it today I would still keep identity off the SPA, but I would evaluate a BFF so browser tokens never sit in localStorage. The auction and search APIs would keep the same contracts. The GitHub repo is the architecture reference — not a live marketplace with real vehicles.",
    ],
    related: [
      {
        href: "/blog/identityserver-vs-aspnet-identity",
        title: "What is an identity server in ASP.NET Core?",
      },
      {
        href: "/blog/bff-pattern-aspnet-core-angular-yarp",
        title: "BFF with ASP.NET Core, Angular, and YARP",
      },
      {
        href: "/blog/identityserver-redirect-uri-login-loop",
        title: "IdentityServer redirect URI mismatch and login loops",
      },
    ],
  },
  {
    slug: "ecom-net10",
    title: "Ecom_NET10",
    summary:
      "Clean Architecture eCommerce stack — ASP.NET Core APIs + Angular SPA with maintainable domain boundaries.",
    problem:
      "Many storefronts start fast and become unmaintainable: mixed concerns, weak auth, and queries that cannot evolve with the catalog.",
    solution:
      "API / Core / Infrastructure layering, Repository + Specification patterns, EF Core + SQL Server, JWT/RBAC, and Angular reactive UX for catalog, cart, and orders.",
    result:
      "A foundation teams can extend into real merchandising and checkout without rewriting the core — patterns proven in .NET 10 solutions.",
    stack: [
      "ASP.NET Core",
      ".NET 10",
      "Angular",
      "EF Core",
      "SQL Server",
      "JWT",
      "Clean Architecture",
    ],
    github: "https://github.com/ShahidBaloch/Ecom_NET10",
    layers: ["Angular storefront", "ASP.NET Core APIs", "Domain · Application", "EF Core · SQL Server"],
    domain: "eCommerce platform",
    caseNotes: [
      "The storefront is one Angular app and one API product. That is why I did not start with IdentityServer. ASP.NET Core Identity plus JWT and RBAC is the right default until a second app or a partner shows up. Catalog, cart, and orders share a user table; SSO ceremony would have been inventory I was not ready to operate.",
      "Catalog filters are where storefronts rot. Specification objects keep EF Core queries named and testable instead of stuffing every merchant rule into a controller. When the catalog grows, the failure is usually SQL — N+1, fat Includes, sniffed plans — not the Angular grid. The Clean Architecture folders only help if the query stays in Infrastructure and the UI gets a DTO, not an entity graph.",
      "The GitHub repo is a .NET 10-shaped foundation I use in conversations with eCommerce teams. It is not a hosted shop. If you are choosing Identity vs an authorization server for a single storefront, start with the IdentityServer article; if the product already 500s on a product-detail page, start with EF Core performance, not another layer.",
    ],
    related: [
      {
        href: "/blog/clean-architecture-aspnet-core",
        title: "Clean Architecture in ASP.NET Core without over-engineering",
      },
      {
        href: "/blog/identityserver-vs-aspnet-identity",
        title: "What is an identity server in ASP.NET Core?",
      },
      {
        href: "/blog/ef-core-sql-performance",
        title: "EF Core and SQL Server performance",
      },
    ],
  },
  {
    slug: "healthcare-saas",
    title: "Healthcare & SaaS delivery",
    summary:
      "Enterprise healthcare modules for providers, fees, and onboarding — shipped in production with cross-functional teams.",
    problem:
      "Healthcare operators need secure workflows for providers and operations, with query performance and reliable integrations under real load.",
    solution:
      "Built and evolved .NET APIs and Angular/MVC surfaces: Provider Registration, Fee Schedules, AWS SaaS onboarding, SQL tuning, Azure storage, and Cosmos models where needed.",
    result:
      "Operational features that improved enrollment and provider workflows — delivered with product, design, and QA partners on production systems.",
    stack: [
      ".NET Core",
      "Angular",
      "SQL Server",
      "Azure",
      "Cosmos DB",
      "AWS",
      "Agile",
    ],
    confidential: true,
    layers: ["Provider & ops portals", ".NET APIs", "SQL Server · Cosmos DB", "Azure · AWS"],
    domain: "Healthcare / SaaS",
    caseNotes: [
      "This page stays at the pattern level because the delivery was under NDA. I will not name product screens, tenants, or PHI examples. What I can say: provider registration and fee schedules are write-heavy operational workflows. The Angular/MVC surfaces were only as good as the SQL behind them — a fee lookup that is fine on demo data times out when a real schedule and a real clinic load share a sniffed plan.",
      "Onboarding and document flows used Azure storage; some reference data lived in Cosmos where the access pattern was key-lookup, not reporting. EDI conversion sat next to those APIs as a pipeline, not as log-the-payload convenience. Healthcare logging is a product decision: if Serilog writes a member ID into App Insights, you have a compliance incident, not a debugging win.",
      "The useful public writing from this work is the SQL and EDI material, not a screenshot tour. If you are hiring for a similar healthcare or SaaS slice, the contact form is the right next step — I will not paste internals into a case study to make the URL look longer.",
    ],
    related: [
      {
        href: "/blog/ef-core-sql-performance",
        title: "EF Core and SQL Server performance",
      },
      {
        href: "/blog/edi-x12-parser-csharp-dotnet",
        title: "EDI X12 parsers in C# and .NET",
      },
      {
        href: "/blog/serilog-pii-redaction-healthcare-aspnet-core",
        title: "Serilog PII redaction for healthcare APIs",
      },
    ],
  },
];

export function getProject(slug: string): Project | undefined {
  return projects.find((project) => project.slug === slug);
}

export const services = [
  {
    title: "Solution design & technical discovery",
    description:
      "Clarify requirements, map domains, and propose pragmatic architecture — monolith vs services, data ownership, and delivery risks — before code multiplies cost.",
  },
  {
    title: "ASP.NET Core API platforms",
    description:
      "Secure, versioned REST APIs with Clean Architecture, EF Core/Dapper, Swagger, and SQL that stays fast as traffic and modules grow.",
  },
  {
    title: "Angular product frontends",
    description:
      "Angular 15+ portals and SPAs with reactive forms, RxJS, lazy modules, and UX suited to admin, provider, and customer journeys.",
  },
  {
    title: "Identity, SSO & authorization",
    description:
      "IdentityServer, OAuth 2.0, OIDC, JWT, SSO, RBAC, and 2FA designed as a coherent access model — not bolted-on endpoint checks.",
  },
  {
    title: "Azure data & integration",
    description:
      "Blob/Tables/Queues, Cosmos DB, Redis, and messaging patterns (including RabbitMQ/SignalR) for resilient workflows and integrations.",
  },
  {
    title: "Delivery systems & CI/CD",
    description:
      "Azure DevOps / GitHub Actions, Dockerized consistency, reviewable PRs, and AI-assisted velocity without sacrificing architecture quality.",
  },
] as const;

export const experience = [
  {
    role: "Senior Software Engineer",
    company: "Universal Digital Health Care / Optikode",
    period: "Sep 2025 – Present",
    points: [
      "Own production healthcare features on .NET + Angular with product, design, and QA partners.",
      "Design REST APIs for maintainability and cross-module integration; tune SQL for response time.",
      "Use AI tooling to accelerate delivery while keeping clean architecture and review standards.",
    ],
  },
  {
    role: "Consultant – Products",
    company: "Systems Limited",
    period: "Dec 2024 – Aug 2025",
    points: [
      "Contributed to a cloud industry platform: Azure storage workflows and Cosmos DB modeling.",
      "Built EDI parsing/conversion flows that improved stakeholder usability.",
      "Translated BA requirements into maintainable .NET + Angular product code.",
    ],
  },
  {
    role: "Software Engineer",
    company: "Universal Digital Health Care",
    period: "May 2022 – Nov 2024",
    points: [
      "Delivered Provider Registration and Fee Schedules for healthcare operations.",
      "Implemented AWS-hosted SaaS provider onboarding to improve enrollment efficiency.",
      "Integrated Angular UI with .NET backends for reliable day-to-day clinical/ops workflows.",
    ],
  },
  {
    role: "Junior .NET Developer",
    company: "Arwa Technologies",
    period: "May 2021 – Apr 2022",
    points: [
      "Enhanced eCommerce features on the Microsoft stack with cross-functional delivery — catalog, checkout, and day-to-day storefront work.",
    ],
  },
] as const;

export const principles = [
  {
    title: "Boundaries before buzzwords",
    text: "I choose modular monoliths or microservices based on change rate and team size — not fashion.",
  },
  {
    title: "Security is a design input",
    text: "AuthZ models, token lifetimes, and audit paths are decided early — not patched after demos.",
  },
  {
    title: "Data shapes the product",
    text: "SQL, Cosmos, and cache strategy follow access patterns. Slow queries get fixed at the source.",
  },
  {
    title: "Ship in thin slices",
    text: "Vertical slices with clear acceptance criteria beat big-bang rewrites and invisible progress.",
  },
] as const;

export const skills = {
  backend: [
    ".NET 6/8/10",
    "ASP.NET Core",
    "C#",
    "EF Core",
    "Dapper",
    "REST APIs",
    "CQRS / MediatR",
    "SignalR",
    "Microservices",
  ],
  frontend: [
    "Angular 15+",
    "TypeScript",
    "RxJS",
    "Reactive Forms",
    "PrimeNG",
    "AG Grid",
    "Bootstrap",
  ],
  dataCloud: [
    "SQL Server",
    "Cosmos DB",
    "Redis",
    "Azure",
    "Docker",
    "AWS",
    "RabbitMQ",
  ],
  security: [
    "IdentityServer",
    "OAuth 2.0",
    "OIDC / SSO",
    "JWT",
    "RBAC",
    "2FA",
  ],
  architecture: [
    "Clean Architecture",
    "DDD-lite",
    "API Gateway",
    "Event-driven design",
    "Specification pattern",
    "CI/CD design",
  ],
} as const;

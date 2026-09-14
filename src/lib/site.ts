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
  /** Shorter label for jump-to-track pills on compact hubs. */
  shortTitle?: string;
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
  /** Router-style hub: track cards only, FAQ schema without visible FAQ, no article dump. */
  compactHub?: boolean;
  /** Render topic markdown before track cards (pillar explainer hubs). */
  bodyFirst?: boolean;
  /** Three entry paths shown after pillar content on compact explainer hubs. */
  hubPaths?: { label: string; description: string; href: string }[];
  /** Collapsible checks rendered after pillar markdown on compact explainer hubs. */
  hubCallouts?: { title: string; content: string }[];
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
    title: "Interview Question Tracks for .NET and Angular",
    description:
      "Topic index for .NET interview prep — pick async, ASP.NET Core, EF Core, or Angular tracks. Full question banks live on the linked articles, not this page.",
    intro: "",
    compactHub: true,
    matchTags: ["Interview Questions"],
    keywords: [
      "NET interview prep tracks",
      "ASP.NET Core interview tracks",
      "scenario-based interview prep .NET",
    ],
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
        a: "Use the [.NET interview questions and answers](/blog/dotnet-interview-questions-answers) article as the question bank. This page only routes you into async, ASP.NET Core, EF Core, and Angular tracks.",
      },
      {
        q: "How should I split ASP.NET Core, EF Core, and async interview prep?",
        a: "Study one track at a time from the cards below. Implementation depth: [async hub](/learning/async-concurrency). Oral answers: the linked interview articles under each track.",
      },
      {
        q: "What .NET interview scenarios come up most?",
        a: "Captive DI, JWT with Angular, middleware order, thread-pool starvation, EF slowness, refresh races, and `WhenAll` on one `DbContext`. Full write-ups are on the track articles — not this index.",
      },
    ],
    tracks: [
      {
        title: "C# async and threading interview questions",
        shortTitle: "C# async & staff",
        blurb: "Most common 3–5 year loop — `.Result`, `async void`, `WhenAll` — then **staff runtime** (Channels, Span, streams).",
        slugs: [
          "csharp-async-await-interview-questions",
          "csharp-expert-interview-questions",
        ],
      },
      {
        title: "ASP.NET Core interview questions — pipeline and JWT scenarios",
        shortTitle: "ASP.NET Core",
        blurb: "**Middleware order**, JWT, validation, ProblemDetails — pipeline judgment under load, not property-bag trivia.",
        slugs: ["aspnet-core-interview-questions-scenarios"],
      },
      {
        title: "EF Core interview questions — change tracker and concurrency",
        shortTitle: "EF Core",
        blurb: "**SaveChanges** failures, global query filters, **RowVersion**, **ExecuteUpdate** — not an N+1 tutorial.",
        slugs: ["ef-core-interview-questions"],
      },
      {
        title: "Angular interview questions with ASP.NET Core backend",
        shortTitle: "Angular + .NET",
        blurb: "JWT interceptors, guards, refresh races, and the SPA contract with a **.NET API**.",
        slugs: ["angular-interview-questions-aspnet-core"],
      },
    ],
  },
  {
    slug: "async-concurrency",
    label: "Async & Threading",
    title: "Async and Await in C# — Explained with Examples",
    description:
      "C# async and await language primer — async vs await keywords, TAP examples, then links to ASP.NET Core production articles.",
    intro: "",
    compactHub: true,
    bodyFirst: true,
    hubPaths: [
      {
        label: "What is async/await?",
        description: "Language primer: async vs await keywords and how they work.",
        href: "#what-is-async-and-await-in-c",
      },
      {
        label: "Concurrent I/O",
        description: "Start independent work together — then open the WhenAll article.",
        href: "#async-without-parallel-then-start-work-together",
      },
      {
        label: "504 / idle CPU",
        description: "Short symptom map — full fix on the starvation article.",
        href: "#thread-pool-starvation",
      },
      {
        label: "Interview prep",
        description: "Scenario answers after you know the how-tos.",
        href: "/learning/interview-questions",
      },
    ],
    hubCallouts: [
      {
        title: "Sync vs async — one API request under load",
        content:
          "**Sync:** 500 clients each block a worker for 200 ms SQL → pool exhausted, queue grows, gateway 504, CPU looks idle.\n\n**Async:** same 200 ms SQL, but workers are **returned to the pool during the wait** → the same pool serves far more concurrent waits.\n\nAsync does not shorten the query — it stops **one client = one pinned worker** during I/O. Side-by-side tables: [async vs sync](/blog/async-vs-sync-programming).",
      },
      {
        title: "Spot the bug — which PR would you reject?",
        content:
          "```csharp\n// A — sync-over-async in a service\npublic OrderDto Get(Guid id) => _repo.GetAsync(id).Result;\n\n// B — fake async\npublic async Task<int> CountAsync() => 42;\n\n// C — WhenAll on one DbContext\nawait Task.WhenAll(_db.A.ToListAsync(ct), _db.B.ToListAsync(ct));\n```\n\n**Answer: all three.** A starves the pool. B triggers CS4014. C races EF Core. Production checklist: [async/await in ASP.NET Core](/blog/csharp-async-await-aspnet-core).",
      },
      {
        title: "Does async mean parallel?",
        content:
          "**No.** One thread can run `await` after `await` sequentially — that is async **without** parallel.\n\n**Parallel async** is starting **independent** I/O (two HTTP calls, two DbContext scopes) and awaiting them together.\n\n**Not parallel:** two `ToListAsync` on the same `DbContext` in `WhenAll` — that is a bug, not concurrency. Caps: [Task.WhenAll](/blog/csharp-task-whenall-vs-parallel-foreach).",
      },
    ],
    matchTags: ["Asynchronous Programming", "Threading", "Concurrency"],
    // Hub-level only — do not list spoke primaries (Google ignores meta keywords,
    // but title/desc/FAQ still must not claim those SERPs).
    keywords: [
      "async and await in C#",
      "what is async and await in C#",
      "async await c#",
      "c# async and await explained",
      "difference between async and await in c#",
      "async and await keywords in c#",
      "c# async await tutorial",
      "async method in c#",
      "Task-based asynchronous pattern",
      "asynchronous programming C#",
    ],
    relatedTopicSlugs: ["interview-questions", "ef-core"],
    pinSlugs: [
      "csharp-multithreading-primer",
      "asynchronous-meaning-definition",
      "async-vs-sync-programming",
      "async-promise-explained",
      "callback-vs-promise-async",
      "deadlock-csharp-explained",
      "asynchronous-class-csharp",
      "csharp-async-await-aspnet-core",
      "csharp-threadpool-starvation-sync-over-async",
      "csharp-task-run-aspnet-core",
      "csharp-task-vs-thread",
      "csharp-cancellationtoken-aspnet-core",
      "csharp-configureawait-false-library",
      "csharp-backgroundservice-hosted-service-async",
      "ihttpclientfactory-aspnet-core",
      "aspnet-core-rate-limiting",
    ],
    // FAQPage JSON-LD: only hub-intent questions. Spoke PAA lives on child URLs.
    faq: [
      {
        q: "What is async and await in C#?",
        a: "**Async and await in C#** implement the Task-based Asynchronous Pattern (TAP). The **`async`** modifier marks a method that returns `Task` or `Task<T>`. The **`await`** operator pauses that method until I/O completes and **returns control to the caller** meanwhile. Use them for SQL, HTTP, and files — not to speed up a single query, but to free threads under load. Language examples on this hub; ASP.NET production checklist: [async/await in ASP.NET Core](/blog/csharp-async-await-aspnet-core).",
      },
      {
        q: "What is the difference between async and await in C#?",
        a: "**`async`** is a **modifier** on the method signature — it enables `await` inside and makes the method return a `Task`. **`await`** is an **operator** used inside an async method on an awaitable call. You need both: `async` declares the async method; `await` is where execution yields. They are not interchangeable keywords.",
      },
      {
        q: "How do you use async and await in C# with an example?",
        a: "Mark the method `async`, return `Task` or `Task<T>`, and `await` each I/O call. Example: `public async Task<OrderDto?> GetOrderAsync(Guid id, CancellationToken ct) { var order = await _db.Orders.FirstOrDefaultAsync(o => o.Id == id, ct); return Map(order); }` — more examples on this hub. Dictionary terms: [asynchronous meaning](/blog/asynchronous-meaning-definition). Request-path rules: [async/await in ASP.NET Core](/blog/csharp-async-await-aspnet-core).",
      },
      {
        q: "How does async and await work in C#?",
        a: "The caller gets a `Task` immediately. At `await`, the runtime **yields** the thread/worker until the operation completes, then runs the continuation. On ASP.NET Core that means the ThreadPool worker serves other clients during SQL/HTTP waits. Step-by-step on this hub under **How async and await works in C#**.",
      },
      {
        q: "What is an async method in C#?",
        a: "An **async method in C#** is any method (or lambda) marked with **`async`** that returns **`Task`**, **`Task<T>`**, or in rare UI cases **`void`**. It must use **`await`** on real I/O (or return `Task.FromResult` without `async`). API controllers should return `async Task<IActionResult>`, never `async void`.",
      },
      {
        q: "Does async make C# code run faster?",
        a: "**No** — async does not shorten SQL, HTTP, or disk time. It **frees the ThreadPool worker** during the wait so one API can serve more concurrent clients. Async improves **throughput**, not single-query speed. 504 / idle-CPU failure mode: [thread pool starvation](/blog/csharp-threadpool-starvation-sync-over-async).",
      },
      {
        q: "Where do Task vs Thread, WhenAll, and starvation guides live?",
        a: "This hub is the language primer and article map. Open [Task vs Thread](/blog/csharp-task-vs-thread), [Task.WhenAll](/blog/csharp-task-whenall-vs-parallel-foreach), [thread pool starvation](/blog/csharp-threadpool-starvation-sync-over-async), or the tracks below — each owns that SERP.",
      },
    ],
    tracks: [
      {
        title: "Definitions",
        shortTitle: "Definitions",
        blurb:
          "[Asynchronous meaning](/blog/asynchronous-meaning-definition), [async vs sync](/blog/async-vs-sync-programming), [promise vs Task](/blog/async-promise-explained), [callback vs promise](/blog/callback-vs-promise-async), and [asynchronous class in C#](/blog/asynchronous-class-csharp).",
        slugs: [
          "asynchronous-meaning-definition",
          "async-vs-sync-programming",
          "async-promise-explained",
          "callback-vs-promise-async",
          "asynchronous-class-csharp",
        ],
      },
      {
        title: "Multithreading primer",
        shortTitle: "Multithreading",
        blurb:
          "[C# multithreading tutorial](/blog/csharp-multithreading-primer), [Task vs Thread](/blog/csharp-task-vs-thread), [async await ASP.NET Core](/blog/csharp-async-await-aspnet-core), [CancellationToken](/blog/csharp-cancellationtoken-aspnet-core), and [Task.Run vs await](/blog/csharp-task-run-aspnet-core).",
        slugs: [
          "csharp-multithreading-primer",
          "csharp-task-vs-thread",
          "csharp-async-await-aspnet-core",
          "csharp-cancellationtoken-aspnet-core",
          "csharp-task-run-aspnet-core",
        ],
      },
      {
        title: "Starvation and library context",
        shortTitle: "Starvation",
        blurb:
          "[Sync-over-async and 504s](/blog/csharp-threadpool-starvation-sync-over-async), [ConfigureAwait(false) in libraries](/blog/csharp-configureawait-false-library), and [AsyncLocal vs ThreadLocal](/blog/csharp-asynclocal-vs-threadlocal).",
        slugs: [
          "csharp-threadpool-starvation-sync-over-async",
          "csharp-configureawait-false-library",
          "csharp-asynclocal-vs-threadlocal",
        ],
      },
      {
        title: "Request-path async",
        shortTitle: "Request path",
        blurb:
          "[IAsyncEnumerable exports](/blog/csharp-iasyncenumerable-yield-return), [Task.WhenAll caps](/blog/csharp-task-whenall-vs-parallel-foreach), [SemaphoreSlim WaitAsync](/blog/csharp-semaphore-slim-async-lock), and [BackgroundService after Ok()](/blog/csharp-backgroundservice-hosted-service-async).",
        slugs: [
          "csharp-iasyncenumerable-yield-return",
          "csharp-task-whenall-vs-parallel-foreach",
          "csharp-semaphore-slim-async-lock",
          "csharp-backgroundservice-hosted-service-async",
        ],
      },
      {
        title: "Threading primitives",
        shortTitle: "Threading",
        blurb:
          "[Channel producer-consumer](/blog/csharp-channel-producer-consumer), [ConcurrentDictionary](/blog/csharp-concurrentdictionary-lock), [lock vs Monitor](/blog/csharp-lock-statement-monitor-mutex), [Interlocked](/blog/csharp-interlocked-compareexchange), [deadlock in C#](/blog/deadlock-csharp-explained), and [TaskCompletionSource](/blog/csharp-taskcompletionsource-legacy-event). Skip [Task.Yield](/blog/csharp-task-yield-ui-thread) on ASP.NET Core — UI only.",
        slugs: [
          "csharp-channel-producer-consumer",
          "csharp-concurrentdictionary-lock",
          "csharp-lock-statement-monitor-mutex",
          "csharp-interlocked-compareexchange",
          "csharp-taskcompletionsource-legacy-event",
          "deadlock-csharp-explained",
          "csharp-task-yield-ui-thread",
        ],
      },
      {
        title: "Outbound HTTP and rate limits",
        shortTitle: "HTTP limits",
        blurb:
          "[IHttpClientFactory](/blog/ihttpclientfactory-aspnet-core) for socket exhaustion and [rate limiting middleware](/blog/aspnet-core-rate-limiting) for inbound 429s — different edges from SemaphoreSlim outbound caps.",
        slugs: ["ihttpclientfactory-aspnet-core", "aspnet-core-rate-limiting"],
      },
    ],
  },
  {
    slug: "design-patterns",
    label: "C# Design Patterns",
    title: "C# Design Pattern Articles",
    description:
      "Article map for practical C# design patterns on ASP.NET Core — Factory, Strategy, Repository, and SOLID deep dives.",
    intro:
      "Named patterns for real ASP.NET Core APIs — open the linked article for each pattern. This page is the index.",
    keywords: [
      "C# design patterns articles",
      "ASP.NET Core design patterns hub",
      "Factory Strategy SOLID article map",
    ],
    relatedTopicSlugs: ["dependency-injection", "ef-core"],
    faq: [
      {
        q: "Which design-pattern article should I open first?",
        a: "Interview lens: [SOLID](/blog/solid-principles-aspnet-core). Construction branches: [Factory](/blog/csharp-factory-pattern). Behavior swaps: [Strategy](/blog/csharp-strategy-pattern). This page indexes them.",
      },
      {
        q: "Where is repository definition vs pattern?",
        a: "Dictionary: [repository definition](/blog/repository-definition-meaning). When to use with EF: [repository pattern in .NET](/blog/repository-pattern-dotnet).",
      },
      {
        q: "Strategy vs Factory — which article?",
        a: "Both have dedicated posts linked above. Short split: Factory chooses *what to construct*; Strategy swaps *how an operation runs*.",
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
    title: "Dependency Injection Articles for .NET",
    description:
      "Topic index for ASP.NET Core DI — links to lifetimes, Unable to resolve service, and IOptions deep dives.",
    intro:
      "ASP.NET Core dependency injection — start with [DI lifetimes](/blog/aspnet-core-dependency-injection), then troubleshooting and options articles linked below.",
    keywords: [
      "ASP.NET Core dependency injection articles",
      "DI topic hub .NET",
      ".NET DI lifetimes overview",
    ],
    relatedTopicSlugs: ["design-patterns"],
    faq: [
      {
        q: "Where should I start with ASP.NET Core DI?",
        a: "Read [Dependency Injection in ASP.NET Core](/blog/aspnet-core-dependency-injection) for lifetimes and captive dependencies. This page is the article index.",
      },
      {
        q: "Where is the Unable to resolve service fix?",
        a: "Registration and resolve failures: [Unable to resolve service](/blog/aspnet-core-unable-to-resolve-service).",
      },
      {
        q: "Where do IOptions vs Snapshot vs Monitor live?",
        a: "Full comparison: [IOptions vs IOptionsSnapshot vs IOptionsMonitor](/blog/aspnet-core-ioptions-snapshot-monitor).",
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
    title: "ASP.NET Core + Angular Authentication Articles",
    description:
      "Article map for JWT, Angular interceptors, refresh rotation, BFF/YARP, and CORS — open the linked guide for each failure mode.",
    intro:
      "Auth deep dives live on the articles below. Start with [JWT checklist](/blog/aspnet-core-jwt-auth), then interceptors, rotation, and BFF as needed.",
    keywords: [
      "ASP.NET Core Angular authentication articles",
      "JWT auth topic hub",
      "SPA auth article map .NET",
    ],
    relatedTopicSlugs: ["identity", "interview-questions"],
    faq: [
      {
        q: "Where do I start for Angular + ASP.NET Core auth?",
        a: "API checklist: [JWT auth](/blog/aspnet-core-jwt-auth). SPA attach/refresh: [Angular JWT interceptors](/blog/angular-jwt-interceptors). This page only indexes the cluster.",
      },
      {
        q: "Where is 401 vs 403 explained?",
        a: "Challenge vs Forbid and Angular logout mistakes: [401 vs 403](/blog/aspnet-core-401-vs-403).",
      },
      {
        q: "Where are BFF and refresh-token guides?",
        a: "[BFF with YARP](/blog/bff-pattern-aspnet-core-angular-yarp), [refresh rotation](/blog/aspnet-core-jwt-refresh-token-rotation), [HttpOnly cookie refresh](/blog/refresh-token-httponly-cookie-angular-aspnet-core).",
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
    title: "Identity Articles for ASP.NET Core",
    description:
      "Article index for IdentityServer, OpenIddict, ASP.NET Identity, and MapIdentityApi — product choice and migration links.",
    intro:
      "Identity product choice and migration live on the articles below — not interceptor plumbing (see the authentication hub for JWT/SPA).",
    keywords: [
      "ASP.NET Core identity articles",
      "IdentityServer OpenIddict topic hub",
      "OIDC identity article map",
    ],
    relatedTopicSlugs: ["authentication"],
    faq: [
      {
        q: "Where is IdentityServer vs ASP.NET Identity?",
        a: "Product choice write-up: [What is an identity server in ASP.NET Core?](/blog/identityserver-vs-aspnet-identity).",
      },
      {
        q: "Where is the OIDC redirect-loop fix?",
        a: "[IdentityServer redirect URI mismatch](/blog/identityserver-redirect-uri-login-loop).",
      },
      {
        q: "Where is MapIdentityApi vs JWT?",
        a: "[MapIdentityApi opaque tokens vs JWT](/blog/mapidentityapi-opaque-token-vs-jwt).",
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
    title: "EF Core and SQL Server Articles",
    description:
      "Article map for EF Core on ASP.NET Core — links to the performance checklist, N+1, cartesian explosion, relationships, and SQL Server plans.",
    intro:
      "Start with the [EF Core performance checklist](/blog/ef-core-sql-performance), then open the failure-mode article that matches your symptom.",
    keywords: [
      "EF Core SQL Server articles",
      "EF Core topic hub ASP.NET Core",
      "EF Core performance article map",
    ],
    relatedTopicSlugs: ["interview-questions", "async-concurrency"],
    faq: [
      {
        q: "Where should I start with EF Core performance?",
        a: "Checklist first: [EF Core and SQL Server performance](/blog/ef-core-sql-performance). This page indexes the deeper failure modes.",
      },
      {
        q: "Where is the N+1 vs Include vs AsSplitQuery guide?",
        a: "[EF Core N+1 vs Include vs AsSplitQuery](/blog/ef-core-nplus1-include-vs-assplitquery).",
      },
      {
        q: "Where are relationships and AsNoTracking covered?",
        a: "[EF Core relationships](/blog/ef-core-relationships) and [AsNoTracking vs identity resolution](/blog/ef-core-asnotracking-vs-identity-resolution).",
      },
    ],
    matchTags: ["EF Core", "SQL Server"],
    pinSlugs: [
      "ef-core-sql-performance",
      "ef-core-relationships",
      "ef-core-nplus1-include-vs-assplitquery",
      "ef-core-cartesian-explosion-multiple-include",
      "ef-core-interview-questions",
    ],
  },
  {
    slug: "cqrs",
    label: "CQRS",
    title: "CQRS and MediatR Articles for ASP.NET Core",
    description:
      "Article index for CQRS-lite — when MediatR helps delivery, license vs Wolverine, and when a mediator is ceremony.",
    intro:
      "CQRS-lite on ASP.NET Core — start with [MediatR and CQRS-lite](/blog/mediatr-cqrs-aspnet-core), then the [license vs Wolverine](/blog/mediatr-license-wolverine-alternative) decision.",
    keywords: [
      "CQRS ASP.NET Core articles",
      "MediatR topic hub",
      "CQRS-lite article map .NET",
    ],
    relatedTopicSlugs: ["design-patterns", "architecture"],
    faq: [
      {
        q: "Where should I start with CQRS in ASP.NET Core?",
        a: "Ceremony vs delivery: [MediatR and CQRS-lite](/blog/mediatr-cqrs-aspnet-core). This page is the index.",
      },
      {
        q: "Where is the MediatR license vs Wolverine guide?",
        a: "[MediatR commercial license vs Wolverine](/blog/mediatr-license-wolverine-alternative).",
      },
      {
        q: "Do I need a mediator for CQRS?",
        a: "No — commands and queries as separate requests can be plain services. See the CQRS-lite article for when MediatR earns its keep.",
      },
    ],
    matchTags: ["MediatR", "CQRS", "Wolverine"],
  },
  {
    slug: "edi",
    label: "Healthcare EDI",
    title: "Healthcare EDI Articles on .NET",
    description:
      "Article map for X12 EDI on ASP.NET Core — parsers, intake pipelines, and PHI-safe logging. Not a compliance certificate.",
    intro:
      "X12 EDI on .NET — start with [EDI X12 parsers](/blog/edi-x12-parser-csharp-dotnet), then [Serilog PII redaction](/blog/serilog-pii-redaction-healthcare-aspnet-core).",
    keywords: [
      "healthcare EDI .NET articles",
      "X12 ASP.NET Core topic hub",
      "EDI article map C#",
    ],
    relatedTopicSlugs: ["architecture"],
    faq: [
      {
        q: "Where should I start with EDI on .NET?",
        a: "Parser notes: [EDI X12 parsers in C#](/blog/edi-x12-parser-csharp-dotnet). This page is the index.",
      },
      {
        q: "Where is PHI-safe logging covered?",
        a: "[Serilog PII redaction for healthcare APIs](/blog/serilog-pii-redaction-healthcare-aspnet-core).",
      },
      {
        q: "Should EDI parse on the HTTP request thread?",
        a: "No for production volume — accept, enqueue, return **202**. Details in the X12 parser article.",
      },
    ],
    matchTags: ["EDI", "X12", "Serilog"],
  },
  {
    slug: "caching",
    label: "Caching",
    title: "Caching Articles for ASP.NET Core APIs",
    description:
      "Article map for ASP.NET Core caching — links to cache-miss, IMemoryCache vs Redis, production Redis, and connection-error guides.",
    intro:
      "Caching trades freshness for latency — but only on **cache hits**. Start with [what is a cache miss](/blog/what-is-a-cache-miss), then [caching system in .NET](/blog/caching-system-dotnet-imemorycache-redis) and [Redis production patterns](/blog/redis-caching-aspnet-core).",
    keywords: [
      "ASP.NET Core caching articles",
      "Redis IMemoryCache topic hub",
      ".NET caching article map",
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
        q: "Which caching article should I read first?",
        a: "Definitions: [what is a cache miss](/blog/what-is-a-cache-miss). Layers: [caching system in .NET](/blog/caching-system-dotnet-imemorycache-redis). This page is the index only.",
      },
      {
        q: "Where is Redis production caching covered?",
        a: "[Redis caching in ASP.NET Core](/blog/redis-caching-aspnet-core) — stampede control, invalidation, tenant keys.",
      },
      {
        q: "Where is the Redis connection error fix?",
        a: "[Error establishing a Redis connection](/blog/redis-connection-error-aspnet-core).",
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
    title: "API Design Articles for REST and ASP.NET Core",
    description:
      "Article map for REST API design on ASP.NET Core — links to definitions, principles checklist, OpenAPI/Swagger, and Angular contracts.",
    intro:
      "API design is the contract Angular, mobile, and partner clients depend on. Start with [what is an API](/blog/what-is-an-api), then [API design principles](/blog/api-design-principles).",
    keywords: [
      "ASP.NET Core API design articles",
      "REST API topic hub",
      "Web API article map .NET",
    ],
    relatedTopicSlugs: ["architecture", "authentication", "interview-questions"],
    matchTags: ["API Design", "REST", "Web API"],
    pinSlugs: [
      "what-is-an-api",
      "api-design-principles",
      "swagger-openapi-aspnet-core",
      "aspnet-core-api-validation",
      "aspnet-core-global-exception-handling",
      "aspnet-core-minimal-apis",
      "angular-dotnet-integration",
    ],
    faq: [
      {
        q: "Which API design article should I read first?",
        a: "Plain definition: [what is an API](/blog/what-is-an-api). Production checklist: [API design principles](/blog/api-design-principles). This page indexes the cluster.",
      },
      {
        q: "Where is Swagger vs OpenAPI covered?",
        a: "[Swagger vs OpenAPI in ASP.NET Core](/blog/swagger-openapi-aspnet-core).",
      },
      {
        q: "Where are validation and Angular contract guides?",
        a: "[FluentValidation envelope](/blog/aspnet-core-api-validation) and [Angular + .NET integration](/blog/angular-dotnet-integration).",
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
        title: "OpenAPI, validation, and client contracts",
        blurb:
          "Swagger vs OpenAPI, Swashbuckle and Scalar, FluentValidation envelopes, and ProblemDetails Angular can parse.",
        slugs: [
          "swagger-openapi-aspnet-core",
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
    title: "Software Architecture Articles for .NET",
    description:
      "Article map for .NET + Angular architecture — Clean Architecture, modular monolith, middleware order, configuration, and Minimal APIs.",
    intro:
      "Architecture for .NET + Angular products — open the linked article for each topic. Start with [Clean Architecture](/blog/clean-architecture-aspnet-core) when boundaries are the question.",
    keywords: [
      "ASP.NET Core architecture articles",
      ".NET architecture topic hub",
      "Clean Architecture article map",
    ],
    relatedTopicSlugs: ["dependency-injection", "authentication", "ef-core", "api-design", "caching"],
    faq: [
      {
        q: "Where is Clean Architecture covered?",
        a: "[Clean Architecture in ASP.NET Core](/blog/clean-architecture-aspnet-core). This page indexes related architecture posts.",
      },
      {
        q: "Where is middleware order explained?",
        a: "[ASP.NET Core middleware order](/blog/aspnet-core-middleware-order).",
      },
      {
        q: "Where is modular monolith vs microservices?",
        a: "[Modular monolith vs microservices in .NET](/blog/modular-monolith-vs-microservices-dotnet).",
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

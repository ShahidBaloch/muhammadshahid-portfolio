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
  inquiryCta: "Start a project inquiry",
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

export type LearningTopic = {
  slug: string;
  label: string;
  title: string;
  description: string;
  intro: string;
  /** Extra tags that also qualify a post for this topic hub. */
  matchTags: string[];
  /** Hub order: Search Console winners and pillar URLs before newest dumps. */
  pinSlugs?: string[];
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
      "Interview posts here are rehearsal, not implementation manuals. Each URL is a different loop: async traps, expert C# runtime, ASP.NET Core API judgment, Angular + JWT with a .NET backend, and EF Core change-tracker / concurrency questions. If you want the merge checklist, follow the how-to article linked from that scenario. Start with async await if that is the prompt you keep failing; use the ASP.NET Core scenarios page for middleware and JWT storytelling; use the EF Core interview page for SaveChanges, query filters, and concurrency — not for N+1 SQL, which has its own hub.",
    matchTags: ["Interview Questions"],
    pinSlugs: [
      "csharp-async-await-interview-questions",
      "csharp-expert-interview-questions",
      "aspnet-core-interview-questions-scenarios",
      "ef-core-interview-questions",
      "angular-interview-questions-aspnet-core",
    ],
  },
  {
    slug: "design-patterns",
    label: "C# Design Patterns",
    title: "C# Design Patterns",
    description:
      "Practical C# design patterns for real ASP.NET Core products — Factory, Strategy, and patterns that reduce switch-statement sprawl without ceremony.",
    intro:
      "I reach for a named design pattern when a product already has a repeating decision — pricing rules, export formats, catalog filters — and the if-else tree is about to become the feature. This hub is not a catalog of every Gang of Four name. It is the subset I actually use on ASP.NET Core APIs that Angular teams consume: Factory when construction logic keeps growing, Strategy when behavior must swap without editing callers, Repository when query shape deserves a name, and SOLID as a review lens rather than a folder religion. Each article walks a production-shaped example, then says when the pattern is ceremony. If you are studying for interviews, start with SOLID and Factory; if you are refactoring a live API, start with Strategy or Repository and skip anything that does not match a change you can point at in source control.",
    matchTags: [
      "Design Patterns",
      "Factory Pattern",
      "Strategy Pattern",
      "Repository Pattern",
      "SOLID",
    ],
  },
  {
    slug: "dependency-injection",
    label: "Dependency Injection",
    title: "Dependency Injection in .NET",
    description:
      "ASP.NET Core DI lifetimes, registration habits, and factory delegates — how senior teams keep services testable and avoid captive dependencies.",
    intro:
      "Dependency injection in ASP.NET Core is easy to start and easy to get wrong. Most production bugs I see are not “forgot to register a service” — they are captive dependencies (a Singleton holding a Scoped DbContext), hidden new-ups that bypass the container, or factory delegates that close over request state. This hub collects the DI notes I use on healthcare, SaaS, and marketplace APIs: lifetimes, registration habits, and how Factory-style delegates fit when a switch statement is really a composition problem. Read the lifetimes article first if you own Program.cs. If the exception is Unable to resolve service for type, use that troubleshooting post instead of rereading lifetimes. Pair with Factory or Strategy posts when the container is being asked to pick an implementation at runtime. The goal is a container graph a teammate can explain in a PR, not a clever service locator.",
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
      "This hub is the Angular + ASP.NET Core token lifecycle: short-lived JWTs, refresh rotation, concurrent 401s, httpOnly cookies, CORS credentials, and when a BFF is the honest answer. Start with the JWT checklist if you are issuing tokens; use 401 vs 403 if the SPA logs people out on a permission miss; use IDX10501 if the token kid is missing from JWKS and IDX10503 if signature failed with keys that were actually tried; use the interceptor and 401-queue posts if refresh is racing; read BFF when you want tokens off the browser; read Duende BFF versus custom YARP when the architecture is already decided and the remaining question is buy versus build. CORS belongs here when the failure showed up after login, not as a generic networking topic.",
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
      "Identity choice is a product decision: one app versus SSO, opaque Identity API tokens versus JWT bearer, Duende licensing versus OpenIddict. This hub is for that decision — not for interceptor plumbing. Start with what an identity server is if you are choosing Identity versus an authorization server. Read MapIdentityApi versus JWT if Angular is sending the wrong string into AddJwtBearer. Read the IdentityServer4 to OpenIddict checklist only if you are leaving a dead IS4 host — not as a greenfield default. Login loops and redirect_uri mismatch live in the redirect URI article, not in the SSO essay.",
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
      "EF Core looks fine on demo data and fails when a clinic or seller catalog is real. This hub is SQL-shaped: N+1 round-trips, fat JOINs, split queries, projections, tracking, and sniffed plans. Start with the performance pillar for the checklist. Use the N+1 versus AsSplitQuery article when you are not sure which bug you have. Use cartesian explosion when two Includes made one query huge but the JSON still looked correct. Use AsNoTracking versus identity resolution when the same Patient is two objects. Use parameter sniffing when one tenant is fast and another times out on the same LINQ. Interview narration — concurrency tokens, global query filters, ExecuteUpdate — is the EF Core interview questions post, not a second SQL tutorial.",
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
      "CQRS here means commands and queries as separate use cases, not event sourcing. Start with the MediatR ceremony article if you are adding a bus. Use the licensing article if the question is stay, pay, migrate to Wolverine, or delete IMediator. Do not add a second competing “what is CQRS” URL.",
    matchTags: ["MediatR", "CQRS", "Wolverine"],
  },
  {
    slug: "edi",
    label: "Healthcare EDI",
    title: "Healthcare EDI on .NET",
    description:
      "Vendor-neutral X12 intake on ASP.NET Core — envelopes, 837-shaped pipelines, and what not to log. Not a product pitch and not a compliance certificate.",
    intro:
      "Independent EDI write-ups are rare; vendor pages are not. This hub is architecture for X12 on .NET: intake, queues, mapping boundaries, and PHI-safe logging. The parser article is the starting point. The Serilog PII article is what not to put in App Insights. Transaction-specific 837 / 835 / 850 pages come next only when they add a real pipeline, not a duplicate URL.",
    matchTags: ["EDI", "X12", "Serilog"],
  },
  {
    slug: "architecture",
    label: "Architecture",
    title: "Software Architecture",
    description:
      "Architecture notes for .NET + Angular systems — config files, Clean Architecture, modular monolith vs services, Minimal APIs, and boundaries that survive healthcare, SaaS, and eCommerce delivery.",
    intro:
      "Architecture here means the decisions that survive the first production incident: where data lives, who is allowed to change it, and how the Angular SPA talks to ASP.NET Core without a contract that rot. Start with the config-file article if the search was appsettings or localappsettings.json. This hub is also Clean Architecture, modular monolith vs services, Minimal APIs, and the JSON contract failures that look like “the API 500s on detail pages.” Cycle exceptions are the object-cycle article — not an EF N+1 tutorial. JWT plumbing, EF SQL, and EDI parsers have their own topic pages. Skip a split into microservices until a boundary has a real independent deploy or scaling reason.",
    matchTags: [
      "Architecture",
      "Clean Architecture",
      "Microservices",
      "Modular Monolith",
      "Minimal APIs",
    ],
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

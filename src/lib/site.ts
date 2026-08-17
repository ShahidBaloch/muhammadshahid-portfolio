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
};

/** Topic hubs under Blog — SEO landing pages that group related articles. */
export const learningTopics: LearningTopic[] = [
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
      "Dependency injection in ASP.NET Core is easy to start and easy to get wrong. Most production bugs I see are not “forgot to register a service” — they are captive dependencies (a Singleton holding a Scoped DbContext), hidden new-ups that bypass the container, or factory delegates that close over request state. This hub collects the DI notes I use on healthcare, SaaS, and marketplace APIs: lifetimes, registration habits, and how Factory-style delegates fit when a switch statement is really a composition problem. Read the lifetimes article first if you own Program.cs. Pair it with Factory or Strategy posts when the container is being asked to pick an implementation at runtime. The goal is a container graph a teammate can explain in a PR, not a clever service locator.",
    matchTags: ["Dependency Injection", "IoC", "DI"],
  },
  {
    slug: "authentication",
    label: "Auth & Tokens",
    title: "ASP.NET Core + Angular Authentication",
    description:
      "JWT refresh, Angular interceptors, BFF/YARP, cookies, CORS with credentials, and the production failures that look like “flaky auth.”",
    intro:
      "This hub is the Angular + ASP.NET Core token lifecycle: short-lived JWTs, refresh rotation, concurrent 401s, httpOnly cookies, CORS credentials, and when a BFF is the honest answer. Start with the JWT checklist if you are issuing tokens; use the interceptor and 401-queue posts if the SPA is already logging people out; read BFF when you want tokens off the browser; read Duende BFF versus custom YARP when the architecture is already decided and the remaining question is buy versus build. CORS belongs here when the failure showed up after login, not as a generic networking topic.",
    matchTags: ["JWT", "CORS", "YARP"],
  },
  {
    slug: "identity",
    label: "Identity",
    title: "Identity in ASP.NET Core (2026)",
    description:
      "When ASP.NET Identity is enough, when you need OpenIddict or IdentityServer, and why MapIdentityApi tokens are not JWTs.",
    intro:
      "Identity choice is a product decision: one app versus SSO, opaque Identity API tokens versus JWT bearer, Duende licensing versus OpenIddict. This hub is for that decision — not for interceptor plumbing. Read MapIdentityApi versus JWT if Angular is sending the wrong string into AddJwtBearer. Read IdentityServer versus Identity when a second app or an external IdP is on the roadmap. Read the IdentityServer4 to OpenIddict checklist only if you are leaving a dead IS4 host — not as a greenfield default.",
    matchTags: ["IdentityServer", "OpenIddict", "OIDC", "ASP.NET Core Identity", "SSO"],
  },
  {
    slug: "ef-core",
    label: "EF Core",
    title: "EF Core and SQL Server Performance",
    description:
      "N+1 versus Include versus AsSplitQuery, cartesian explosion, AsNoTracking identity, parameter sniffing, and query habits that survive real clinic and catalog data.",
    intro:
      "EF Core looks fine on demo data and fails when a clinic or seller catalog is real. This hub is SQL-shaped: N+1 round-trips, fat JOINs, split queries, projections, tracking, and sniffed plans. Start with the performance pillar for the checklist. Use the N+1 versus AsSplitQuery article when you are not sure which bug you have. Use cartesian explosion when two Includes made one query huge but the JSON still looked correct. Use AsNoTracking versus identity resolution when the same Patient is two objects. Use parameter sniffing when one tenant is fast and another times out on the same LINQ.",
    matchTags: ["EF Core", "SQL Server"],
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
      "Architecture notes for .NET + Angular systems — Clean Architecture, modular monolith vs services, Minimal APIs, and boundaries that survive healthcare, SaaS, and eCommerce delivery.",
    intro:
      "Architecture here means the decisions that survive the first production incident: where data lives, who is allowed to change it, and how the Angular SPA talks to ASP.NET Core without a contract that rot. This hub is Clean Architecture, modular monolith vs services, and Minimal APIs — not JWT plumbing, not EF SQL, not EDI parsers. Those have their own topic pages. Start with Clean Architecture or modular monolith if you are choosing a shape. Skip a split into microservices until a boundary has a real independent deploy or scaling reason.",
    matchTags: [
      "Architecture",
      "Clean Architecture",
      "Microservices",
      "Modular Monolith",
      "Minimal APIs",
    ],
  },
];

export function getLearningTopic(slug: string): LearningTopic | undefined {
  return learningTopics.find((topic) => topic.slug === slug);
}

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
};

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

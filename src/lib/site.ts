export const siteConfig = {
  name: "Muhammad Shahid",
  title: "Senior Full Stack Engineer (.NET + Angular)",
  description:
    "Senior .NET + Angular engineer helping teams design and ship secure healthcare, SaaS, and eCommerce systems — APIs, SPAs, Azure, identity, and clean architecture.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://muhammadshahid.dev",
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
} as const;

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
    matchTags: ["Dependency Injection", "IoC", "DI"],
  },
  {
    slug: "architecture",
    label: "Architecture",
    title: "Software Architecture",
    description:
      "Architecture notes for .NET + Angular systems — Clean Architecture, CQRS-lite, async patterns, Minimal APIs, and boundaries that survive healthcare, SaaS, and eCommerce delivery.",
    matchTags: [
      "Architecture",
      "Clean Architecture",
      "CQRS",
      "Microservices",
      "async await",
      "Minimal APIs",
      "Angular",
      "Signals",
      "AI",
      "Interview Questions",
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
  github?: string;
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
    domain: "Healthcare / SaaS",
  },
];

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
      "Enhanced eCommerce features on the Microsoft stack with cross-functional delivery.",
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

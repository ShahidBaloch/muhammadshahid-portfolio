import type { Metadata } from "@/lib/metadata";
import { pageSocial } from "@/lib/seo";
import { HirePage, type HirePageContent } from "@/views/hire/HirePage";

const path = "/hire-dotnet-developer";
const title = "Hire a Senior .NET Developer (Remote)";
const description =
  "Hire a senior .NET developer for ASP.NET Core APIs, SQL Server tuning, login and SSO, and .NET upgrades. Remote, freelance or contract, reply within one business day.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: path },
  ...pageSocial({ title, description, path }),
};

const content: HirePageContent = {
  path,
  serviceName: ".NET development (freelance and contract)",
  eyebrow: "Hire a .NET developer",
  h1: "Hire a senior .NET developer",
  intro: [
    "I'm Muhammad Shahid, a .NET developer with 5+ years of production work on ASP.NET Core, Entity Framework Core and SQL Server. Most of it has been healthcare and SaaS software, where data has to stay correct and private.",
    "I work remotely from Lahore, Pakistan, on freelance or contract terms. Send me the problem and I'll reply within one business day.",
  ],
  offersTitle: "What I can take off your plate",
  offers: [
    {
      title: "ASP.NET Core APIs",
      text: "New REST APIs or fixes to existing ones: validation, versioning, clear error responses, and tests that run against a real database.",
      proof: { href: "/blog/rfc-9457-problem-details-aspnet-core", label: "How I shape API errors" },
    },
    {
      title: "Slow SQL Server and EF Core",
      text: "I find the queries that hurt, read the execution plans, and fix indexes or EF Core code that pulls too much data.",
      proof: { href: "/blog/ef-core-sql-server-parameter-sniffing", label: "A parameter sniffing fix" },
    },
    {
      title: "Login, roles and SSO",
      text: "ASP.NET Core Identity, Duende IdentityServer, OpenIddict or Microsoft Entra ID, set up so tokens, roles and refresh flows behave.",
      proof: { href: "/blog/identityserver-vs-aspnet-identity", label: "Identity vs IdentityServer" },
    },
    {
      title: "Upgrades to modern .NET",
      text: "Move a .NET Framework or old .NET Core app to current .NET in small steps, so the product keeps shipping while it happens.",
      proof: { href: "/blog/dotnet-framework-vs-dotnet-core", label: ".NET Framework vs .NET" },
    },
    {
      title: "Azure hosting and CI/CD",
      text: "App Service, Functions, Key Vault, Service Bus and GitHub Actions pipelines that deploy the same way every time.",
      proof: { href: "/blog/github-actions-cicd-aspnet-core-angular", label: "My CI/CD setup" },
    },
    {
      title: "The Angular side too",
      text: "If the API has an Angular front end, I can build both, so nobody waits on a handoff between two contractors.",
      proof: { href: "/hire-angular-developer", label: "Angular work" },
    },
  ],
  fitTitle: "Hiring me makes sense when",
  goodFit: [
    "You have a .NET product in production and need a senior developer now, not after a three-month hiring process.",
    "Your API or database got slower as the data grew, and the team is too busy shipping features to dig into it.",
    "You need login, roles or single sign-on done properly, especially around patient or customer data.",
    "Someone else wrote the code and left. I'm used to reading an unfamiliar codebase, writing down the risky parts, and fixing those first.",
  ],
  notFit:
    "If you need a full team for a brand-new product, someone on-site, or a WordPress or PHP site, I'm the wrong person. I'll say so on the first call and, where I can, point you to someone better suited.",
  faq: [
    {
      q: "How much does it cost to hire you?",
      a: "It depends on the scope. A focused fix costs far less than a multi-month build, so I price a clearly defined first milestone at a fixed price after our call. I also work hourly when the scope is still open.",
    },
    {
      q: "Can you work in my time zone?",
      a: "I'm in Pakistan (UTC+5). We agree on a few hours of overlap at the start, and I write clear daily notes so nothing waits for a meeting.",
    },
    {
      q: "Will you sign an NDA?",
      a: "Yes. Some of my healthcare work is under NDA, which is why that case study only shows architecture patterns and no client details.",
    },
    {
      q: "Do you only work on ASP.NET Core?",
      a: "ASP.NET Core is where I spend most of my time, but I also work on .NET Framework apps, mostly to keep them running or to move them to modern .NET.",
    },
    {
      q: "What do I need to have ready?",
      a: "Access to the code repository, a test or staging environment if you have one, and a person who can answer product questions. A database backup with fake data helps a lot for performance work.",
    },
  ],
  related: {
    href: "/blog",
    label: "Read my .NET and SQL Server articles",
    text: "Want to see how I think before you get in touch?",
  },
};

export default function HireDotnetPage() {
  return <HirePage content={content} />;
}

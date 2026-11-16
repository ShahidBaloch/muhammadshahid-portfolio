import type { Metadata } from "@/lib/metadata";
import { pageSocial } from "@/lib/seo";
import { HirePage, type HirePageContent } from "@/views/hire/HirePage";

const path = "/hire-angular-developer";
const title = "Hire an Angular Developer (with .NET Backend Skills)";
const description =
  "Hire an Angular developer who also builds the ASP.NET Core API behind it. Standalone components, signals, login flows, faster screens. Remote, freelance or contract.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: path },
  ...pageSocial({ title, description, path }),
};

const content: HirePageContent = {
  path,
  serviceName: "Angular development (freelance and contract)",
  eyebrow: "Hire an Angular developer",
  h1: "Hire an Angular developer who also knows the backend",
  intro: [
    "Most Angular apps live or die by the API behind them. I build both: Angular front ends and the ASP.NET Core APIs they call, so login, errors and data shapes line up from day one.",
    "I've shipped Angular in healthcare, SaaS and eCommerce products. I work remotely from Lahore, Pakistan, and reply within one business day.",
  ],
  offersTitle: "Angular work I take on",
  offers: [
    {
      title: "New apps on modern Angular",
      text: "Standalone components, signals and typed reactive forms from the start, with a folder layout the next developer can follow.",
      proof: { href: "/blog/angular-standalone-components", label: "Standalone components" },
    },
    {
      title: "Faster, lighter screens",
      text: "OnPush change detection, lazy routes, @defer blocks and build budgets so the app stays quick as it grows.",
      proof: { href: "/blog/angular-onpush-change-detection", label: "OnPush in practice" },
    },
    {
      title: "Login and tokens done right",
      text: "OpenID Connect with PKCE, HTTP interceptors, silent refresh and route guards that match the server's rules.",
      proof: { href: "/blog/angular-oidc-pkce-aspnet-core", label: "OIDC + PKCE setup" },
    },
    {
      title: "Forms that show server errors",
      text: "Reactive forms that display the API's validation messages next to the right field instead of a generic “something went wrong”.",
      proof: { href: "/blog/angular-reactive-forms-validation-problemdetails", label: "Forms + ProblemDetails" },
    },
    {
      title: "State without the mess",
      text: "Signals or SignalStore for most apps, NgRx where it really pays off. I'll explain the trade-off for your app, not in general.",
      proof: { href: "/blog/ngrx-vs-signals-vs-signalstore-angular", label: "NgRx vs signals" },
    },
    {
      title: "Accessibility and tests in CI",
      text: "axe checks and Playwright tests in the pipeline, so screen-reader and keyboard problems get caught before users find them.",
      proof: { href: "/blog/angular-axe-playwright-accessibility-ci", label: "axe + Playwright in CI" },
    },
  ],
  fitTitle: "Hiring me makes sense when",
  goodFit: [
    "Your Angular app talks to an ASP.NET Core API and you want one person who understands both sides.",
    "The app got slow or hard to change after years of features, and you want it cleaned up without a full rewrite.",
    "You're stuck on an old Angular version and need a safe path to current Angular.",
    "Login, token refresh or role-based screens keep breaking and nobody on the team owns them.",
  ],
  notFit:
    "If you need pixel-perfect marketing pages, a mobile app, or a pure design job, you'll get more from a specialist. My strength is business apps where the front end and the API have to work as one.",
  faq: [
    {
      q: "Can you upgrade an old Angular app?",
      a: "Yes. I go one major version at a time, fix what each step breaks, and move modules to standalone components where it makes the code simpler. The app stays shippable between steps.",
    },
    {
      q: "Do you work with a designer, or do the UI yourself?",
      a: "Either. I can build from Figma files, or use a component library like Angular Material and keep the UI clean and consistent if there's no designer.",
    },
    {
      q: "Do you also build the API?",
      a: "Yes, in ASP.NET Core with SQL Server. Building both sides is usually faster because there's no back-and-forth about response shapes or auth.",
    },
    {
      q: "How much does an Angular project cost?",
      a: "It depends on the scope. I usually price a clearly defined first milestone, then we decide the next step together. Hourly work is possible when the scope is still open.",
    },
  ],
  related: {
    href: "/learning/angular",
    label: "Browse my Angular articles",
    text: "Curious how I approach Angular problems?",
  },
};

export default function HireAngularPage() {
  return <HirePage content={content} />;
}

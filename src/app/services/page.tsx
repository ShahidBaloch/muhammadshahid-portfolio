import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, SectionHeading } from "@/components/SectionHeading";
import { services } from "@/lib/site";

export const metadata: Metadata = {
  title: "Hire a Senior .NET + Angular Engineer",
  description:
    "Freelance and contract .NET + Angular engineering for healthcare, SaaS, and eCommerce teams — APIs, Angular SPAs, identity/SSO, Azure, and production delivery.",
  alternates: { canonical: "/services" },
};

export default function ServicesPage() {
  return (
    <>
      <section className="section-pad pt-28 sm:pt-32">
        <div className="container-narrow">
          <SectionHeading
            eyebrow="Services"
            title="How I help teams ship the right system."
            description="Freelance and contract engagements for product teams that need senior .NET + Angular ownership — healthcare, SaaS, and marketplace systems, remote-friendly from Lahore."
            level={1}
          />

          <h2 className="mt-14 font-display text-2xl font-semibold text-ink">What I take on</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {services.map((service) => (
              <article key={service.title} className="surface-hover rounded-xl p-6 sm:p-8">
                <h3 className="font-display text-2xl font-semibold text-ink">{service.title}</h3>
                <p className="mt-3 leading-relaxed text-muted">{service.description}</p>
              </article>
            ))}
          </div>

          <h2 className="mt-16 font-display text-2xl font-semibold text-ink">
            Notes from the same work
          </h2>
          <p className="mt-3 max-w-2xl text-muted">
            Original articles from client and product delivery — not a second services pitch.
          </p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {serviceWriting.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="surface surface-hover block rounded-xl p-5 transition hover:border-ink"
                >
                  <p className="font-display text-lg font-semibold text-ink">{item.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{item.note}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <CtaBand />
    </>
  );
}

const serviceWriting = [
  {
    href: "/learning/interview-questions",
    title: "C# and ASP.NET Core interview questions",
    note: "Scenario answers I use in hiring loops and on client teams.",
  },
  {
    href: "/blog/csharp-async-await-interview-questions",
    title: "C# async await interview questions",
    note: "Production async traps that show up in APIs Angular clients call.",
  },
  {
    href: "/blog/identityserver-vs-aspnet-identity",
    title: "What is IdentityServer in ASP.NET Core?",
    note: "When Identity is enough, and when OpenIddict or Duende is the SSO answer.",
  },
  {
    href: "/blog/aspnet-core-appsettings-localappsettings",
    title: "ASP.NET Core config files",
    note: "What the config file actually is — and why localappsettings.json is usually wrong.",
  },
] as const;


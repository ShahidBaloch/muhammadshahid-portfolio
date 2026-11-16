import Link from "@/components/link";
import { ProfileCard } from "@/components/ProfileCard";
import { CtaBand } from "@/components/SectionHeading";
import { personId } from "@/lib/seo";
import { siteConfig } from "@/lib/site";

export type HireOffer = {
  title: string;
  text: string;
  /** Optional article that shows how I handle this kind of work. */
  proof?: { href: string; label: string };
};

export type HireFaq = { q: string; a: string };

export type HirePageContent = {
  path: string;
  eyebrow: string;
  h1: string;
  intro: string[];
  offersTitle: string;
  offers: HireOffer[];
  fitTitle: string;
  goodFit: string[];
  notFit: string;
  faq: HireFaq[];
  related: { href: string; label: string; text: string };
  serviceName: string;
};

const startSteps = [
  {
    title: "Tell me the problem",
    text: "Use the contact form or WhatsApp. A few lines is enough: what the app does, what is broken or missing, and when you need it.",
  },
  {
    title: "Short call",
    text: "About 30 minutes. I ask about the code, the data, the team, and the deadline. You get honest answers, including “this is not for me”.",
  },
  {
    title: "Written plan",
    text: "Scope, risks, and a first milestone with a price or an hourly estimate. Nothing starts until you agree to it.",
  },
  {
    title: "Weekly progress",
    text: "Small pull requests, a demo every week, and notes on anything I change in the database or the infrastructure.",
  },
] as const;

const work = [
  { href: "/work/healthcare-saas", label: "Healthcare SaaS", text: "Provider and onboarding modules on .NET, Angular, SQL Server and Azure (NDA)." },
  { href: "/work/carbazaar", label: "CarBazaar", text: "Vehicle auction marketplace built as microservices with RabbitMQ and IdentityServer." },
  { href: "/work/ecom-net10", label: "Ecom_NET10", text: "eCommerce stack on ASP.NET Core, EF Core, SQL Server and Angular." },
] as const;

export function HirePage({ content }: { content: HirePageContent }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: content.serviceName,
    url: `${siteConfig.url}${content.path}`,
    provider: { "@id": personId },
    areaServed: "Remote",
    description: content.intro[0],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="hero-canvas" aria-labelledby="hire-heading">
        <div className="container-narrow page-top grid items-start gap-6 px-5 pb-10 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-8 lg:px-12 lg:pb-12">
          <div>
            <p className="eyebrow">{content.eyebrow}</p>
            <h1 id="hire-heading" className="heading-page mt-3">
              {content.h1}
            </h1>
            {content.intro.map((paragraph) => (
              <p key={paragraph} className="mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
                {paragraph}
              </p>
            ))}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link prefetch={false} href="/contact" className="btn-primary w-full sm:w-auto">
                Start a project
              </Link>
              <a
                href={siteConfig.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary w-full sm:w-auto"
              >
                WhatsApp me
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
          </div>
          <ProfileCard />
        </div>
      </section>

      <section className="section-pad" aria-labelledby="hire-offers">
        <div className="container-narrow">
          <h2 id="hire-offers" className="heading-section">
            {content.offersTitle}
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {content.offers.map((offer) => (
              <article key={offer.title} className="surface-hover flex flex-col rounded-xl p-5 sm:p-6">
                <h3 className="heading-card font-semibold">{offer.title}</h3>
                <p className="mt-2 flex-1 leading-relaxed text-muted">{offer.text}</p>
                {offer.proof ? (
                  <Link prefetch={false} href={offer.proof.href} className="mt-4 text-sm font-semibold link-underline">
                    {offer.proof.label}
                    <span aria-hidden> →</span>
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-pad !pt-0" aria-labelledby="hire-fit">
        <div className="container-narrow grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <h2 id="hire-fit" className="heading-section">
              {content.fitTitle}
            </h2>
            <ul className="mt-5 space-y-3">
              {content.goodFit.map((item) => (
                <li key={item} className="flex gap-3 leading-relaxed text-ink-soft">
                  <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-link" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <aside className="card-panel self-start rounded-xl p-5 sm:p-6">
            <h3 className="heading-card font-semibold">When I&apos;m not the right fit</h3>
            <p className="mt-2 leading-relaxed text-muted">{content.notFit}</p>
          </aside>
        </div>
      </section>

      <section className="section-pad !pt-0" aria-labelledby="hire-steps">
        <div className="container-narrow">
          <h2 id="hire-steps" className="heading-section">
            How we start
          </h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {startSteps.map((step, index) => (
              <li key={step.title} className="card-step rounded-xl p-5">
                <p className="text-sm font-semibold text-label">Step {index + 1}</p>
                <h3 className="heading-card mt-2 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section-pad !pt-0" aria-labelledby="hire-work">
        <div className="container-narrow">
          <h2 id="hire-work" className="heading-section">
            Work on this stack
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {work.map((item) => (
              <li key={item.href}>
                <Link prefetch={false} href={item.href} className="surface-hover block h-full rounded-xl p-5">
                  <span className="heading-card block font-semibold">{item.label}</span>
                  <span className="mt-2 block text-sm leading-relaxed text-muted">{item.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section-pad !pt-0" aria-labelledby="hire-faq">
        <div className="container-narrow max-w-3xl">
          <h2 id="hire-faq" className="heading-section">
            Questions people ask before hiring me
          </h2>
          <div className="mt-6 divide-y divide-slate-line border-y border-slate-line">
            {content.faq.map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-heading [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span aria-hidden className="text-xl leading-none text-link transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 leading-relaxed text-muted">{item.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-muted">
            {content.related.text}{" "}
            <Link prefetch={false} href={content.related.href} className="font-semibold link-underline">
              {content.related.label}
            </Link>
            .
          </p>
        </div>
      </section>

      <CtaBand />
    </>
  );
}

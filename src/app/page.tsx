import type { Metadata } from "next";
import Link from "next/link";
import { ProfileCard } from "@/components/ProfileCard";
import { ProjectVisual } from "@/components/ProjectVisual";
import { Reveal } from "@/components/Reveal";
import { CtaBand } from "@/components/SectionHeading";
import { principles, projects, siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: {
    absolute: `${siteConfig.name} | ${siteConfig.title}`,
  },
  description: siteConfig.description,
  alternates: { canonical: "/" },
};

const engagementSteps = [
  {
    title: "Discover & frame",
    text: "Goals, constraints, risks, and success metrics. We align on what “done” means before estimating.",
  },
  {
    title: "Architect the slice",
    text: "Boundaries, data, auth, and integration points for the first vertical slice — documented simply.",
  },
  {
    title: "Build, review, ship",
    text: "Weekly demos, clean PRs, measurable progress. Adjust the plan with evidence, not guesswork.",
  },
] as const;

const techMarquee = [
  "Clean Architecture",
  "ASP.NET Core",
  "Angular",
  "Azure",
  "SQL Server",
  "Cosmos DB",
  "Redis",
  "IdentityServer",
  "Docker",
  "RabbitMQ",
  "SignalR",
  "CI/CD",
];

export default function HomePage() {
  const featured = projects.slice(0, 3);

  return (
    <>
      <section className="relative">
        <div className="container-narrow grid items-center gap-10 px-5 pb-14 pt-28 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12 lg:px-12 lg:pb-16 lg:pt-32">
          <div>
            <p className="eyebrow">{siteConfig.title}</p>
            <h1 className="mt-5 font-display text-[1.85rem] font-semibold leading-[1.18] tracking-tight text-ink sm:text-4xl lg:text-[3.15rem] lg:leading-[1.12]">
              I design and ship production systems on{" "}
              <span className="text-teal">.NET + Angular</span>.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              {siteConfig.tagline}
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/contact" className="btn-primary">
                {siteConfig.inquiryCta}
              </Link>
              <Link href="/work" className="btn-secondary">
                See selected work
              </Link>
            </div>
            <p className="mt-5 text-sm text-muted">
              Prefer WhatsApp?{" "}
              <a
                href={siteConfig.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-teal link-underline"
              >
                Message me
              </a>
              {" · "}
              <Link href="/blog" className="font-semibold text-teal link-underline">
                Read the blog
              </Link>
            </p>
          </div>

          <ProfileCard className="lg:justify-self-end" />
        </div>

        <div className="border-y border-slate-line bg-mist">
          <div className="container-narrow grid grid-cols-2 gap-6 px-5 py-8 sm:grid-cols-4 sm:px-8 lg:px-12">
            {[
              { label: "Shipping", value: "5+ years" },
              { label: "Domains", value: "Healthcare · SaaS" },
              { label: "Reply time", value: "1 business day" },
              { label: "Availability", value: "Contract · remote" },
            ].map((item) => (
              <div key={item.label} className="text-center sm:text-left">
                <p className="font-display text-lg font-semibold text-ink sm:text-xl">{item.value}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-teal">
                  {item.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="group relative overflow-hidden border-b border-slate-line bg-paper py-4">
          <div className="marquee-track flex w-max gap-10 whitespace-nowrap px-4 text-sm text-muted">
            {techMarquee.map((item) => (
              <span key={item} className="inline-flex items-center gap-10">
                <span className="font-medium text-ink-soft">{item}</span>
                <span className="text-cyan" aria-hidden>
                  ✦
                </span>
              </span>
            ))}
            <span className="inline-flex items-center gap-10" aria-hidden>
              {techMarquee.map((item) => (
                <span key={`dup-${item}`} className="inline-flex items-center gap-10">
                  <span className="font-medium text-ink-soft">{item}</span>
                  <span className="text-cyan">✦</span>
                </span>
              ))}
            </span>
          </div>
        </div>
      </section>

      <section className="section-pad">
        <div className="container-narrow">
          <Reveal>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow">Selected work</p>
                <h2 className="mt-3 font-display text-3xl font-semibold text-ink sm:text-4xl">
                  Production systems with clear boundaries.
                </h2>
              </div>
              <Link href="/work" className="font-semibold text-teal link-underline">
                Full case notes →
              </Link>
            </div>
          </Reveal>

          <div className="mt-10 space-y-4">
            {featured.map((project, index) => (
              <Reveal key={project.slug} delayMs={index * 80}>
                <Link href={`/work/${project.slug}`} className="block">
                <article className="surface-hover grid gap-5 rounded-xl p-6 md:grid-cols-[0.9fr_1.4fr]">
                    <ProjectVisual project={project} />
                    <div>
                      <p className="eyebrow">{project.domain}</p>
                      <h3 className="mt-2 font-display text-2xl font-semibold text-ink">
                        {project.title}
                      </h3>
                      {project.confidential ? (
                        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          NDA — architecture patterns only
                        </p>
                      ) : null}
                      <p className="mt-3 text-muted">{project.summary}</p>
                      <p className="mt-3 text-sm text-ink-soft">{project.result}</p>
                      <p className="mt-3 text-xs text-muted">{project.stack.slice(0, 6).join(" · ")}</p>
                    </div>
                  </article>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section-pad !pt-4">
        <div className="container-narrow">
          <Reveal>
            <div className="max-w-2xl">
              <p className="eyebrow">How we work</p>
              <h2 className="mt-3 font-display text-3xl font-semibold text-ink sm:text-4xl text-balance">
                From discovery to production — without foggy retainers.
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-muted">
                For founders, CTOs, and product teams who need senior ownership on healthcare, SaaS,
                or marketplace systems — architecture, identity, and delivery that survives production.
              </p>
            </div>
          </Reveal>

          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {engagementSteps.map((step, index) => (
              <Reveal key={step.title} delayMs={index * 80}>
                <li className="h-full rounded-xl border border-slate-line bg-mist p-6">
                  <p className="text-sm font-semibold text-ink-soft">Phase {index + 1}</p>
                  <h3 className="mt-3 font-display text-xl font-semibold text-ink">{step.title}</h3>
                  <p className="mt-3 leading-relaxed text-muted">{step.text}</p>
                </li>
              </Reveal>
            ))}
          </ol>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {principles.map((item, index) => (
              <Reveal key={item.title} delayMs={index * 60}>
                <article className="h-full">
                  <h3 className="font-display text-lg font-semibold text-ink">{item.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted">{item.text}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}

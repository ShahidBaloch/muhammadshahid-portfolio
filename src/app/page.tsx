import Link from "next/link";
import { ProfileCard } from "@/components/ProfileCard";
import { Reveal } from "@/components/Reveal";
import { CtaBand } from "@/components/SectionHeading";
import { TypeRotate } from "@/components/TypeRotate";
import { principles, projects, siteConfig } from "@/lib/site";

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
      <section className="relative overflow-hidden">
        <div className="orb left-[-8%] top-[5%] h-64 w-64 bg-teal/25" aria-hidden />
        <div
          className="orb right-[-6%] top-[30%] h-72 w-72 bg-[#051d1f]/10"
          style={{ animationDelay: "2s" }}
          aria-hidden
        />

        <div className="container-narrow relative grid items-center gap-10 px-5 pb-14 pt-28 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12 lg:px-12 lg:pb-16 lg:pt-32">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal">
              {siteConfig.title}
            </p>
            <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.12] tracking-tight text-ink sm:text-5xl lg:text-[3.25rem] text-balance">
              I design and ship{" "}
              <span className="text-gradient">
                <TypeRotate />
              </span>{" "}
              on .NET + Angular.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              {siteConfig.tagline}
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/contact" className="btn-primary">
                Book a discovery call
              </Link>
              <a
                href={siteConfig.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
              >
                WhatsApp
              </a>
              <Link href="/work" className="btn-secondary">
                See selected work
              </Link>
            </div>
            <p className="mt-5 text-sm text-muted">
              Read the{" "}
              <Link href="/blog" className="font-semibold text-teal link-underline">
                blog
              </Link>{" "}
              for ASP.NET Core, Angular, and architecture notes.
            </p>
          </div>

          <ProfileCard className="float-y lg:justify-self-end" />
        </div>

        <div className="border-y border-slate-line bg-mist">
          <div className="container-narrow grid grid-cols-2 gap-6 px-5 py-8 sm:grid-cols-4 sm:px-8 lg:px-12">
            {[
              { label: "Experience", value: "5+ years" },
              { label: "Domains", value: "Healthcare · SaaS" },
              { label: "Core stack", value: ".NET + Angular" },
              { label: "Availability", value: "Remote-ready" },
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

        <div className="relative overflow-hidden border-b border-slate-line bg-paper py-4">
          <div className="marquee-track flex w-max gap-10 whitespace-nowrap px-4 text-sm text-muted">
            {[...techMarquee, ...techMarquee].map((item, i) => (
              <span key={`${item}-${i}`} className="inline-flex items-center gap-10">
                <span className="font-medium text-ink-soft">{item}</span>
                <span className="text-teal">✦</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="section-pad">
        <div className="container-narrow">
          <Reveal>
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal">
                Who this is for
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold text-ink sm:text-4xl text-balance">
                Product leaders who need senior ownership — not ticket-only coding.
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-muted">
                I partner with founders, CTOs, and product teams when the problem is bigger than a
                single screen: architecture choices, identity, performance, and delivery that
                survives production.
              </p>
            </div>
          </Reveal>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                title: "Healthcare & regulated SaaS",
                text: "Provider portals, fee schedules, onboarding, and secure multi-tenant flows with audit-minded design.",
              },
              {
                title: "Platform & marketplace builds",
                text: "Service boundaries, gateways, async messaging, and storefront/API foundations that can grow.",
              },
              {
                title: "Modernization & recovery",
                text: "Untangle brittle .NET/Angular systems: auth debt, slow SQL, unclear modules, missing CI/CD.",
              },
            ].map((item, index) => (
              <Reveal key={item.title} delayMs={index * 100}>
                <article className="surface-hover h-full rounded-2xl p-6">
                  <h3 className="font-display text-xl font-semibold text-ink">{item.title}</h3>
                  <p className="mt-3 leading-relaxed text-muted">{item.text}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section-pad !pt-4">
        <div className="container-narrow">
          <Reveal>
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal">
                How I decide
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold text-ink sm:text-4xl text-balance">
                Architecture principles I bring into every engagement.
              </h2>
            </div>
          </Reveal>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {principles.map((item, index) => (
              <Reveal key={item.title} delayMs={index * 80}>
                <article className="surface-hover h-full rounded-2xl p-6">
                  <h3 className="font-display text-xl font-semibold text-ink">{item.title}</h3>
                  <p className="mt-3 leading-relaxed text-muted">{item.text}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section-pad">
        <div className="container-narrow">
          <Reveal>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal">
                  Selected work
                </p>
                <h2 className="mt-3 font-display text-3xl font-semibold text-ink sm:text-4xl">
                  Systems, not just screenshots.
                </h2>
              </div>
              <Link href="/work" className="font-semibold text-teal link-underline">
                Full case notes →
              </Link>
            </div>
          </Reveal>

          <div className="mt-10 space-y-4">
            {featured.map((project, index) => (
              <Reveal key={project.slug} delayMs={index * 100}>
                <article className="surface-hover grid gap-4 rounded-2xl p-6 md:grid-cols-[1fr_2fr]">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal">
                      {project.domain}
                    </p>
                    <h3 className="mt-2 font-display text-2xl font-semibold text-ink">
                      {project.title}
                    </h3>
                  </div>
                  <div>
                    <p className="text-muted">{project.summary}</p>
                    <p className="mt-3 text-sm text-ink-soft">{project.result}</p>
                    <p className="mt-3 text-xs text-muted">
                      {project.stack.slice(0, 6).join(" · ")}
                    </p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section-pad !pt-4">
        <div className="container-narrow">
          <Reveal>
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal">
                Engagement model
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold text-ink sm:text-4xl text-balance">
                From discovery to production — without foggy retainers.
              </h2>
            </div>
          </Reveal>

          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {engagementSteps.map((step, index) => (
              <Reveal key={step.title} delayMs={index * 100}>
                <li className="surface-hover h-full rounded-2xl p-6">
                  <p className="text-sm font-semibold text-teal">Phase {index + 1}</p>
                  <h3 className="mt-3 font-display text-xl font-semibold text-ink">{step.title}</h3>
                  <p className="mt-3 leading-relaxed text-muted">{step.text}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <CtaBand />
    </>
  );
}

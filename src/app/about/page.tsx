import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, SectionHeading } from "@/components/SectionHeading";
import { experience, siteConfig, skills } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "Muhammad Shahid is a senior .NET + Angular engineer with 5+ years designing and shipping healthcare, SaaS, and eCommerce systems.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <>
      <section className="section-pad pt-28 sm:pt-32">
        <div className="container-narrow grid gap-12 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <SectionHeading
              eyebrow="About"
              title="Senior engineer with a solution mindset."
              description="I care about boundaries, security, data, and delivery — the decisions that keep products healthy after launch."
            />
            <div className="mt-8 space-y-5 text-lg leading-relaxed text-muted">
              <p>
                For 5+ years I&apos;ve built and evolved .NET + Angular systems across healthcare,
                supply chain/EDI, SaaS, and eCommerce. My strength is connecting product intent to
                a technical shape that teams can maintain: APIs, identity, data, and frontends that
                fit together.
              </p>
              <p>
                Recent work includes production healthcare delivery at Universal Digital Health Care
                / Optikode and product engineering at Systems Limited — provider operations, fee
                schedules, EDI conversion, Azure storage, and Cosmos modeling.
              </p>
              <p>
                I use AI coding tools to move faster on implementation, while keeping architecture
                reviews, security, and business outcomes as the source of truth.
              </p>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={siteConfig.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
              >
                LinkedIn
              </a>
              <a
                href={siteConfig.github}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
              >
                GitHub
              </a>
              <Link href="/contact" className="btn-primary">
                Contact
              </Link>
            </div>
          </div>

          <aside className="surface space-y-8 rounded-2xl p-6 sm:p-8">
            <SkillBlock title="Architecture" items={skills.architecture} />
            <SkillBlock title="Backend" items={skills.backend} />
            <SkillBlock title="Frontend" items={skills.frontend} />
            <SkillBlock title="Data & cloud" items={skills.dataCloud} />
            <SkillBlock title="Security" items={skills.security} />
          </aside>
        </div>

        <div className="container-narrow mt-16">
          <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Experience</h2>
          <ol className="mt-8 space-y-0 border-t border-slate-line">
            {experience.map((job) => (
              <li
                key={`${job.company}-${job.period}`}
                className="grid gap-3 border-b border-slate-line py-8 md:grid-cols-[1fr_1.4fr]"
              >
                <div>
                  <p className="text-sm text-teal">{job.period}</p>
                  <h3 className="mt-2 font-display text-xl font-semibold text-ink">{job.role}</h3>
                  <p className="mt-1 text-muted">{job.company}</p>
                </div>
                <ul className="space-y-2 text-muted">
                  {job.points.map((point) => (
                    <li key={point} className="leading-relaxed">
                      {point}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <CtaBand />
    </>
  );
}

function SkillBlock({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-teal">{title}</h3>
      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <li
            key={item}
            className="rounded border border-slate-line bg-paper px-2.5 py-1 text-xs text-ink-soft"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

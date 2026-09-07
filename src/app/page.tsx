import type { Metadata } from "next";
import Link from "next/link";
import { ProfileCard } from "@/components/ProfileCard";
import { ProjectVisual } from "@/components/ProjectVisual";
import { Reveal } from "@/components/Reveal";
import { CtaBand } from "@/components/SectionHeading";
import { PostDate } from "@/components/PostDate";
import { getHomepagePosts } from "@/lib/posts";
import { principles, projects, siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: {
    absolute: `${siteConfig.name} | ${siteConfig.title}`,
  },
  description:
    "Senior .NET + Angular engineer. Original ASP.NET Core, identity server, EF Core, and C# interview articles from healthcare and SaaS production work.",
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

const trustStats = [
  { label: "Shipping", value: "5+ years" },
  { label: "Domains", value: "Healthcare · SaaS" },
  { label: "Reply time", value: "1 business day" },
  { label: "Availability", value: "Contract · remote" },
] as const;

export default function HomePage() {
  const featured = projects.slice(0, 3);
  const homepagePosts = getHomepagePosts(4);

  return (
    <>
      <section className="hero-canvas relative" aria-labelledby="home-heading">
        <div className="container-narrow grid items-center gap-10 px-5 pb-14 pt-28 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12 lg:px-12 lg:pb-16 lg:pt-32">
          <div>
            <p className="eyebrow">{siteConfig.title}</p>
            <h1
              id="home-heading"
              className="mt-5 font-display text-[1.85rem] font-semibold leading-[1.18] tracking-tight text-ink sm:text-4xl lg:text-[3.15rem] lg:leading-[1.12]"
            >
              I design and ship production systems on{" "}
              <span className="text-teal">.NET + Angular</span>.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              {siteConfig.tagline}
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href="/contact" className="btn-primary w-full sm:w-auto">
                {siteConfig.inquiryCta}
              </Link>
              <Link href="/work" className="btn-secondary w-full sm:w-auto">
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
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              {" · "}
              <Link href="/services" className="font-semibold text-teal link-underline">
                What I take on
              </Link>
              {" · "}
              <Link href="/blog" className="font-semibold text-teal link-underline">
                Read the blog
              </Link>
            </p>
          </div>

          <ProfileCard className="lg:justify-self-end" />
        </div>

        <dl className="border-y border-slate-line bg-mist">
          <div className="container-narrow grid grid-cols-2 gap-6 px-5 py-8 sm:grid-cols-4 sm:px-8 lg:px-12">
            {trustStats.map((item) => (
              <div key={item.label} className="flex min-w-0 flex-col-reverse text-center sm:text-left">
                <dt className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  {item.label}
                </dt>
                <dd className="font-display text-base font-semibold text-ink sm:text-xl">
                  {item.value}
                </dd>
              </div>
            ))}
          </div>
        </dl>
      </section>

      <section className="section-pad" aria-labelledby="home-work-heading">
        <div className="container-narrow">
          <Reveal>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow">Selected work</p>
                <h2
                  id="home-work-heading"
                  className="mt-3 font-display text-3xl font-semibold text-ink sm:text-4xl"
                >
                  Production systems with clear boundaries.
                </h2>
              </div>
              <Link href="/work" className="font-semibold text-teal link-underline">
                Full case notes
                <span aria-hidden> →</span>
              </Link>
            </div>
          </Reveal>

          <div className="mt-10 space-y-4">
            {featured.map((project, index) => (
              <Reveal key={project.slug} delayMs={index * 80}>
                <article className="surface-hover grid gap-5 rounded-xl p-6 md:grid-cols-[0.9fr_1.4fr]">
                  <ProjectVisual project={project} />
                  <div>
                    <p className="eyebrow">{project.domain}</p>
                    <h3 className="mt-2 font-display text-2xl font-semibold text-ink">
                      <Link href={`/work/${project.slug}`} className="hover:text-teal">
                        {project.title}
                      </Link>
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
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section-pad !pt-0" aria-labelledby="home-blog-heading">
        <div className="container-narrow">
          <Reveal>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow">Blog</p>
                <h2
                  id="home-blog-heading"
                  className="mt-3 font-display text-3xl font-semibold text-ink sm:text-4xl"
                >
                  Original .NET and Angular notes from production.
                </h2>
                <p className="mt-3 max-w-2xl text-muted">
                  Practical articles on ASP.NET Core, IdentityServer, EF Core, and C# interviews —
                  written from healthcare, SaaS, and marketplace work.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <Link
                  href="/learning/interview-questions"
                  className="font-semibold text-teal link-underline"
                >
                  Interview questions
                  <span aria-hidden> →</span>
                </Link>
                <Link href="/blog" className="font-semibold text-teal link-underline">
                  All articles
                  <span aria-hidden> →</span>
                </Link>
              </div>
            </div>
          </Reveal>

          <div className="mt-10 divide-y divide-slate-line border-y border-slate-line">
            {homepagePosts.map((post) => (
              <article key={post.slug} className="py-6">
                <PostDate date={post.date} updated={post.updated} readingTime={post.readingTime} />
                <h3 className="mt-2 font-display text-xl font-semibold text-ink sm:text-2xl">
                  <Link href={`/blog/${post.slug}`} className="hover:text-teal">
                    {post.title}
                  </Link>
                </h3>
                <p className="mt-2 max-w-2xl text-muted">{post.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-pad !pt-4" aria-labelledby="home-process-heading">
        <div className="container-narrow">
          <Reveal>
            <div className="max-w-2xl">
              <p className="eyebrow">How we work</p>
              <h2
                id="home-process-heading"
                className="mt-3 font-display text-3xl font-semibold text-ink sm:text-4xl text-balance"
              >
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
              <li key={step.title} className="h-full">
                <Reveal className="h-full" delayMs={index * 80}>
                  <div className="h-full rounded-xl border border-slate-line bg-mist p-6">
                    <p className="text-sm font-semibold text-ink-soft">Phase {index + 1}</p>
                    <h3 className="mt-3 font-display text-xl font-semibold text-ink">{step.title}</h3>
                    <p className="mt-3 leading-relaxed text-muted">{step.text}</p>
                  </div>
                </Reveal>
              </li>
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

import type { Metadata } from "next";
import Link from "next/link";
import { PrintButton } from "@/components/PrintButton";
import { experience, siteConfig, skills } from "@/lib/site";

export const metadata: Metadata = {
  title: "Resume",
  description: `Resume for ${siteConfig.name} — senior .NET + Angular engineer.`,
  alternates: { canonical: "/resume" },
  robots: { index: false, follow: true },
};

export default function ResumePage() {
  return (
    <section className="section-pad pt-28 sm:pt-32">
      <div className="container-narrow max-w-3xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow print:hidden">Resume</p>
            <h1 className="mt-3 font-display text-3xl font-semibold text-ink sm:text-4xl">
              {siteConfig.name}
            </h1>
            <p className="mt-2 text-muted">{siteConfig.title}</p>
          </div>
          <PrintButton />
        </div>

        <p className="mt-6 leading-relaxed text-muted print:mt-0">
          {siteConfig.description}
        </p>
        <p className="mt-3 text-sm text-ink-soft">
          {siteConfig.location} · {siteConfig.email} · {siteConfig.phone}
        </p>

        <h2 className="mt-10 font-display text-2xl font-semibold text-ink">Experience</h2>
        <ol className="mt-6 space-y-8">
          {experience.map((job) => (
            <li key={`${job.company}-${job.period}`}>
              <p className="text-sm text-muted">{job.period}</p>
              <h3 className="mt-1 font-display text-xl font-semibold text-ink">{job.role}</h3>
              <p className="text-muted">{job.company}</p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-muted">
                {job.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>

        <h2 className="mt-10 font-display text-2xl font-semibold text-ink">Skills</h2>
        <div className="mt-4 space-y-3 text-sm text-muted">
          <p>
            <span className="font-semibold text-ink">Architecture:</span> {skills.architecture.join(", ")}
          </p>
          <p>
            <span className="font-semibold text-ink">Backend:</span> {skills.backend.join(", ")}
          </p>
          <p>
            <span className="font-semibold text-ink">Frontend:</span> {skills.frontend.join(", ")}
          </p>
          <p>
            <span className="font-semibold text-ink">Data &amp; cloud:</span> {skills.dataCloud.join(", ")}
          </p>
          <p>
            <span className="font-semibold text-ink">Security:</span> {skills.security.join(", ")}
          </p>
        </div>

        <p className="mt-10 print:hidden">
          <Link href="/about" className="font-semibold text-teal link-underline">
            ← Back to about
          </Link>
        </p>
      </div>
    </section>
  );
}

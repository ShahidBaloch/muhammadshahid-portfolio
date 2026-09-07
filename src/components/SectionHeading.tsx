import Link from "next/link";
import { siteConfig } from "@/lib/site";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  /** Use 1 for page titles (SEO). Default 2 for in-page sections. */
  level?: 1 | 2;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  level = 2,
}: SectionHeadingProps) {
  const titleClassName =
    "mt-3 font-display text-[1.75rem] font-semibold tracking-tight text-ink sm:text-4xl text-balance";

  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      {level === 1 ? (
        <h1 className={titleClassName}>{title}</h1>
      ) : (
        <h2 className={titleClassName}>{title}</h2>
      )}
      {description ? (
        <p className="mt-4 text-lg leading-relaxed text-muted">{description}</p>
      ) : null}
    </div>
  );
}

export function CtaBand() {
  return (
    <section className="section-pad !pt-8" aria-labelledby="cta-heading">
      <div className="container-narrow relative overflow-hidden rounded-xl border border-slate-line bg-mist px-6 py-12 sm:px-10 sm:py-14">
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-teal/20 blur-3xl"
          aria-hidden
        />
        <div className="relative max-w-2xl">
          <p className="eyebrow">Next step</p>
          <h2
            id="cta-heading"
            className="mt-3 font-display text-3xl font-semibold text-ink sm:text-4xl text-balance"
          >
            Need a senior .NET + Angular partner for the next release?
          </h2>
          <p className="mt-4 text-lg text-muted">
            Share the problem, constraints, and timeline. I&apos;ll come back with a clear
            technical approach and next step — usually within one business day.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href="/contact" className="btn-primary w-full sm:w-auto">
              {siteConfig.inquiryCta}
            </Link>
            <a
              href={siteConfig.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary w-full sm:w-auto"
            >
              WhatsApp
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

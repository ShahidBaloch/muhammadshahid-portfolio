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
    <section className="section-pad !pt-8">
      <div className="container-narrow rounded-xl bg-navy px-6 py-12 text-white sm:px-10 sm:py-14">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foam">Next step</p>
          <h2 className="mt-3 font-display text-3xl font-semibold text-white sm:text-4xl text-balance">
            Need a senior .NET + Angular partner for the next release?
          </h2>
          <p className="mt-4 text-lg text-white/85">
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
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-white/45 px-5 py-3 text-sm font-semibold text-white transition hover:border-foam hover:text-foam sm:w-auto"
            >
              WhatsApp
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

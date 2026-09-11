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
  const titleClassName = level === 1 ? "heading-page mt-2" : "heading-section mt-2";

  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      {level === 1 ? (
        <h1 className={titleClassName}>{title}</h1>
      ) : (
        <h2 className={titleClassName}>{title}</h2>
      )}
      {description ? (
        <p className="mt-3 text-base leading-relaxed text-muted sm:text-lg">{description}</p>
      ) : null}
    </div>
  );
}

export function CtaBand() {
  return (
    <section className="section-pad !pt-0 max-sm:!px-0" aria-labelledby="cta-heading">
      <div className="card-cta container-narrow rounded-none px-5 py-5 sm:rounded-xl sm:px-7 sm:py-6">
        <div className="relative grid gap-5 lg:grid-cols-[1.25fr_auto] lg:items-center lg:gap-8">
          <div className="min-w-0">
            <p className="eyebrow">Next step</p>
            <h2 id="cta-heading" className="heading-section mt-1.5 text-balance">
              Need a senior .NET + Angular partner for the next release?
            </h2>
            <p className="mt-2.5 text-base leading-snug text-muted sm:text-lg">
              Share the problem, constraints, and timeline. I&apos;ll come back with a clear
              technical approach and next step — usually within one business day.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:min-w-[15rem] lg:flex-col">
            <Link href="/contact" className="btn-primary w-full sm:w-auto lg:w-full">
              {siteConfig.inquiryCta}
            </Link>
            <a
              href={siteConfig.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary w-full sm:w-auto lg:w-full"
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

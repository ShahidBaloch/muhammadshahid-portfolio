import Link from "next/link";
import { siteConfig } from "@/lib/site";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: SectionHeadingProps) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow ? (
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal">{eyebrow}</p>
      ) : null}
      <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl text-balance">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-lg leading-relaxed text-muted">{description}</p>
      ) : null}
    </div>
  );
}

export function CtaBand() {
  return (
    <section className="section-pad !pt-8">
      <div className="container-narrow relative overflow-hidden rounded-2xl border border-teal/25 bg-navy px-6 py-12 text-white sm:px-10 sm:py-14">
        <div
          className="orb right-[-10%] top-[-30%] h-56 w-56 bg-teal/30"
          aria-hidden
        />
        <div className="relative max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-bright">Next step</p>
          <h2 className="mt-3 font-display text-3xl font-semibold text-white sm:text-4xl text-balance">
            Need a senior .NET + Angular partner for the next release?
          </h2>
          <p className="mt-4 text-lg text-white/75">
            Share the problem, constraints, and timeline. I&apos;ll come back with a clear
            technical approach and next step — usually within one business day.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/contact" className="btn-primary">
              Book a discovery call
            </Link>
            <a
              href={siteConfig.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/30 bg-transparent px-5 py-3 text-sm font-semibold text-white transition hover:border-teal-bright hover:text-teal-bright"
            >
              WhatsApp
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

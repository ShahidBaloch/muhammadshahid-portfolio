import type { Metadata } from "next";
import { CtaBand, SectionHeading } from "@/components/SectionHeading";
import { services } from "@/lib/site";

export const metadata: Metadata = {
  title: "Hire a Senior .NET + Angular Engineer",
  description:
    "Freelance and contract .NET + Angular engineering for healthcare, SaaS, and eCommerce teams — APIs, Angular SPAs, identity/SSO, Azure, and production delivery.",
  alternates: { canonical: "/services" },
};

export default function ServicesPage() {
  return (
    <>
      <section className="section-pad pt-28 sm:pt-32">
        <div className="container-narrow">
          <SectionHeading
            eyebrow="Services"
            title="How I help teams ship the right system."
            description="Freelance and contract engagements for product teams that need senior .NET + Angular ownership — healthcare, SaaS, and marketplace systems, remote-friendly from Lahore."
            level={1}
          />

          <h2 className="mt-14 font-display text-2xl font-semibold text-ink">What I take on</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {services.map((service) => (
              <article key={service.title} className="surface-hover rounded-xl p-6 sm:p-8">
                <h3 className="font-display text-2xl font-semibold text-ink">{service.title}</h3>
                <p className="mt-3 leading-relaxed text-muted">{service.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <CtaBand />
    </>
  );
}

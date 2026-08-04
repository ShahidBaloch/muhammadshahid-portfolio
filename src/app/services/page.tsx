import type { Metadata } from "next";
import { CtaBand, SectionHeading } from "@/components/SectionHeading";
import { services } from "@/lib/site";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Solution design, ASP.NET Core APIs, Angular SPAs, identity/SSO, Azure data, and CI/CD delivery with Muhammad Shahid.",
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
            description="Engagements span discovery and architecture through implementation — for product teams that need senior .NET + Angular ownership."
            level={1}
          />

          <div className="mt-14 grid gap-6 sm:grid-cols-2">
            {services.map((service) => (
              <article key={service.title} className="surface-hover rounded-2xl p-6 sm:p-8">
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

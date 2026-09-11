import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";
import { SectionHeading } from "@/components/SectionHeading";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact Muhammad Shahid",
  description:
    "Contact Muhammad Shahid for .NET + Angular freelance and contract work. Email, WhatsApp, LinkedIn, or project inquiry form.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <section className="section-pad page-top">
      <div className="container-narrow grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <SectionHeading
            eyebrow="Contact"
            title="Contact Muhammad Shahid"
            description="Share the problem, constraints, and timeline. I typically reply within one business day with a clear next step."
            level={1}
          />

          <ul className="mt-6 space-y-4 text-ink-soft">
            <li>
              <p className="eyebrow">Email</p>
              <a
                href={`mailto:${siteConfig.email}`}
                className="mt-1 inline-block break-all font-medium link-underline"
              >
                {siteConfig.email}
              </a>
            </li>
            <li>
              <p className="eyebrow">WhatsApp</p>
              <a
                href={siteConfig.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block font-medium link-underline"
              >
                {siteConfig.phone}
                <span className="sr-only"> (WhatsApp, opens in a new tab)</span>
              </a>
            </li>
            <li>
              <p className="eyebrow">LinkedIn</p>
              <a
                href={siteConfig.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block font-medium link-underline"
              >
                muhammad-shahid
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
            <li>
              <p className="eyebrow">Location</p>
              <address className="mt-1 not-italic font-medium text-ink">{siteConfig.location}</address>
            </li>
          </ul>
        </div>

        <div className="surface rounded-xl p-6 sm:p-8">
          <h2 id="project-inquiry" className="heading-subsection">
            Project inquiry
          </h2>
          <p className="mt-2 text-sm text-muted">
            Prefer email or WhatsApp? Use the links on the left — I typically reply within one
            business day.
          </p>
          <div className="mt-6">
            <ContactForm />
          </div>
        </div>
      </div>
    </section>
  );
}

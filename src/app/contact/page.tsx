import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";
import { SectionHeading } from "@/components/SectionHeading";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact Muhammad Shahid for .NET + Angular freelance and contract work. Email, WhatsApp, LinkedIn, or project inquiry form.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <section className="section-pad pt-28 sm:pt-32">
      <div className="container-narrow grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <SectionHeading
            eyebrow="Contact"
            title="Let's talk about your project."
            description="Share the problem, constraints, and timeline. I typically reply within one business day with a clear next step."
            level={1}
          />

          <ul className="mt-10 space-y-5 text-ink-soft">
            <li>
              <p className="font-mono text-xs text-teal">Email</p>
              <a
                href={`mailto:${siteConfig.email}`}
                className="mt-1 inline-block font-medium text-teal link-underline"
              >
                {siteConfig.email}
              </a>
            </li>
            <li>
              <p className="font-mono text-xs text-teal">WhatsApp</p>
              <a
                href={siteConfig.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block font-medium text-teal link-underline"
              >
                {siteConfig.phone}
              </a>
            </li>
            <li>
              <p className="font-mono text-xs text-teal">LinkedIn</p>
              <a
                href={siteConfig.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block font-medium text-teal link-underline"
              >
                muhammad-shahid
              </a>
            </li>
            <li>
              <p className="font-mono text-xs text-teal">Location</p>
              <p className="mt-1 font-medium text-ink">{siteConfig.location}</p>
            </li>
          </ul>
        </div>

        <div className="surface rounded p-6 sm:p-8">
          <h2 className="font-display text-xl font-semibold text-[inherit]">Project inquiry</h2>
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

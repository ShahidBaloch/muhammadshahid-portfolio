import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: `Terms of Use for ${siteConfig.name}'s website at ${siteConfig.url}.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <section className="section-pad pt-28 sm:pt-32">
      <div className="container-narrow max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-teal">Legal</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Terms of Use
        </h1>
        <p className="mt-4 text-muted">Last updated: August 4, 2026</p>

        <div className="prose prose-lg mt-10 max-w-none prose-headings:font-display prose-headings:tracking-tight prose-headings:text-ink prose-p:text-muted prose-li:text-muted prose-a:text-teal prose-strong:text-ink">
          <p>
            By accessing {siteConfig.url} (the &quot;Site&quot;), you agree to these Terms of Use.
            If you do not agree, please do not use the Site.
          </p>

          <h2>Purpose of the Site</h2>
          <p>
            The Site showcases professional work, services, and articles by {siteConfig.name}.
            Content is provided for informational and marketing purposes and does not create a
            client relationship unless we agree in writing.
          </p>

          <h2>Intellectual property</h2>
          <p>
            Unless otherwise stated, text, design, logos, and original code samples on the Site
            belong to {siteConfig.name}. You may link to public pages and quote short excerpts with
            attribution. Do not copy full articles or present Site content as your own.
          </p>

          <h2>Blog content</h2>
          <p>
            Tutorials and opinions reflect my experience at the time of writing. Technology changes
            quickly; verify approaches against current documentation before using them in
            production. Content is provided &quot;as is&quot; without warranties.
          </p>

          <h2>Freelance and consulting inquiries</h2>
          <p>
            Sending a message through the{" "}
            <Link href="/contact">contact form</Link> is an inquiry, not a binding contract. Project
            scope, fees, and timelines are agreed separately.
          </p>

          <h2>Third-party links and ads</h2>
          <p>
            The Site may link to GitHub, LinkedIn, documentation, or other third-party sites. I am
            not responsible for their content or policies. If advertising is enabled (for example
            Google AdSense), ads are served by third parties under their own terms.
          </p>

          <h2>Acceptable use</h2>
          <p>
            Do not misuse the Site: no scraping that harms availability, no spam via the contact
            form, and no attempts to compromise security.
          </p>

          <h2>Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, {siteConfig.name} is not liable for indirect,
            incidental, or consequential damages arising from use of the Site or reliance on its
            content.
          </p>

          <h2>Changes</h2>
          <p>
            These terms may be updated periodically. Continued use of the Site after changes means
            you accept the revised terms.
          </p>

          <h2>Contact</h2>
          <p>
            Questions: <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>.
          </p>
        </div>
      </div>
    </section>
  );
}

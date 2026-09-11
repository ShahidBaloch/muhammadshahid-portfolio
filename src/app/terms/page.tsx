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
    <section className="reading-page">
      <div className="container-narrow reading-surface content-width">
        <p className="eyebrow">Legal</p>
        <h1 className="heading-page mt-3">
          Terms of Use
        </h1>
        <p className="mt-4 text-muted">Last updated: September 7, 2026</p>

        <div className="prose-site prose-lg mt-6">
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

          <h2>Third-party links</h2>
          <p>
            The Site may link to GitHub, LinkedIn, documentation, or other third-party sites. I am
            not responsible for their content or policies.
          </p>

          <h2>Advertising</h2>
          <p>
            The Site may display third-party advertisements, including Google AdSense. Advertisers
            and their partners may use cookies and similar technologies as described in the{" "}
            <Link href="/privacy">Privacy Policy</Link>. Ads are provided by third parties; I do
            not control every ad you see and I am not responsible for advertiser websites or
            offers.
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

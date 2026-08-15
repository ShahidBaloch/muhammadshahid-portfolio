import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Disclaimer",
  description: `Content disclaimer for ${siteConfig.name}'s website.`,
  alternates: { canonical: "/disclaimer" },
};

export default function DisclaimerPage() {
  return (
    <section className="section-pad pt-28 sm:pt-32">
      <div className="container-narrow max-w-3xl">
        <p className="eyebrow">Legal</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Disclaimer
        </h1>
        <p className="mt-4 text-muted">Last updated: August 4, 2026</p>

        <div className="prose prose-lg mt-10 max-w-none prose-headings:font-display prose-headings:tracking-tight prose-headings:text-ink prose-p:text-muted prose-li:text-muted prose-a:text-teal prose-strong:text-ink">
          <p>
            The information on {siteConfig.url} is published by {siteConfig.name} for educational
            and professional purposes. By using this Site, you acknowledge the points below.
          </p>

          <h2>No professional warranty</h2>
          <p>
            Articles, code samples, and architecture notes reflect my experience at the time of
            writing. They are not a substitute for project-specific architecture review, security
            assessment, or legal advice. Always validate approaches against current framework
            documentation and your own requirements before production use.
          </p>

          <h2>Original content</h2>
          <p>
            Blog posts on this Site are written from my own work on .NET, Angular, Azure, and
            related delivery. Third-party trademarks (Microsoft, Google, and others) belong to
            their owners and are used only for identification.
          </p>

          <h2>External links</h2>
          <p>
            Links to GitHub repositories, documentation, or other websites are provided for
            convenience. I am not responsible for the content, availability, or policies of
            external sites.
          </p>

          <h2>Earnings and results</h2>
          <p>
            Any mention of freelance work, delivery outcomes, or monetization is based on my
            experience and is not a guarantee of similar results for readers.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about this disclaimer:{" "}
            <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a> or the{" "}
            <Link href="/contact">contact page</Link>.
          </p>
        </div>
      </div>
    </section>
  );
}

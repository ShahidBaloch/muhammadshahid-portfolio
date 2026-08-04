import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `Privacy Policy for ${siteConfig.name} (${siteConfig.url}). How personal data, cookies, and advertising are handled.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <section className="section-pad pt-28 sm:pt-32">
      <div className="container-narrow max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-teal">Legal</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Privacy Policy
        </h1>
        <p className="mt-4 text-muted">Last updated: August 4, 2026</p>

        <div className="prose prose-lg mt-10 max-w-none prose-headings:font-display prose-headings:tracking-tight prose-headings:text-ink prose-p:text-muted prose-li:text-muted prose-a:text-teal prose-strong:text-ink">
          <p>
            This Privacy Policy explains how {siteConfig.name} (&quot;I&quot;, &quot;me&quot;, or
            &quot;the Site&quot;) collects, uses, and protects information when you visit{" "}
            <a href={siteConfig.url}>{siteConfig.url}</a>.
          </p>

          <h2>Information I collect</h2>
          <ul>
            <li>
              <strong>Contact details you submit</strong> — name, email, and message content when
              you use the contact form or email me directly.
            </li>
            <li>
              <strong>Usage data</strong> — pages viewed, approximate location, device/browser
              type, and referral source when analytics tools are enabled.
            </li>
            <li>
              <strong>Cookies and similar technologies</strong> — used for analytics and, if
              enabled, advertising (including Google AdSense).
            </li>
          </ul>

          <h2>How I use information</h2>
          <ul>
            <li>To respond to project inquiries and professional messages</li>
            <li>To operate, secure, and improve the Site</li>
            <li>To measure traffic and content performance</li>
            <li>To display ads if Google AdSense (or similar) is enabled</li>
          </ul>

          <h2>Contact form</h2>
          <p>
            Messages sent through the contact form are used only to reply to your inquiry. I do not
            sell your contact details.
          </p>

          <h2>Analytics</h2>
          <p>
            The Site may use Google Analytics (GA4) to understand traffic. Google may process data
            according to its own policies. You can learn more at{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Privacy Policy
            </a>
            .
          </p>

          <h2>Advertising (Google AdSense)</h2>
          <p>
            If AdSense is enabled on this Site, third-party vendors, including Google, use cookies
            to serve ads based on a user&apos;s prior visits to this Site and/or other sites on the
            Internet. Google&apos;s use of advertising cookies enables it and its partners to serve
            ads to users based on their visit to this Site and/or other sites on the Internet.
          </p>
          <p>
            Users may opt out of personalized advertising by visiting{" "}
            <a
              href="https://www.google.com/settings/ads"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Ads Settings
            </a>
            . Alternatively, you can opt out of a third-party vendor&apos;s use of cookies for
            personalized advertising by visiting{" "}
            <a href="https://www.aboutads.info" target="_blank" rel="noopener noreferrer">
              www.aboutads.info
            </a>
            .
          </p>

          <h2>Data sharing</h2>
          <p>
            I do not sell personal information. Limited data may be processed by providers that help
            run the Site (for example hosting, email delivery, analytics, and advertising
            partners).
          </p>

          <h2>Data retention</h2>
          <p>
            Contact messages are kept as long as needed to handle your request and related
            professional follow-up. Analytics records follow the retention settings of those tools.
          </p>

          <h2>Your choices</h2>
          <p>
            You may request access to or deletion of personal information you sent me by emailing{" "}
            <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>. You can also block
            cookies in your browser settings.
          </p>

          <h2>Children&apos;s privacy</h2>
          <p>
            The Site is not directed at children under 13, and I do not knowingly collect personal
            information from children.
          </p>

          <h2>Changes</h2>
          <p>
            I may update this policy from time to time. The &quot;Last updated&quot; date at the
            top will change when revisions are published.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about privacy:{" "}
            <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a> or use the{" "}
            <Link href="/contact">contact page</Link>.
          </p>
        </div>
      </div>
    </section>
  );
}

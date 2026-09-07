import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `Privacy Policy for ${siteConfig.name} (${siteConfig.url}). How personal data, cookies, analytics, and advertising are handled.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <section className="section-pad pt-28 sm:pt-32">
      <div className="container-narrow reading-surface max-w-3xl">
        <p className="eyebrow">Legal</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Privacy Policy
        </h1>
        <p className="mt-4 text-muted">Last updated: September 7, 2026</p>

        <div className="prose-site prose-lg mt-10">
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
              <strong>Cookies and similar technologies</strong> — used for analytics and, when
              ads are enabled, for advertising after you accept cookies.
            </li>
          </ul>

          <h2>How I use information</h2>
          <ul>
            <li>To respond to project inquiries and professional messages</li>
            <li>To operate, secure, and improve the Site</li>
            <li>To measure traffic and content performance</li>
            <li>To show relevant advertising if Google AdSense or similar partners are enabled</li>
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

          <h2>Advertising</h2>
          <p>
            The Site may use Google AdSense and related Google advertising services to display ads.
            Third-party vendors, including Google, use cookies and similar technologies to serve ads
            based on your prior visits to this Site or other sites. Google&apos;s use of advertising
            cookies enables it and its partners to serve ads based on your visit to this Site and/or
            other sites on the Internet.
          </p>
          <p>
            Advertising partners may collect or receive information such as cookie identifiers,
            approximate location, browser and device type, and pages viewed. This can include
            personalized ads when consent is granted, or non-personalized ads when it is not.
          </p>
          <p>
            You can learn how Google uses data from partner sites in{" "}
            <a
              href="https://policies.google.com/technologies/partner-sites"
              target="_blank"
              rel="noopener noreferrer"
            >
              How Google uses information from sites or apps that use our services
            </a>
            . You can opt out of personalized advertising by visiting{" "}
            <a
              href="https://www.google.com/settings/ads"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Ads Settings
            </a>{" "}
            or{" "}
            <a
              href="https://www.aboutads.info/choices/"
              target="_blank"
              rel="noopener noreferrer"
            >
              aboutads.info/choices
            </a>
            .
          </p>

          <h2>Data sharing</h2>
          <p>
            I do not sell personal information. Limited data may be processed by providers that help
            run the Site (for example hosting, email delivery, analytics, and advertising partners
            such as Google).
          </p>

          <h2>Data retention</h2>
          <p>
            Contact messages are kept as long as needed to handle your request and related
            professional follow-up. Analytics records follow the retention settings of those tools.
          </p>

          <h2>Your choices</h2>
          <p>
            You may request access to or deletion of personal information you sent me by emailing{" "}
            <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>. You can reject analytics
            and advertising cookies on the cookie banner, reopen Cookie settings from the footer at
            any time, or block cookies in your browser settings.
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

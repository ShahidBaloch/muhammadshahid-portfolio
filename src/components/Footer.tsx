import Link from "next/link";
import { CookieSettingsLink } from "@/components/CookieSettingsLink";
import { siteConfig } from "@/lib/site";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-line bg-navy text-muted">
      <div className="container-narrow section-pad !py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="font-display text-2xl font-semibold tracking-tight text-ink">
              {siteConfig.name}
            </p>
            <p className="mt-3 max-w-md text-muted">{siteConfig.title}</p>
            <address className="mt-4 text-sm text-muted not-italic">{siteConfig.location}</address>
          </div>

          <nav aria-label="Footer">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-kicker">Explore</p>
            <ul className="mt-4 space-y-2 text-sm text-ink-soft">
              <li>
                <Link href="/work" className="transition hover:text-teal">
                  Work
                </Link>
              </li>
              <li>
                <Link href="/services" className="transition hover:text-teal">
                  Services
                </Link>
              </li>
              <li>
                <Link href="/blog" className="transition hover:text-teal">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="/learning" className="transition hover:text-teal">
                  Blog topics
                </Link>
              </li>
              <li>
                <Link href="/about" className="transition hover:text-teal">
                  About
                </Link>
              </li>
              <li>
                <Link href="/contact" className="transition hover:text-teal">
                  Contact
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="Social">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-kicker">Connect</p>
            <ul className="mt-4 space-y-2 text-sm text-ink-soft">
              <li>
                <a
                  href={siteConfig.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition hover:text-teal"
                >
                  LinkedIn
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
              <li>
                <a
                  href={siteConfig.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition hover:text-teal"
                >
                  GitHub
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
              <li>
                <a href={`mailto:${siteConfig.email}`} className="break-all transition hover:text-teal">
                  {siteConfig.email}
                </a>
              </li>
              <li>
                <a
                  href={siteConfig.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition hover:text-teal"
                >
                  WhatsApp
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-slate-line pt-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {siteConfig.name}. All rights reserved.
          </p>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <Link href="/about" className="transition hover:text-teal">
              About
            </Link>
            <Link href="/contact" className="transition hover:text-teal">
              Contact
            </Link>
            <Link href="/privacy" className="transition hover:text-teal">
              Privacy
            </Link>
            <Link href="/terms" className="transition hover:text-teal">
              Terms
            </Link>
            <Link href="/disclaimer" className="transition hover:text-teal">
              Disclaimer
            </Link>
            <CookieSettingsLink className="transition hover:text-teal" />
            <span>{siteConfig.url.replace("https://", "")}</span>
          </nav>
        </div>
      </div>
    </footer>
  );
}

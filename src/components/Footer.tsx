import Link from "next/link";
import { CookieSettingsLink } from "@/components/CookieSettingsLink";
import { siteConfig } from "@/lib/site";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-700 bg-navy text-slate-400">
      <div className="container-narrow section-pad !py-10 sm:!py-12">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="font-display text-2xl font-bold tracking-tight text-white">
              {siteConfig.name}
            </p>
            <p className="mt-3 max-w-md text-slate-400">{siteConfig.title}</p>
            <address className="mt-4 text-sm text-slate-400 not-italic">{siteConfig.location}</address>
          </div>

          <nav aria-label="Footer">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Explore</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-300">
              <li>
                <Link href="/work" className="transition hover:text-link-bright">
                  Work
                </Link>
              </li>
              <li>
                <Link href="/services" className="transition hover:text-link-bright">
                  Services
                </Link>
              </li>
              <li>
                <Link href="/blog" className="transition hover:text-link-bright">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="/learning" className="transition hover:text-link-bright">
                  Blog topics
                </Link>
              </li>
              <li>
                <Link href="/about" className="transition hover:text-link-bright">
                  About
                </Link>
              </li>
              <li>
                <Link href="/contact" className="transition hover:text-link-bright">
                  Contact
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="Social">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Connect</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-300">
              <li>
                <a
                  href={siteConfig.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition hover:text-link-bright"
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
                  className="transition hover:text-link-bright"
                >
                  GitHub
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
              <li>
                <a href={`mailto:${siteConfig.email}`} className="break-all transition hover:text-link-bright">
                  {siteConfig.email}
                </a>
              </li>
              <li>
                <a
                  href={siteConfig.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition hover:text-link-bright"
                >
                  WhatsApp
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-slate-700 pt-5 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {siteConfig.name}. All rights reserved.
          </p>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <Link href="/about" className="transition hover:text-link-bright">
              About
            </Link>
            <Link href="/contact" className="transition hover:text-link-bright">
              Contact
            </Link>
            <Link href="/privacy" className="transition hover:text-link-bright">
              Privacy
            </Link>
            <Link href="/terms" className="transition hover:text-link-bright">
              Terms
            </Link>
            <Link href="/disclaimer" className="transition hover:text-link-bright">
              Disclaimer
            </Link>
            <CookieSettingsLink className="transition hover:text-link-bright" />
            <span>{siteConfig.url.replace("https://", "")}</span>
          </nav>
        </div>
      </div>
    </footer>
  );
}

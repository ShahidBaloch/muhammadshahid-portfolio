import Link from "next/link";
import { siteConfig } from "@/lib/site";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-line bg-navy text-white">
      <div className="container-narrow section-pad !py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="font-display text-2xl font-semibold tracking-tight text-white">
              {siteConfig.name}
            </p>
            <p className="mt-3 max-w-md text-white/85">{siteConfig.title}</p>
            <p className="mt-4 text-sm text-white/85">{siteConfig.location}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foam">Explore</p>
            <ul className="mt-4 space-y-2 text-sm text-white/90">
              <li>
                <Link href="/work" className="hover:text-foam">
                  Work
                </Link>
              </li>
              <li>
                <Link href="/services" className="hover:text-foam">
                  Services
                </Link>
              </li>
              <li>
                <Link href="/blog" className="hover:text-foam">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="/learning" className="hover:text-foam">
                  Blog topics
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-foam">
                  About
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-foam">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foam">Connect</p>
            <ul className="mt-4 space-y-2 text-sm text-white/90">
              <li>
                <a
                  href={siteConfig.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foam"
                >
                  LinkedIn
                </a>
              </li>
              <li>
                <a
                  href={siteConfig.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foam"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a href={`mailto:${siteConfig.email}`} className="break-all hover:text-foam">
                  {siteConfig.email}
                </a>
              </li>
              <li>
                <a
                  href={siteConfig.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foam"
                >
                  WhatsApp
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/20 pt-6 text-sm text-white/85 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {siteConfig.name}. All rights reserved.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <Link href="/privacy" className="hover:text-foam">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foam">
              Terms
            </Link>
            <Link href="/disclaimer" className="hover:text-foam">
              Disclaimer
            </Link>
            <span>{siteConfig.url.replace("https://", "")}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

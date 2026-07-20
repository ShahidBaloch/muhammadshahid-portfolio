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
            <p className="mt-3 max-w-md text-white/70">{siteConfig.title}</p>
            <p className="mt-4 text-sm text-white/55">{siteConfig.location}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-bright">
              Explore
            </p>
            <ul className="mt-4 space-y-2 text-sm text-white/75">
              <li>
                <Link href="/work" className="hover:text-teal-bright">
                  Work
                </Link>
              </li>
              <li>
                <Link href="/services" className="hover:text-teal-bright">
                  Services
                </Link>
              </li>
              <li>
                <Link href="/blog" className="hover:text-teal-bright">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-teal-bright">
                  About
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-bright">
              Connect
            </p>
            <ul className="mt-4 space-y-2 text-sm text-white/75">
              <li>
                <a
                  href={siteConfig.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-teal-bright"
                >
                  LinkedIn
                </a>
              </li>
              <li>
                <a
                  href={siteConfig.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-teal-bright"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a href={`mailto:${siteConfig.email}`} className="hover:text-teal-bright">
                  {siteConfig.email}
                </a>
              </li>
              <li>
                <a
                  href={siteConfig.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-teal-bright"
                >
                  WhatsApp
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-sm text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {siteConfig.name}. All rights reserved.
          </p>
          <p className="text-xs">{siteConfig.url.replace("https://", "")}</p>
        </div>
      </div>
    </footer>
  );
}

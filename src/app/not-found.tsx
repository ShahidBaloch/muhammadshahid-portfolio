import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <section className="section-pad flex min-h-[70vh] items-center pt-28">
      <title>{`Page not found | ${siteConfig.name}`}</title>
      <meta name="robots" content="noindex, follow" />
      <div className="container-narrow max-w-xl">
        <p className="eyebrow">404</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-ink">Page not found</h1>
        <p className="mt-4 text-lg text-muted">
          That page does not exist. Head back home or browse work and blog posts.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="btn-primary">
            Home
          </Link>
          <Link href="/work" className="btn-secondary">
            Work
          </Link>
          <Link href="/blog" className="btn-secondary">
            Blog
          </Link>
        </div>
      </div>
    </section>
  );
}

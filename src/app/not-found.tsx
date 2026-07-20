import Link from "next/link";

export default function NotFound() {
  return (
    <section className="section-pad flex min-h-[70vh] items-center pt-28">
      <div className="container-narrow max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal">404</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-[inherit]">Page not found</h1>
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
        </div>
      </div>
    </section>
  );
}

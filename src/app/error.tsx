"use client";

import Link from "next/link";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="section-pad flex min-h-[70vh] items-center pt-28">
      <div className="container-narrow max-w-xl">
        <p className="eyebrow">Error</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-ink">Something went wrong</h1>
        <p className="mt-4 text-lg text-muted">
          The page failed to load. Try again, or head back home.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" className="btn-primary" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/" className="btn-secondary">
            Home
          </Link>
        </div>
      </div>
    </section>
  );
}

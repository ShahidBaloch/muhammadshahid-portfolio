import type { PostHeading } from "@/lib/headings";

export function OnThisPage({ headings }: { headings: PostHeading[] }) {
  if (headings.length < 4) return null;

  return (
    <nav
      className="card-panel mt-6 rounded-xl p-4 sm:p-5"
      aria-label="On this page"
    >
      <h2 className="heading-card text-sm font-bold uppercase tracking-[0.14em] text-kicker">
        On this page
      </h2>
      <ol className="mt-4 space-y-2 text-sm">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a href={`#${heading.id}`} className="link-underline">
              {heading.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

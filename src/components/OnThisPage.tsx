import type { PostHeading } from "@/lib/headings";

export function OnThisPage({ headings }: { headings: PostHeading[] }) {
  if (headings.length < 4) return null;

  return (
    <nav
      className="mt-8 rounded-xl border border-slate-line bg-mist p-5 sm:p-6"
      aria-label="On this page"
    >
      <p className="eyebrow">On this page</p>
      <ol className="mt-4 space-y-2 text-sm">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a href={`#${heading.id}`} className="text-teal link-underline">
              {heading.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

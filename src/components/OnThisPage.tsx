import type { PostOutlineSection } from "@/lib/headings";

function sectionCount(sections: PostOutlineSection[]): number {
  return sections.reduce((total, section) => total + 1 + section.children.length, 0);
}

export function OnThisPage({ sections }: { sections: PostOutlineSection[] }) {
  if (sections.length < 4) return null;

  const count = sectionCount(sections);
  const collapsible = count >= 12;

  const list = (
    <ol className="mt-4 space-y-2 text-sm">
      {sections.map((section) => (
        <li key={section.id}>
          <a href={`#${section.id}`} className="link-underline font-medium text-ink">
            {section.text}
          </a>
          {section.children.length > 0 ? (
            <ol className="mt-2 space-y-1.5 border-l border-slate-line pl-3">
              {section.children.map((child) => (
                <li key={child.id}>
                  <a href={`#${child.id}`} className="link-underline text-muted">
                    {child.text}
                  </a>
                </li>
              ))}
            </ol>
          ) : null}
        </li>
      ))}
    </ol>
  );

  return (
    <nav
      className="card-panel mt-6 rounded-xl p-4 sm:p-5 xl:sticky xl:top-28 xl:mt-0 xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto"
      aria-label="On this page"
      aria-describedby="on-this-page-hint"
    >
      {collapsible ? (
        <details className="group" open>
          <summary className="heading-card cursor-pointer list-none text-sm font-bold uppercase tracking-[0.14em] text-kicker [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              On this page
              <span className="rounded-full bg-mist px-2 py-0.5 text-[0.65rem] font-semibold normal-case tracking-normal text-muted">
                {count}
              </span>
            </span>
          </summary>
          <p id="on-this-page-hint" className="sr-only">
            {count} sections in this article. Expand or collapse this list. Each link jumps to a
            heading below.
          </p>
          {list}
        </details>
      ) : (
        <>
          <h2 className="heading-card text-sm font-bold uppercase tracking-[0.14em] text-kicker">
            On this page
          </h2>
          <p id="on-this-page-hint" className="sr-only">
            {count} sections in this article. Each link jumps to a heading below.
          </p>
          {list}
        </>
      )}
    </nav>
  );
}

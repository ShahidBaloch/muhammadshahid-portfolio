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
      <p id="on-this-page-hint" className="sr-only">
        {count} sections in this article.
        {collapsible ? " Expand or collapse this list on small screens." : ""} Each link jumps to a
        heading below.
      </p>
      {collapsible ? (
        <>
          <details className="group xl:hidden">
            <summary className="heading-card flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold uppercase tracking-[0.14em] text-kicker [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                On this page
                <span className="rounded-full bg-mist px-2 py-0.5 text-[0.65rem] font-semibold normal-case tracking-normal text-muted">
                  {count}
                </span>
              </span>
              <span aria-hidden className="text-base font-medium normal-case tracking-normal text-muted group-open:hidden">
                +
              </span>
              <span aria-hidden className="hidden text-base font-medium normal-case tracking-normal text-muted group-open:inline">
                –
              </span>
            </summary>
            {list}
          </details>
          <div className="hidden xl:block">
            <h2 className="heading-card text-sm font-bold uppercase tracking-[0.14em] text-kicker">
              On this page
              <span className="ml-2 rounded-full bg-mist px-2 py-0.5 text-[0.65rem] font-semibold normal-case tracking-normal text-muted">
                {count}
              </span>
            </h2>
            {list}
          </div>
        </>
      ) : (
        <>
          <h2 className="heading-card text-sm font-bold uppercase tracking-[0.14em] text-kicker">
            On this page
          </h2>
          {list}
        </>
      )}
    </nav>
  );
}

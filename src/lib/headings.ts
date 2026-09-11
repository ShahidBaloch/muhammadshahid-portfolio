export function slugifyHeading(value: string): string {
  return value
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function headingTextFromMarkdown(line: string): string {
  return line.replace(/`/g, "").replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
}

export type PostHeading = {
  text: string;
  id: string;
};

export type PostOutlineSection = PostHeading & {
  children: PostHeading[];
};

export type ContentHeading = PostHeading & {
  level: 2 | 3;
};

/** Flat heading list with stable ids — must match MarkdownContent render order. */
export function getContentHeadings(content: string): ContentHeading[] {
  const h2Used = new Map<string, number>();
  const h3Used = new Map<string, number>();
  const takenIds = new Set<string>();
  const headings: ContentHeading[] = [];

  for (const line of content.split(/\r?\n/)) {
    const h2 = /^## (?!#)\s*(.+)$/.exec(line);
    if (h2) {
      const text = headingTextFromMarkdown(h2[1]);
      if (!text) continue;
      const base = slugifyHeading(text) || "section";
      const count = h2Used.get(base) ?? 0;
      h2Used.set(base, count + 1);
      const id = count === 0 ? base : `${base}-${count + 1}`;
      takenIds.add(id);
      headings.push({ level: 2, text, id });
      continue;
    }

    const h3 = /^### (?!#)\s*(.+)$/.exec(line);
    if (!h3) continue;
    const text = headingTextFromMarkdown(h3[1]);
    if (!text) continue;
    const base = slugifyHeading(text) || "section";
    const count = h3Used.get(base) ?? 0;
    h3Used.set(base, count + 1);
    let id = count === 0 ? base : `${base}-${count + 1}`;
    if (takenIds.has(id)) id = `${id}-h3`;
    takenIds.add(id);
    headings.push({ level: 3, text, id });
  }

  return headings;
}

/** H2 sections with nested H3 children for the table of contents. */
export function getPostOutline(content: string): PostOutlineSection[] {
  const sections: PostOutlineSection[] = [];
  let current: PostOutlineSection | null = null;

  for (const heading of getContentHeadings(content)) {
    if (heading.level === 2) {
      current = { text: heading.text, id: heading.id, children: [] };
      sections.push(current);
      continue;
    }
    if (current) {
      current.children.push({ text: heading.text, id: heading.id });
    }
  }

  return sections;
}

/** H2s only — used for JSON-LD hasPart. */
export function getPostH2Headings(content: string): PostHeading[] {
  return getPostOutline(content).map(({ text, id }) => ({ text, id }));
}

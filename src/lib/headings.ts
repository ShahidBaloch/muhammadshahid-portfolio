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

/** H2s only — unique enough for sitelinks, and h3 "Detailed answer" repeats. */
export function getPostH2Headings(content: string): PostHeading[] {
  const used = new Map<string, number>();
  const headings: PostHeading[] = [];

  for (const line of content.split(/\r?\n/)) {
    const match = /^## (?!#)\s*(.+)$/.exec(line);
    if (!match) continue;
    const text = headingTextFromMarkdown(match[1]);
    if (!text) continue;
    const base = slugifyHeading(text) || "section";
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    headings.push({
      text,
      id: count === 0 ? base : `${base}-${count + 1}`,
    });
  }

  return headings;
}

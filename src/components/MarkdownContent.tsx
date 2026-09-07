import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getPostH2Headings, headingTextFromMarkdown, slugifyHeading } from "@/lib/headings";

function childrenToText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(childrenToText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return childrenToText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
}

export function MarkdownContent({ content }: { content: string }) {
  const h2Ids = new Map(
    getPostH2Headings(content).map((heading) => [heading.text, heading.id] as const),
  );

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h2: ({ children }) => {
          const text = headingTextFromMarkdown(childrenToText(children));
          const id = h2Ids.get(text) ?? slugifyHeading(text);
          return (
            <h2 id={id} className="scroll-mt-28">
              {children}
            </h2>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

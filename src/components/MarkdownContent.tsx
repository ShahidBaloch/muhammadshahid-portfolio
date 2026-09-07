import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import "highlight.js/styles/vs2015.css";
import { getPostH2Headings, headingTextFromMarkdown, slugifyHeading } from "@/lib/headings";

function childrenToText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(childrenToText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return childrenToText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
}

function tableCaptionsFromMarkdown(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const captions: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const prev = i > 0 ? lines[i - 1].trim() : "";
    const isTableStart = line.startsWith("|") && (i === 0 || !lines[i - 1].trim().startsWith("|"));
    if (!isTableStart) continue;
    const italic = /^_(.+)_\s*$/.exec(prev) ?? /^\*(.+)\*\s*$/.exec(prev);
    captions.push(italic ? italic[1].replace(/\*\*/g, "").trim() : "Data table");
  }
  return captions;
}

function fenceLanguage(children: ReactNode): string | undefined {
  const child = Array.isArray(children) ? children[0] : children;
  if (!child || typeof child !== "object" || !("props" in child)) return undefined;
  const className = String((child as { props?: { className?: string } }).props?.className ?? "");
  return /language-([\w#+]+)/.exec(className)?.[1];
}

function codeBlockLabel(language: string | undefined): string {
  const key = (language ?? "").toLowerCase();
  if (key === "csharp" || key === "cs" || key === "c#") return "C# example";
  if (key === "bash" || key === "sh" || key === "shell" || key === "text") {
    return key === "text" ? "Code example" : "Shell commands";
  }
  if (key === "json") return "JSON example";
  if (!key) return "Code example";
  return `${language} example`;
}

export function MarkdownContent({ content }: { content: string }) {
  const h2Ids = new Map(
    getPostH2Headings(content).map((heading) => [heading.text, heading.id] as const),
  );
  const captions = tableCaptionsFromMarkdown(content);
  const h3Used = new Map<string, number>();
  const takenIds = new Set(h2Ids.values());
  let tableIndex = 0;

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
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
        h3: ({ children }) => {
          const text = headingTextFromMarkdown(childrenToText(children));
          const base = slugifyHeading(text) || "section";
          const count = h3Used.get(base) ?? 0;
          h3Used.set(base, count + 1);
          let id = count === 0 ? base : `${base}-${count + 1}`;
          if (takenIds.has(id)) id = `${id}-h3`;
          takenIds.add(id);
          return (
            <h3 id={id} className="scroll-mt-28">
              {children}
            </h3>
          );
        },
        table: ({ children }) => {
          const caption = captions[tableIndex] ?? "Data table";
          tableIndex += 1;
          return (
            <figure className="my-6 overflow-x-auto">
              <figcaption className="sr-only">{caption}</figcaption>
              <table>{children}</table>
            </figure>
          );
        },
        pre: ({
          children,
          node: _node,
          ...props
        }: ComponentPropsWithoutRef<"pre"> & { "data-language"?: string; node?: unknown }) => (
          <pre
            {...props}
            aria-label={codeBlockLabel(fenceLanguage(children) ?? props["data-language"])}
          >
            {children}
          </pre>
        ),
        img: ({ src, alt }) => {
          const url = typeof src === "string" ? src : "";
          if (!url) return null;
          return (
            // width/height reserve space (CLS). next/image inside react-markdown
            // broke the blog server bundle in this App Router setup.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={alt?.trim() ? alt : ""}
              width={1200}
              height={675}
              className="h-auto w-full rounded-xl border border-slate-line bg-navy p-2"
            />
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

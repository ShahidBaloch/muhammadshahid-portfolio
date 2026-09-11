import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import "highlight.js/styles/vs2015.css";
import { getContentHeadings, headingTextFromMarkdown } from "@/lib/headings";

function childrenToText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(childrenToText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return childrenToText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
}

function parseTableHeaderCells(line: string): string[] {
  return line
    .split("|")
    .map((cell) => cell.trim().replace(/\*\*/g, "").replace(/`/g, ""))
    .filter(Boolean);
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
    if (italic) {
      captions.push(italic[1].replace(/\*\*/g, "").trim());
      continue;
    }

    const headers = parseTableHeaderCells(line);
    const separator = lines[i + 1]?.trim() ?? "";
    if (headers.length >= 2 && /^\|?[\s:-]+\|/.test(separator)) {
      captions.push(`Table: ${headers.join(", ")}`);
    } else {
      captions.push(headers.length >= 2 ? `Table: ${headers.join(", ")}` : "Data table");
    }
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
  if (key === "text") return "Text diagram";
  if (key === "bash" || key === "sh" || key === "shell") return "Shell commands";
  if (key === "json") return "JSON example";
  if (!key) return "Code example";
  return `${language} example`;
}

export function MarkdownContent({ content }: { content: string }) {
  const contentHeadings = getContentHeadings(content);
  let headingIndex = 0;
  const captions = tableCaptionsFromMarkdown(content);
  let tableIndex = 0;

  function nextHeadingId(level: 2 | 3, text: string): string | undefined {
    while (headingIndex < contentHeadings.length) {
      const candidate = contentHeadings[headingIndex];
      headingIndex += 1;
      if (candidate.level === level && candidate.text === text) {
        return candidate.id;
      }
    }
    return undefined;
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      components={{
        h2: ({ children }) => {
          const text = headingTextFromMarkdown(childrenToText(children));
          const id = nextHeadingId(2, text);
          return (
            <h2 id={id} className="scroll-mt-28">
              {children}
            </h2>
          );
        },
        h3: ({ children }) => {
          const text = headingTextFromMarkdown(childrenToText(children));
          const id = nextHeadingId(3, text);
          return (
            <h3 id={id} className="scroll-mt-28">
              {children}
            </h3>
          );
        },
        table: ({ children }) => {
          const caption = captions[tableIndex] ?? "Data table";
          tableIndex += 1;
          const scrollLabel = `${caption}. Scroll horizontally to view all columns.`;
          return (
            <figure className="my-6">
              <figcaption className="sr-only">{caption}</figcaption>
              <div
                className="table-scroll-region overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label={scrollLabel}
              >
                <table className="content-table" aria-label={caption}>{children}</table>
              </div>
            </figure>
          );
        },
        th: ({ children, ...props }) => (
          <th scope="col" {...props}>
            {children}
          </th>
        ),
        pre: ({
          children,
          node: _node,
          ...props
        }: ComponentPropsWithoutRef<"pre"> & { "data-language"?: string; node?: unknown }) => {
          const label = codeBlockLabel(fenceLanguage(children) ?? props["data-language"]);
          return (
            <pre
              {...props}
              tabIndex={0}
              aria-label={`${label}. Scroll horizontally for long lines.`}
            >
              {children}
            </pre>
          );
        },
        a: ({ href, children, ...props }) => {
          const external =
            typeof href === "string" &&
            (href.startsWith("http://") || href.startsWith("https://"));
          if (external) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            );
          }
          return (
            <a href={href} {...props}>
              {children}
            </a>
          );
        },
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

/**
 * Remove hire/contact CTAs from blog markdown (lines linking to /contact).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const blogDir = path.join(__dirname, "..", "content", "blog");

function stripContactCtas(content) {
  const lines = content.split("\n");
  const out = [];

  for (const line of lines) {
    if (!line.includes("/contact")) {
      out.push(line);
      continue;
    }

    // Inline salvage: keep non-CTA text when the line mixes content + contact link
    let salvaged = line
      .replace(/\s*\[[^\]]*\]\(\/contact\)/gi, "")
      .replace(/\s*—\s*we can [^.]+\./gi, "")
      .replace(/\s*—\s*I can [^.]+\./gi, "")
      .replace(/\s*—\s*I will [^.]+\./gi, "")
      .replace(/\s*—\s*I help [^.]+\./gi, "")
      .replace(/^If [^,]+,\s*/i, "")
      .replace(/^Need [^?]+\?\s*/i, "")
      .replace(/^Want [^?]+\?\s*/i, "")
      .replace(/^Hiring for [^?]+\?\s*/i, "")
      .replace(/^Preparing for [^?]+\?\s*/i, "")
      .replace(/^Preparing an [^?]+\?\s*/i, "")
      .replace(/\?\s*$/, ".")
      .replace(/\s{2,}/g, " ")
      .trim();

    // Drop pure CTA lines; keep short useful tails
    const ctaOnly =
      /^(contact|get in touch|reach out|hire me)/i.test(salvaged) ||
      salvaged.length < 25;
    if (!ctaOnly && salvaged.length > 0) {
      out.push(salvaged);
    }
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

let changed = 0;
for (const file of fs.readdirSync(blogDir).filter((f) => f.endsWith(".md"))) {
  const filePath = path.join(blogDir, file);
  const before = fs.readFileSync(filePath, "utf8");
  const after = stripContactCtas(before);
  if (after !== before) {
    fs.writeFileSync(filePath, after, "utf8");
    changed++;
  }
}

console.log(`Updated ${changed} blog files (removed /contact CTAs).`);

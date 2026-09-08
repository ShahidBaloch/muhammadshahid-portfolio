import fs from "fs";
import path from "path";

const learningDirectory = path.join(process.cwd(), "content", "learning");

function stripFrontmatter(fileContents: string): string {
  if (!fileContents.startsWith("---")) return fileContents.trim();
  const end = fileContents.indexOf("---", 3);
  if (end === -1) return fileContents.trim();
  return fileContents.slice(end + 3).trim();
}

/** Hub body markdown at content/learning/{slug}.md — rendered below the short intro. */
export function getLearningTopicBody(slug: string): string | null {
  const mdPath = path.join(learningDirectory, `${slug}.md`);
  if (!fs.existsSync(mdPath)) return null;
  const fileContents = fs.readFileSync(mdPath, "utf8");
  const trimmed = stripFrontmatter(fileContents);
  return trimmed.length > 0 ? trimmed : null;
}

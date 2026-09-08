/**
 * Audit blog posts and learning hubs for user-intent content structure.
 * Run: node scripts/audit-content-intent.mjs
 */
import fs from "fs";
import path from "path";
import matter from "gray-matter";

const blogDir = path.join(process.cwd(), "content", "blog");
const learningDir = path.join(process.cwd(), "content", "learning");

function auditPost(file) {
  const slug = file.replace(/\.md$/, "");
  const raw = fs.readFileSync(path.join(blogDir, file), "utf8");
  const { data, content } = matter(raw);
  const issues = [];
  if (!data.description || data.description.length < 40) issues.push("short-missing-description");
  if (
    !/\*\*New to this\*\*/.test(content) &&
    !/## Routing/.test(content) &&
    data.category !== "interview-questions"
  )
    issues.push("missing-routing");
  if (!/## If an interviewer asks|## Cross-questions/i.test(content) && data.category !== "interview-questions")
    issues.push("missing-interview-section");
  if (!/```text|## Real-world|analogy/i.test(content) && data.category !== "interview-questions")
    issues.push("missing-analogy-or-diagram");
  return { slug, category: data.category || "none", issues };
}

const posts = fs.readdirSync(blogDir).filter((f) => f.endsWith(".md"));
const results = posts.map(auditPost).filter((r) => r.issues.length > 0);

const learning = fs.existsSync(learningDir)
  ? fs.readdirSync(learningDir).filter((f) => f.endsWith(".md"))
  : [];

console.log(`Learning hub bodies: ${learning.length}`);
console.log(`Posts with intent gaps: ${results.length} / ${posts.length}\n`);

const byIssue = {};
for (const r of results) {
  for (const i of r.issues) byIssue[i] = (byIssue[i] || 0) + 1;
}
console.log("By issue:", byIssue);
console.log("\nSample slugs:", results.slice(0, 15).map((r) => r.slug).join(", "));

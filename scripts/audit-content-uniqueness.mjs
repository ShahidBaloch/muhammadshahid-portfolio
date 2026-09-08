/**
 * Uniqueness audit for AdSense / SEO — finds repeated phrases and near-duplicate blocks.
 * Run: node scripts/audit-content-uniqueness.mjs
 */
import fs from "fs";
import path from "path";
import matter from "gray-matter";

const blogDir = path.join(process.cwd(), "content", "blog");
const learningDir = path.join(process.cwd(), "content", "learning");

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`[^`]+`/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 60);
}

function ngrams(text, n = 8) {
  const words = normalize(text).split(" ").filter(Boolean);
  const out = [];
  for (let i = 0; i <= words.length - n; i++) {
    out.push(words.slice(i, i + n).join(" "));
  }
  return out;
}

function loadMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), "utf8");
      const { data, content } = matter(raw);
      return { slug: f.replace(/\.md$/, ""), data, content, dir };
    });
}

const all = [...loadMarkdownFiles(blogDir), ...loadMarkdownFiles(learningDir)];

// 1. Duplicate frontmatter descriptions
const descMap = new Map();
for (const f of all) {
  const d = (f.data.description || "").trim();
  if (!d) continue;
  const key = normalize(d);
  if (!descMap.has(key)) descMap.set(key, []);
  descMap.get(key).push(f.slug);
}
const dupDescriptions = [...descMap.entries()].filter(([, slugs]) => slugs.length > 1);

// 2. Repeated sentences (exact, normalized, len >= 60)
const sentenceMap = new Map();
for (const f of all) {
  for (const s of sentences(f.content)) {
    const key = normalize(s);
    if (key.length < 60) continue;
    if (!sentenceMap.has(key)) sentenceMap.set(key, []);
    sentenceMap.get(key).push(f.slug);
  }
}
const dupSentences = [...sentenceMap.entries()]
  .filter(([, slugs]) => new Set(slugs).size > 1)
  .sort((a, b) => b[1].length - a[1].length);

// 3. Repeated 8-word n-grams across different files
const ngramMap = new Map();
for (const f of all) {
  const seen = new Set();
  for (const ng of ngrams(f.content, 8)) {
    if (seen.has(ng)) continue;
    seen.add(ng);
    if (!ngramMap.has(ng)) ngramMap.set(ng, new Set());
    ngramMap.get(ng).add(f.slug);
  }
}
const dupNgrams = [...ngramMap.entries()]
  .filter(([, slugs]) => slugs.size > 2)
  .sort((a, b) => b[1].size - a[1].size)
  .slice(0, 40);

// 4. Boilerplate lines (routing / interview template)
const boilerplatePatterns = [
  { name: "New to this routing", re: /\*\*New to this\*\* → stay here/ },
  { name: "Merging a PR routing", re: /\*\*Merging a PR\*\* →/ },
  { name: "On-call interview routing", re: /\*\*On-call \/ interview\*\* →/ },
  { name: "30-second answer", re: /\*\*30-second answer:\*\*/ },
  { name: "Strong answer", re: /\*\*Strong answer:\*\*/ },
  { name: "Terms used here", re: /\*\*Terms used here:\*\*/ },
  { name: "If an interviewer asks H2", re: /^## If an interviewer asks/m },
  { name: "Deep-dive articles table", re: /## Deep-dive articles/i },
];

const boilerplateCounts = {};
for (const p of boilerplatePatterns) {
  boilerplateCounts[p.name] = all.filter((f) => p.re.test(f.content)).length;
}

// 5. Hub vs blog overlap — compare learning hub opening paragraphs to blog posts
const hubs = loadMarkdownFiles(learningDir);
const blogs = loadMarkdownFiles(blogDir);
const hubBlogOverlap = [];
for (const hub of hubs) {
  const hubParas = hub.content
    .split(/\n\n+/)
    .map((p) => normalize(p))
    .filter((p) => p.length > 120);
  for (const post of blogs) {
    const postParas = post.content
      .split(/\n\n+/)
      .map((p) => normalize(p))
      .filter((p) => p.length > 120);
    for (const hp of hubParas.slice(0, 15)) {
      for (const pp of postParas.slice(0, 10)) {
        if (hp === pp) {
          hubBlogOverlap.push({ hub: hub.slug, post: post.slug, len: hp.length });
        }
      }
    }
  }
}

// 6. Thin content (word count)
const thin = all
  .map((f) => ({
    slug: f.slug,
    words: f.content.split(/\s+/).filter(Boolean).length,
    type: f.dir.includes("learning") ? "hub" : "blog",
  }))
  .filter((f) => f.words < 400);

// 7. Identical FAQ answers across posts
const faqMap = new Map();
for (const f of all) {
  const faqs = f.data.faq || [];
  for (const item of faqs) {
    const key = normalize(item.a || "");
    if (key.length < 40) continue;
    if (!faqMap.has(key)) faqMap.set(key, []);
    faqMap.get(key).push(`${f.slug} (q: ${item.q?.slice(0, 50)}...)`);
  }
}
const dupFaqs = [...faqMap.entries()].filter(([, slugs]) => slugs.length > 1);

console.log("=== CONTENT UNIQUENESS AUDIT ===\n");
console.log(`Files: ${all.length} (${blogs.length} blog, ${hubs.length} hubs)\n`);

console.log("--- Duplicate descriptions (exact) ---");
console.log(dupDescriptions.length === 0 ? "None" : dupDescriptions.slice(0, 10));
console.log();

console.log("--- Duplicate FAQ answers (exact) ---");
console.log(dupFaqs.length === 0 ? "None" : dupFaqs.slice(0, 5).map(([a, s]) => ({ count: s.length, sample: a.slice(0, 80), files: s.slice(0, 3) })));
console.log();

console.log("--- Hub ↔ blog identical paragraphs ---");
console.log(hubBlogOverlap.length === 0 ? "None" : hubBlogOverlap);
console.log();

console.log("--- Thin pages (< 400 words) ---");
console.log(thin.length === 0 ? "None" : thin);
console.log();

console.log("--- Boilerplate frequency (template is OK; high = risk if body is thin) ---");
console.log(boilerplateCounts);
console.log();

console.log("--- Top duplicate sentences (2+ files) ---");
for (const [sent, slugs] of dupSentences.slice(0, 15)) {
  const unique = [...new Set(slugs)];
  if (unique.length < 2) continue;
  console.log(`[${unique.length} files] ${sent.slice(0, 100)}...`);
  console.log(`  → ${unique.slice(0, 5).join(", ")}${unique.length > 5 ? "..." : ""}`);
}
console.log();

console.log("--- Repeated 8-word phrases (3+ files) — sample ---");
for (const [ng, slugs] of dupNgrams.slice(0, 20)) {
  console.log(`[${slugs.size}] "${ng}"`);
  console.log(`  → ${[...slugs].slice(0, 4).join(", ")}`);
}

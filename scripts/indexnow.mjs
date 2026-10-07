/**
 * IndexNow submission script — run after deployment to notify search engines of new/updated content.
 * IndexNow is supported by Bing, Yandex, and the broader IndexNow consortium.
 * Usage: node scripts/indexnow.mjs
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const SITE = "https://www.muhammadshahid.dev";
const KEY = "e9f7c3a8b2d14f6e5a0c9b7d3e2f1a8c";
const KEY_LOCATION = `${SITE}/${KEY}.txt`;
const BLOG_DIR = new URL("../content/blog", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

/** Read all blog slugs from content/blog/ */
async function getBlogSlugs() {
  const files = await readdir(BLOG_DIR);
  return files
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

/** Extract date from frontmatter */
async function getPostDate(slug) {
  try {
    const content = await readFile(join(BLOG_DIR, `${slug}.md`), "utf-8");
    const updatedMatch = content.match(/^updated:\s*"?(.+?)"?\s*$/m);
    const dateMatch = content.match(/^date:\s*"?(.+?)"?\s*$/m);
    return updatedMatch?.[1] ?? dateMatch?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Submit URLs to IndexNow endpoint */
async function submitToIndexNow(urls) {
  const payload = {
    host: "www.muhammadshahid.dev",
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: urls,
  };

  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });

  return response.status;
}

async function main() {
  const args = process.argv.slice(2);
  const daysArg = parseInt(args[0] ?? "2", 10);

  console.log(`IndexNow: submitting URLs updated in last ${daysArg} day(s)...`);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysArg);

  const slugs = await getBlogSlugs();
  const recentSlugs = [];

  for (const slug of slugs) {
    const date = await getPostDate(slug);
    if (date && new Date(date) >= cutoff) {
      recentSlugs.push(slug);
    }
  }

  if (recentSlugs.length === 0) {
    console.log("No posts updated in this window. Run with a larger number of days:");
    console.log("  node scripts/indexnow.mjs 7   (last 7 days)");
    console.log("  node scripts/indexnow.mjs 365 (all posts)");
    return;
  }

  const urls = [
    SITE,
    `${SITE}/blog`,
    ...recentSlugs.map((slug) => `${SITE}/blog/${slug}`),
  ];

  // IndexNow accepts max 10,000 URLs per request; chunk if needed
  const CHUNK = 10000;
  for (let i = 0; i < urls.length; i += CHUNK) {
    const chunk = urls.slice(i, i + CHUNK);
    const status = await submitToIndexNow(chunk);
    console.log(`  Submitted ${chunk.length} URLs — HTTP ${status}`);
  }

  console.log(`Done. ${urls.length} URL(s) submitted.`);
  console.log("Bing/IndexNow typically crawls within 24-48 hours.");
}

main().catch((err) => {
  console.error("IndexNow submission failed:", err.message);
  process.exit(1);
});

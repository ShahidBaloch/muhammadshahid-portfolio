import fs from "fs";
import path from "path";
import matter from "gray-matter";

const blogDir = "content/blog";
const learningDir = "content/learning";
const publicDir = "public";

const blogFiles = fs.readdirSync(blogDir).filter((f) => f.endsWith(".md"));
const learningFiles = fs.readdirSync(learningDir).filter((f) => f.endsWith(".md"));

console.log("=== COMPREHENSIVE SEO AUDIT ===");
console.log(`Auditing ${blogFiles.length} blog posts and ${learningFiles.length} learning topics...\n`);

const allBlogSlugs = new Set(blogFiles.map((f) => f.replace(/\.md$/, "")));
const allLearningSlugs = new Set(learningFiles.map((f) => f.replace(/\.md$/, "")));

// 1. Title Audit
console.log("--- 1. TITLE AUDIT ---");
const titleMap = new Map();
const titleIssues = [];
for (const file of blogFiles) {
  const raw = fs.readFileSync(path.join(blogDir, file), "utf8");
  const { data } = matter(raw);
  const title = (data.title || "").trim();
  const slug = file.replace(/\.md$/, "");

  if (!title) {
    titleIssues.push({ slug, issue: "Missing title" });
    continue;
  }
  if (titleMap.has(title)) {
    titleIssues.push({ slug, issue: `Duplicate title with ${titleMap.get(title)}` });
  } else {
    titleMap.set(title, slug);
  }
  if (title.length < 30) {
    titleIssues.push({ slug, issue: `Short title (${title.length} chars): "${title}"` });
  } else if (title.length > 70) {
    titleIssues.push({ slug, issue: `Long title (${title.length} chars): "${title}"` });
  }
}
console.log(`Total unique titles: ${titleMap.size} / ${blogFiles.length}`);
console.log(`Title issues found: ${titleIssues.length}`);
if (titleIssues.length > 0) {
  titleIssues.slice(0, 8).forEach((i) => console.log(`  - [${i.slug}]: ${i.issue}`));
}

// 2. Meta Description Audit
console.log("\n--- 2. META DESCRIPTION AUDIT ---");
const descMap = new Map();
const descIssues = [];
for (const file of blogFiles) {
  const raw = fs.readFileSync(path.join(blogDir, file), "utf8");
  const { data } = matter(raw);
  const desc = (data.description || "").trim();
  const slug = file.replace(/\.md$/, "");

  if (!desc) {
    descIssues.push({ slug, issue: "Missing description" });
    continue;
  }
  if (descMap.has(desc)) {
    descIssues.push({ slug, issue: `Duplicate description with ${descMap.get(desc)}` });
  } else {
    descMap.set(desc, slug);
  }
  if (desc.length < 80) {
    descIssues.push({ slug, issue: `Short description (${desc.length} chars)` });
  } else if (desc.length > 170) {
    descIssues.push({ slug, issue: `Long description (${desc.length} chars)` });
  }
}
console.log(`Total unique descriptions: ${descMap.size} / ${blogFiles.length}`);
console.log(`Description issues found: ${descIssues.length}`);
if (descIssues.length > 0) {
  descIssues.slice(0, 8).forEach((i) => console.log(`  - [${i.slug}]: ${i.issue}`));
}

// 3. Headings Structure (No # H1 outside code blocks)
console.log("\n--- 3. HEADING HIERARCHY AUDIT ---");
const h1Issues = [];
for (const file of blogFiles) {
  const raw = fs.readFileSync(path.join(blogDir, file), "utf8");
  const { content } = matter(raw);
  const slug = file.replace(/\.md$/, "");

  // Strip code blocks
  const lines = content.split(/\r?\n/);
  let inCode = false;
  lines.forEach((line, idx) => {
    if (line.trim().startsWith("```")) {
      inCode = !inCode;
      return;
    }
    if (!inCode && /^#\s+/.test(line.trim())) {
      h1Issues.push({ slug, line: idx + 1, text: line.trim() });
    }
  });
}
console.log(`Markdown H1 tags found outside code blocks: ${h1Issues.length}`);
if (h1Issues.length > 0) {
  h1Issues.forEach((i) => console.log(`  - [${i.slug}:${i.line}]: ${i.text}`));
} else {
  console.log("  ✓ All markdown content properly starts at H2 (##) or lower.");
}

// 4. Internal Links Audit
console.log("\n--- 4. INTERNAL LINK AUDIT ---");
const brokenLinks = [];
let totalLinksChecked = 0;
for (const file of blogFiles) {
  const raw = fs.readFileSync(path.join(blogDir, file), "utf8");
  const { content } = matter(raw);
  const slug = file.replace(/\.md$/, "");

  const links = [...content.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
  for (const m of links) {
    const href = m[2];
    totalLinksChecked++;
    if (href.startsWith("/blog/")) {
      const targetSlug = href.replace("/blog/", "").split("#")[0].split("?")[0];
      if (targetSlug && !allBlogSlugs.has(targetSlug)) {
        brokenLinks.push({ slug, href, issue: "Target blog slug not found" });
      }
    } else if (href.startsWith("/learning/")) {
      const targetSlug = href.replace("/learning/", "").split("#")[0].split("?")[0];
      if (targetSlug && !allLearningSlugs.has(targetSlug)) {
        brokenLinks.push({ slug, href, issue: "Target learning slug not found" });
      }
    }
  }
}
console.log(`Total internal markdown links checked: ${totalLinksChecked}`);
console.log(`Broken internal links found: ${brokenLinks.length}`);
if (brokenLinks.length > 0) {
  brokenLinks.forEach((b) => console.log(`  - [${b.slug}] -> ${b.href} (${b.issue})`));
} else {
  console.log("  ✓ 100% of internal links resolve to valid, active routes.");
}

// 5. Sitemap & Robots.txt Check
console.log("\n--- 5. SITEMAP & ROBOTS AUDIT ---");
const sitemapPath = path.join(publicDir, "sitemap.xml");
if (fs.existsSync(sitemapPath)) {
  const sitemapXml = fs.readFileSync(sitemapPath, "utf8");
  const locMatches = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  console.log(`Total URLs in sitemap.xml: ${locMatches.length}`);

  let missingFromSitemap = 0;
  for (const slug of allBlogSlugs) {
    const expectedUrl = `https://www.muhammadshahid.dev/blog/${slug}`;
    if (!locMatches.includes(expectedUrl)) {
      console.log(`  - Missing blog post from sitemap: ${slug}`);
      missingFromSitemap++;
    }
  }
  for (const slug of allLearningSlugs) {
    const expectedUrl = `https://www.muhammadshahid.dev/learning/${slug}`;
    if (!locMatches.includes(expectedUrl)) {
      console.log(`  - Missing learning topic from sitemap: ${slug}`);
      missingFromSitemap++;
    }
  }
  if (missingFromSitemap === 0) {
    console.log("  ✓ Every single blog post and learning topic is in sitemap.xml.");
  }

  // Check domain consistency (no non-www or http URLs in sitemap)
  const badDomainUrls = locMatches.filter(
    (u) => !u.startsWith("https://www.muhammadshahid.dev")
  );
  if (badDomainUrls.length === 0) {
    console.log("  ✓ All sitemap URLs strictly use https://www.muhammadshahid.dev (canonical).");
  } else {
    console.log(`  ✗ Found ${badDomainUrls.length} non-canonical URLs in sitemap!`);
  }
} else {
  console.log("  ✗ sitemap.xml does not exist in public directory!");
}

// 6. Schema.org / Structured Data Check
console.log("\n--- 6. STRUCTURED DATA & CANONICAL CHECK ---");
const layoutRaw = fs.readFileSync("src/app/layout.tsx", "utf8");
console.log("Layout SEO features:");
console.log("  - metadataBase configured:", /metadataBase:\s*new URL\(siteConfig\.url\)/.test(layoutRaw));
console.log("  - robots meta tag configured:", /robots:\s*\{\s*index:\s*true,\s*follow:\s*true\s*\}/.test(layoutRaw));
console.log("  - Person JSON-LD injected:", /personJsonLd/.test(layoutRaw));
console.log("  - WebSite JSON-LD injected:", /websiteJsonLd/.test(layoutRaw));

const blogPageRaw = fs.readFileSync("src/app/blog/[slug]/page.tsx", "utf8");
console.log("Blog post SEO features:");
console.log("  - canonical alternate tag:", /alternates:\s*\{\s*canonical:\s*`\/blog\/\$\{post\.slug\}`\s*\}/.test(blogPageRaw));
console.log("  - BlogPosting JSON-LD injected:", /BlogPosting/.test(blogPageRaw));
console.log("  - BreadcrumbList JSON-LD injected:", /BreadcrumbList/.test(blogPageRaw));
console.log("  - FAQPage JSON-LD conditionally injected:", /FAQPage/.test(blogPageRaw));

const learningPageRaw = fs.readFileSync("src/app/learning/[topic]/page.tsx", "utf8");
console.log("Learning topic SEO features:");
console.log("  - canonical alternate tag:", /alternates:\s*\{\s*canonical:\s*path\s*\}/.test(learningPageRaw));
console.log("  - CollectionPage JSON-LD injected:", /CollectionPage/.test(learningPageRaw));
console.log("  - BreadcrumbList JSON-LD injected:", /BreadcrumbList/.test(learningPageRaw));
console.log("  - FAQPage JSON-LD injected:", /FAQPage/.test(learningPageRaw));

console.log("\n=== AUDIT COMPLETE ===");

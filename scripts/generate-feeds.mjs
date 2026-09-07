/**
 * Writes static public/sitemap.xml and public/rss.xml at build time.
 * Vercel then serves them from the CDN instead of a serverless function that
 * can 500 when markdown is missing from the lambda trace.
 *
 * Keep PROJECT_SLUGS / LEARNING_SLUGS / STATIC_PATHS in sync with src/lib/site.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = "https://www.muhammadshahid.dev";
const POSTS_DIR = path.join(root, "content", "blog");
const PUBLIC_DIR = path.join(root, "public");

const STATIC_PATHS = [
  "",
  "/work",
  "/services",
  "/learning",
  "/about",
  "/blog",
  "/contact",
  "/privacy",
  "/terms",
  "/disclaimer",
];

const PROJECT_SLUGS = ["carbazaar", "ecom-net10", "healthcare-saas"];

const LEARNING_SLUGS = [
  "interview-questions",
  "async-concurrency",
  "design-patterns",
  "dependency-injection",
  "authentication",
  "identity",
  "ef-core",
  "cqrs",
  "edi",
  "architecture",
];

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const INDEXNOW_KEY = "88ec6b8ae88b26dc37ce3d9ac5d3c35d";

function toLastModified(date) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return "2026-01-01T00:00:00.000Z";
  }
  const now = new Date();
  if (parsed.getTime() > now.getTime()) {
    return now.toISOString();
  }
  if (parsed.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)) {
    return now.toISOString();
  }
  return parsed.toISOString();
}

function readPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];

  return fs
    .readdirSync(POSTS_DIR)
    .filter((file) => file.endsWith(".md") || file.endsWith(".mdx"))
    .flatMap((file) => {
      try {
        const slug = file.replace(/\.mdx?$/, "");
        const raw = fs.readFileSync(path.join(POSTS_DIR, file), "utf8");
        const { data, content } = matter(raw);
        return [
          {
            slug,
            title: String(data.title ?? slug),
            description: String(data.description ?? ""),
            date: String(data.date ?? ""),
            updated: data.updated ? String(data.updated) : undefined,
            content,
          },
        ];
      } catch {
        return [];
      }
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function buildSitemap(posts) {
  const latestContentDate =
    posts.map((post) => post.updated ?? post.date).sort((a, b) => (a < b ? 1 : -1))[0] ??
    "2026-08-04";
  const siteLastModified = toLastModified(latestContentDate);

  const entries = [
    ...STATIC_PATHS.map((pathName) => ({
      path: pathName,
      lastModified: siteLastModified,
      changeFrequency: "monthly",
      priority: pathName === "" ? "1.0" : pathName === "/blog" || pathName === "/work" ? "0.8" : pathName === "/privacy" || pathName === "/terms" || pathName === "/disclaimer" ? "0.2" : "0.6",
    })),
    ...PROJECT_SLUGS.map((slug) => ({
      path: `/work/${slug}`,
      lastModified: siteLastModified,
      changeFrequency: "monthly",
      priority: "0.7",
    })),
    ...LEARNING_SLUGS.map((slug) => ({
      path: `/learning/${slug}`,
      lastModified: siteLastModified,
      changeFrequency: "weekly",
      priority: "0.55",
    })),
    ...posts.map((post) => ({
      path: `/blog/${post.slug}`,
      lastModified: toLastModified(post.updated ?? post.date),
      changeFrequency: "monthly",
      priority: "0.8",
    })),
  ];

  const urls = entries
    .map(
      (entry) => `
  <url>
    <loc>${xmlEscape(`${BASE_URL}${entry.path}`)}</loc>
    <lastmod>${entry.lastModified}</lastmod>
    <changefreq>${entry.changeFrequency}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>
`;
}

function buildRss(posts) {
  const items = posts
    .map(
      (post) => `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${BASE_URL}/blog/${post.slug}</link>
      <guid>${BASE_URL}/blog/${post.slug}</guid>
      <pubDate>${new Date(post.date || "2026-01-01").toUTCString()}</pubDate>
      <description><![CDATA[${post.description}]]></description>
    </item>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Muhammad Shahid Blog</title>
    <link>${BASE_URL}/blog</link>
    <description>Senior .NET + Angular engineer helping teams design and ship secure healthcare, SaaS, and eCommerce systems — APIs, SPAs, Azure, identity, and clean architecture.</description>
    <language>en-us</language>
    <atom:link href="${BASE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>
`;
}

async function submitIndexNow(urlList) {
  if (!process.env.VERCEL && !process.env.CI && process.env.INDEXNOW !== "1") {
    return;
  }

  try {
    const response = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: "www.muhammadshahid.dev",
        key: INDEXNOW_KEY,
        keyLocation: `${BASE_URL}/${INDEXNOW_KEY}.txt`,
        urlList,
      }),
    });
    console.log(`IndexNow ${response.status} (${urlList.length} URLs).`);
  } catch (error) {
    console.warn(`IndexNow skipped: ${error instanceof Error ? error.message : error}`);
  }
}

const posts = readPosts();
fs.mkdirSync(PUBLIC_DIR, { recursive: true });
fs.writeFileSync(path.join(PUBLIC_DIR, `${INDEXNOW_KEY}.txt`), INDEXNOW_KEY);
fs.writeFileSync(path.join(PUBLIC_DIR, "sitemap.xml"), buildSitemap(posts));
fs.writeFileSync(path.join(PUBLIC_DIR, "rss.xml"), buildRss(posts));
console.log(`Wrote public/sitemap.xml and public/rss.xml (${posts.length} posts).`);

const indexNowUrls = [
  BASE_URL,
  `${BASE_URL}/blog`,
  `${BASE_URL}/blog/csharp-async-await-interview-questions`,
  `${BASE_URL}/blog/identityserver-vs-aspnet-identity`,
  `${BASE_URL}/blog/aspnet-core-appsettings-localappsettings`,
  `${BASE_URL}/blog/aspnet-core-headers-readonly-response-started`,
  `${BASE_URL}/blog/aspnet-core-data-protection-xml-encryptor`,
  `${BASE_URL}/blog/aspnet-core-idx10501-jwt-kid`,
  `${BASE_URL}/learning/interview-questions`,
  `${BASE_URL}/learning/async-concurrency`,
  `${BASE_URL}/learning/identity`,
  `${BASE_URL}/learning/architecture`,
  `${BASE_URL}/sitemap.xml`,
];

await submitIndexNow(indexNowUrls);

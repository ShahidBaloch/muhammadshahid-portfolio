import { getAllPosts } from "@/lib/posts";
import { learningTopics, projects, siteConfig } from "@/lib/site";

type SitemapEntry = {
  path: string;
  lastModified: string;
  changeFrequency: "monthly" | "weekly";
  priority: number;
};

function toLastModified(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return "2026-01-01T00:00:00.000Z";
  }
  return parsed.toISOString();
}

export function getSitemapEntries(): SitemapEntry[] {
  const posts = getAllPosts();
  const latestContentDate = posts[0]?.date ?? "2026-08-04";
  const siteLastModified = toLastModified(latestContentDate);

  const staticRoutes: SitemapEntry[] = [
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
  ].map((path) => ({
    path,
    lastModified: siteLastModified,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : path === "/blog" || path === "/work" ? 0.8 : 0.6,
  }));

  const workRoutes: SitemapEntry[] = projects.map((project) => ({
    path: `/work/${project.slug}`,
    lastModified: siteLastModified,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const learningRoutes: SitemapEntry[] = learningTopics.map((topic) => ({
    path: `/learning/${topic.slug}`,
    lastModified: siteLastModified,
    changeFrequency: "weekly",
    priority: 0.55,
  }));

  const postRoutes: SitemapEntry[] = posts.map((post) => ({
    path: `/blog/${post.slug}`,
    lastModified: toLastModified(post.date),
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...workRoutes, ...learningRoutes, ...postRoutes];
}

export function buildSitemapXml(): string {
  const baseUrl = siteConfig.url.replace(/\/$/, "");
  const entries = getSitemapEntries()
    .map(
      (entry) => `
  <url>
    <loc>${baseUrl}${entry.path}</loc>
    <lastmod>${entry.lastModified}</lastmod>
    <changefreq>${entry.changeFrequency}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}
</urlset>`;
}

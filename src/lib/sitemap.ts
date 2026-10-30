import { getAllPosts } from "@/lib/posts";
import { siteConfig } from "@/lib/site";

type SitemapEntry = {
  url: string;
  lastModified?: string | Date;
  changeFrequency?: "weekly" | "monthly" | "yearly";
  priority?: number;
};

const SITE = siteConfig.url;

const NOW = new Date().toISOString().slice(0, 10);

const staticRoutes: SitemapEntry[] = [
  {
    url: SITE,
    lastModified: NOW,
    changeFrequency: "monthly",
    priority: 1.0,
  },
  {
    url: `${SITE}/work`,
    lastModified: NOW,
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    url: `${SITE}/services`,
    lastModified: NOW,
    changeFrequency: "monthly",
    priority: 0.7,
  },
  {
    url: `${SITE}/about`,
    lastModified: NOW,
    changeFrequency: "monthly",
    priority: 0.6,
  },
  {
    url: `${SITE}/blog`,
    lastModified: NOW,
    changeFrequency: "weekly",
    priority: 0.8,
  },
  {
    url: `${SITE}/contact`,
    lastModified: NOW,
    changeFrequency: "yearly",
    priority: 0.5,
  },
  {
    url: `${SITE}/privacy`,
    changeFrequency: "yearly",
    priority: 0.3,
  },
  {
    url: `${SITE}/terms`,
    changeFrequency: "yearly",
    priority: 0.3,
  },
  {
    url: `${SITE}/disclaimer`,
    changeFrequency: "yearly",
    priority: 0.2,
  },
];

const projectSlugs = ["carbazaar", "ecom-net10", "healthcare-saas"];

const learningHubs = [
  "api-design",
  "architecture",
  "async-concurrency",
  "authentication",
  "caching",
  "cqrs",
  "dependency-injection",
  "design-patterns",
  "ef-core",
  "identity",
  "interview-questions",
  "angular",
  "azure",
  "security",
  "devops",
  "testing",
  "edi",
];

export function sitemap(): SitemapEntry[] {
  const posts = getAllPosts();

  const postEntries: SitemapEntry[] = posts.map((post) => ({
    url: `${SITE}/blog/${post.slug}`,
    lastModified: new Date(post.updated ?? post.date),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const hubEntries: SitemapEntry[] = learningHubs.map((hub) => ({
    url: `${SITE}/learning/${hub}`,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const workEntries: SitemapEntry[] = projectSlugs.map((slug) => ({
    url: `${SITE}/work/${slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...staticRoutes, ...workEntries, ...hubEntries, ...postEntries];
}

/** sitemap.xml in the same format the Next.js metadata route produced. */
export function sitemapXml(): string {
  const urls = sitemap().map((e) => {
    const lastmod = e.lastModified instanceof Date ? e.lastModified.toISOString() : e.lastModified;
    return [
      "<url>",
      `<loc>${e.url}</loc>`,
      ...(lastmod ? [`<lastmod>${lastmod}</lastmod>`] : []),
      ...(e.changeFrequency ? [`<changefreq>${e.changeFrequency}</changefreq>`] : []),
      ...(e.priority !== undefined ? [`<priority>${e.priority}</priority>`] : []),
      "</url>",
    ].join("\n");
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

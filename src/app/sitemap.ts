import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/posts";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-static";

const SITE = siteConfig.url;

const NOW = new Date().toISOString().slice(0, 10);

const staticRoutes: MetadataRoute.Sitemap = [
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
];

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

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts();

  const postEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE}/blog/${post.slug}`,
    lastModified: new Date(post.updated ?? post.date),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const hubEntries: MetadataRoute.Sitemap = learningHubs.map((hub) => ({
    url: `${SITE}/learning/${hub}`,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...hubEntries, ...postEntries];
}

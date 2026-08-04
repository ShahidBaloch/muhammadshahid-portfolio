import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/posts";
import { learningTopics, siteConfig } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
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
    url: `${siteConfig.url}${path}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: path === "" ? 1 : 0.8,
  }));

  const learningRoutes = learningTopics.map((topic) => ({
    url: `${siteConfig.url}/learning/${topic.slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.85,
  }));

  const posts = getAllPosts().map((post) => ({
    url: `${siteConfig.url}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...staticRoutes, ...learningRoutes, ...posts];
}

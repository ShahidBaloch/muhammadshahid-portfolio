import type { MetadataRoute } from "next";
import { getSitemapEntries } from "@/lib/sitemap";
import { siteConfig } from "@/lib/site";

/** Prerender at build so Google never hits a cold-start 500 on /sitemap.xml. */
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = siteConfig.url.replace(/\/$/, "");
  return getSitemapEntries().map((entry) => ({
    url: `${baseUrl}${entry.path}`,
    lastModified: entry.lastModified,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}

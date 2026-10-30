import { siteConfig } from "@/lib/site";

/** robots.txt in the same format the Next.js metadata route produced. */
export function robotsTxt(): string {
  return [
    "User-Agent: *",
    "Allow: /",
    "Disallow: /api/",
    "",
    "User-Agent: Mediapartners-Google",
    "Allow: /",
    "",
    `Host: ${new URL(siteConfig.url).host}`,
    `Sitemap: ${siteConfig.url}/sitemap.xml`,
    "",
  ].join("\n");
}

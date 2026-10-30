import { siteConfig } from "@/lib/site";

/**
 * The subset of the Next.js Metadata shape this site uses. Pages keep exporting these objects;
 * resolveHead() merges them with the site defaults the same way Next.js did (page keys replace
 * layout keys wholesale) and returns the <head> tags in the same order Next.js rendered them.
 */
type OgImage = { url: string; width?: number; height?: number; alt?: string };
type Robots = {
  index?: boolean;
  follow?: boolean;
  googleBot?: { index?: boolean; follow?: boolean; "max-video-preview"?: number; "max-image-preview"?: string; "max-snippet"?: number };
};

export type Metadata = {
  title?: string | { absolute?: string; default?: string; template?: string };
  description?: string;
  keywords?: string[];
  authors?: { name: string; url?: string }[];
  creator?: string;
  robots?: Robots;
  alternates?: { canonical?: string; types?: Record<string, string> };
  openGraph?: {
    type?: "website" | "article";
    locale?: string;
    url?: string;
    siteName?: string;
    title?: string;
    description?: string;
    images?: OgImage[];
    publishedTime?: string;
    modifiedTime?: string;
  };
  twitter?: { card?: "summary_large_image"; title?: string; description?: string; images?: string[] };
  verification?: { google?: string };
};

export type HeadTag =
  | { tag: "title"; text: string }
  | { tag: "meta"; attrs: Record<string, string> }
  | { tag: "link"; attrs: Record<string, string> };

const ROOT_TITLE = `${siteConfig.name} | ${siteConfig.title}`;
const googleSiteVerification = import.meta.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;

/** What src/app/layout.tsx declared as `metadata`. */
export const siteMetadata: Metadata = {
  title: { default: ROOT_TITLE, template: `%s | ${siteConfig.name}` },
  description: siteConfig.description,
  keywords: ["Muhammad Shahid", ".NET developer", "Angular developer", "ASP.NET Core", "system design", "DDD", "microservices", "Azure"],
  authors: [{ name: siteConfig.name, url: siteConfig.url }],
  creator: siteConfig.name,
  openGraph: {
    type: "website",
    locale: siteConfig.locale,
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: ROOT_TITLE,
    description: siteConfig.description,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${siteConfig.name} — ${siteConfig.title}` }],
  },
  twitter: { card: "summary_large_image", title: ROOT_TITLE, description: siteConfig.description, images: ["/opengraph-image"] },
  alternates: { types: { "application/rss+xml": `${siteConfig.url}/rss.xml` } },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 },
  },
  verification: googleSiteVerification ? { google: googleSiteVerification } : undefined,
};

/** The default social image (src/app/opengraph-image.tsx). Next.js used it, with this cache-busting
 * query, whenever the resolved openGraph came from the layout rather than the page. */
const FILE_OG_IMAGE = { url: "/opengraph-image?0b40eea335080851", alt: `${siteConfig.name} — ${siteConfig.title}` };

const abs = (u: string) => (/^https?:/.test(u) ? u : `${siteConfig.url}${u === "/" ? "" : u}`);
const flag = (on: boolean | undefined, yes: string, no: string) => (on === undefined ? [] : [on ? yes : no]);

function robotsContent(r: Robots): string {
  return [...flag(r.index, "index", "noindex"), ...flag(r.follow, "follow", "nofollow")].join(", ");
}

function googleBotContent(g: NonNullable<Robots["googleBot"]>): string {
  const parts = [...flag(g.index, "index", "noindex"), ...flag(g.follow, "follow", "nofollow")];
  if (g["max-video-preview"] !== undefined) parts.push(`max-video-preview:${g["max-video-preview"]}`);
  if (g["max-image-preview"] !== undefined) parts.push(`max-image-preview:${g["max-image-preview"]}`);
  if (g["max-snippet"] !== undefined) parts.push(`max-snippet:${g["max-snippet"]}`);
  return parts.join(", ");
}

export function resolveHead(page: Metadata, opts: { notFound?: boolean } = {}): HeadTag[] {
  const m: Metadata = { ...siteMetadata, ...page };
  // Keep the site-wide RSS link when a page only sets its canonical.
  m.alternates = { ...page.alternates, types: { ...siteMetadata.alternates?.types, ...page.alternates?.types } };
  const tags: HeadTag[] = [];
  const meta = (attrs: Record<string, string>) => tags.push({ tag: "meta", attrs });
  const link = (attrs: Record<string, string>) => tags.push({ tag: "link", attrs });

  const t = page.title;
  const title =
    typeof t === "string"
      ? `${t} | ${siteConfig.name}`
      : t?.absolute ?? ROOT_TITLE;
  tags.push({ tag: "title", text: title });
  if (m.description) meta({ name: "description", content: m.description });
  for (const a of m.authors ?? []) {
    if (a.url) link({ rel: "author", href: a.url });
    meta({ name: "author", content: a.name });
  }
  if (m.keywords?.length) meta({ name: "keywords", content: m.keywords.join(",") });
  if (m.creator) meta({ name: "creator", content: m.creator });
  if (m.robots) {
    meta({ name: "robots", content: robotsContent(m.robots) });
    if (m.robots.googleBot) meta({ name: "googlebot", content: googleBotContent(m.robots.googleBot) });
  }
  if (m.alternates?.canonical) link({ rel: "canonical", href: abs(m.alternates.canonical) });
  for (const [type, href] of Object.entries(m.alternates?.types ?? {})) link({ rel: "alternate", type, href });
  if (m.verification?.google) meta({ name: "google-site-verification", content: m.verification.google });

  const og = m.openGraph!;
  const ogFromLayout = !page.openGraph;
  if (og.title) meta({ property: "og:title", content: og.title });
  if (og.description) meta({ property: "og:description", content: og.description });
  if (og.url) meta({ property: "og:url", content: abs(og.url) });
  if (og.siteName) meta({ property: "og:site_name", content: og.siteName });
  if (og.locale) meta({ property: "og:locale", content: og.locale });
  if (ogFromLayout) {
    meta({ property: "og:image:alt", content: FILE_OG_IMAGE.alt });
    meta({ property: "og:image:type", content: "image/png" });
    meta({ property: "og:image", content: abs(FILE_OG_IMAGE.url) });
    meta({ property: "og:image:width", content: "1200" });
    meta({ property: "og:image:height", content: "630" });
  } else {
    for (const img of og.images ?? []) {
      meta({ property: "og:image", content: abs(img.url) });
      if (img.width) meta({ property: "og:image:width", content: String(img.width) });
      if (img.height) meta({ property: "og:image:height", content: String(img.height) });
      if (img.alt) meta({ property: "og:image:alt", content: img.alt });
    }
  }
  if (og.type) meta({ property: "og:type", content: og.type });
  if (og.publishedTime) meta({ property: "article:published_time", content: og.publishedTime });
  if (og.modifiedTime) meta({ property: "article:modified_time", content: og.modifiedTime });

  const tw = m.twitter!;
  if (tw.card) meta({ name: "twitter:card", content: tw.card });
  if (tw.title) meta({ name: "twitter:title", content: tw.title });
  if (tw.description) meta({ name: "twitter:description", content: tw.description });
  for (const img of tw.images ?? []) meta({ name: "twitter:image", content: abs(img) });

  link({ rel: "icon", href: "/icon?46cc6f221bcf3b5f", type: "image/png", sizes: "32x32" });
  // The 404 page also carried Next.js's own robots tag; skip it when the page already sets one.
  if (opts.notFound && !page.robots) meta({ name: "robots", content: "noindex" });
  return tags;
}

import type { APIRoute } from "astro";
import { sitemapXml } from "@/lib/sitemap";

export const GET: APIRoute = () => new Response(sitemapXml(), { headers: { "Content-Type": "application/xml" } });

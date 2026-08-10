import { buildSitemapXml } from "@/lib/sitemap";

export const dynamic = "force-static";

export async function GET() {
  return new Response(buildSitemapXml(), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate",
    },
  });
}

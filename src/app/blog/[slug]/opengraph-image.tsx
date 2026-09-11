import { ImageResponse } from "next/og";
import { getPostBySlug } from "@/lib/posts";
import { siteConfig } from "@/lib/site";

export const alt = `${siteConfig.name} — article`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type ImageProps = {
  params: Promise<{ slug: string }>;
};

export default async function OpenGraphImage({ params }: ImageProps) {
  const { slug } = await params;
  let title: string = siteConfig.title;
  try {
    title = getPostBySlug(slug).title;
  } catch {
    title = siteConfig.title;
  }

  const displayTitle = title.length > 90 ? `${title.slice(0, 87)}…` : title;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #f8fafc 0%, #f0fdfa 100%)",
          color: "#0f172a",
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 24, fontWeight: 600 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              background: "#0284c7",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            MS
          </div>
          {siteConfig.name}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1000 }}>
          <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.2 }}>{displayTitle}</div>
        </div>
        <div style={{ fontSize: 20, color: "#0d9488" }}>muhammadshahid.dev</div>
      </div>
    ),
    { ...size },
  );
}

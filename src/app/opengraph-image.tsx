import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site";

export const runtime = "edge";
export const alt = `${siteConfig.name} — ${siteConfig.title}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#051d1f",
          color: "white",
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 28,
            fontWeight: 600,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 6,
              background: "#31a8d6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            MS
          </div>
          {siteConfig.name}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 900 }}>
          <div style={{ fontSize: 54, fontWeight: 700, lineHeight: 1.15 }}>
            {siteConfig.title}
          </div>
          <div style={{ fontSize: 26, color: "#4bb8e0", lineHeight: 1.4 }}>
            ASP.NET Core · Angular · Azure · Clean architecture
          </div>
        </div>
        <div style={{ fontSize: 22, color: "rgba(255,255,255,0.82)" }}>
          muhammadshahid.dev
        </div>
      </div>
    ),
    { ...size },
  );
}

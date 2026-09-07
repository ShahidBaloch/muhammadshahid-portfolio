import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Markdown posts are read with fs at runtime. Include them in the Vercel
  // serverless trace so sitemap/rss/blog do not 500 on a cold start.
  outputFileTracingIncludes: {
    "/sitemap.xml": ["./content/blog/**/*"],
    "/rss.xml": ["./content/blog/**/*"],
    "/blog": ["./content/blog/**/*"],
    "/blog/*": ["./content/blog/**/*"],
    "/learning": ["./content/blog/**/*"],
    "/learning/*": ["./content/blog/**/*"],
    "/": ["./content/blog/**/*"],
  },
  async redirects() {
    return [
      {
        // Keep in sync with siteConfig.url — sitemap/canonicals use www.
        source: "/:path*",
        has: [{ type: "host", value: "muhammadshahid.dev" }],
        destination: "https://www.muhammadshahid.dev/:path*",
        permanent: true,
      },
      { source: "/sitemap", destination: "/sitemap.xml", permanent: true },
      { source: "/rss", destination: "/rss.xml", permanent: true },
      { source: "/feed", destination: "/rss.xml", permanent: true },
    ];
  },
};

export default nextConfig;

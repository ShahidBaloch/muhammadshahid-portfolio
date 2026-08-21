import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Markdown posts are read with fs at build. Include them in every trace so
  // blog/learning pages cannot 500 if a function ever reads content at runtime.
  // sitemap.xml and rss.xml are static files generated in prebuild.
  outputFileTracingIncludes: {
    "*": ["./content/blog/**/*"],
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

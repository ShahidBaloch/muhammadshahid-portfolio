import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 31536000,
  },
  // Markdown posts are read with fs at build. Include them in every trace so
  // blog/learning pages cannot 500 if a function ever reads content at runtime.
  // sitemap.xml and rss.xml are static files generated in prebuild.
  outputFileTracingIncludes: {
    "*": ["./content/blog/**/*", "./content/learning/**/*"],
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
      // Topic directory lives on /blog#topics — do not keep a competing /learning index.
      { source: "/learning", destination: "/blog", permanent: true },
      { source: "/sitemap", destination: "/sitemap.xml", permanent: true },
      { source: "/rss", destination: "/rss.xml", permanent: true },
      { source: "/feed", destination: "/rss.xml", permanent: true },
    ];
  },
  async headers() {
    const cacheableMeta =
      "public, max-age=86400, stale-while-revalidate=604800";

    return [
      {
        source: "/sitemap.xml",
        headers: [{ key: "Cache-Control", value: cacheableMeta }],
      },
      {
        source: "/robots.txt",
        headers: [{ key: "Cache-Control", value: cacheableMeta }],
      },
      {
        source: "/rss.xml",
        headers: [{ key: "Cache-Control", value: cacheableMeta }],
      },
      {
        source: "/:path(.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml))",
        headers: [{ key: "Cache-Control", value: cacheableMeta }],
      },
    ];
  },
};

export default nextConfig;

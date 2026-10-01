/**
 * Writes static public/sitemap.xml and public/rss.xml at build time.
 * Vercel then serves them from the CDN instead of a serverless function that
 * can 500 when markdown is missing from the lambda trace.
 *
 * Keep PROJECT_SLUGS / LEARNING_SLUGS / STATIC_PATHS in sync with src/lib/site.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = "https://www.muhammadshahid.dev";
const POSTS_DIR = path.join(root, "content", "blog");
const PUBLIC_DIR = path.join(root, "public");

const STATIC_PATHS = [
  "",
  "/work",
  "/services",
  "/about",
  "/blog",
  "/contact",
  "/privacy",
  "/terms",
  "/disclaimer",
];

const PROJECT_SLUGS = ["carbazaar", "ecom-net10", "healthcare-saas"];

const LEARNING_SLUGS = [
  "interview-questions",
  "async-concurrency",
  "design-patterns",
  "dependency-injection",
  "authentication",
  "identity",
  "ef-core",
  "cqrs",
  "edi",
  "api-design",
  "caching",
  "architecture",
  "angular",
  "azure",
  "security",
  "devops",
  "testing",
];

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const INDEXNOW_KEY = "88ec6b8ae88b26dc37ce3d9ac5d3c35d";

function toLastModified(date) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return "2026-01-01T00:00:00.000Z";
  }
  const now = new Date();
  if (parsed.getTime() > now.getTime()) {
    return now.toISOString();
  }
  if (parsed.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)) {
    return now.toISOString();
  }
  return parsed.toISOString();
}

function readPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];

  return fs
    .readdirSync(POSTS_DIR)
    .filter((file) => file.endsWith(".md") || file.endsWith(".mdx"))
    .flatMap((file) => {
      try {
        const slug = file.replace(/\.mdx?$/, "");
        const raw = fs.readFileSync(path.join(POSTS_DIR, file), "utf8");
        const { data, content } = matter(raw);
        return [
          {
            slug,
            title: String(data.title ?? slug),
            description: String(data.description ?? ""),
            date: String(data.date ?? ""),
            updated: data.updated ? String(data.updated) : undefined,
            content,
          },
        ];
      } catch {
        return [];
      }
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function buildSitemap(posts) {
  const latestContentDate =
    posts.map((post) => post.updated ?? post.date).sort((a, b) => (a < b ? 1 : -1))[0] ??
    "2026-08-04";
  const siteLastModified = toLastModified(latestContentDate);

  const entries = [
    ...STATIC_PATHS.map((pathName) => ({
      path: pathName,
      lastModified: siteLastModified,
      changeFrequency: "monthly",
      priority: pathName === "" ? "1.0" : pathName === "/blog" || pathName === "/work" ? "0.8" : pathName === "/privacy" || pathName === "/terms" || pathName === "/disclaimer" ? "0.2" : "0.6",
    })),
    ...PROJECT_SLUGS.map((slug) => ({
      path: `/work/${slug}`,
      lastModified: siteLastModified,
      changeFrequency: "monthly",
      priority: "0.7",
    })),
    ...LEARNING_SLUGS.map((slug) => ({
      path: `/learning/${slug}`,
      lastModified: siteLastModified,
      changeFrequency: "weekly",
      priority: slug === "async-concurrency" || slug === "interview-questions" ? "0.7" : "0.55",
    })),
    ...posts.map((post) => ({
      path: `/blog/${post.slug}`,
      lastModified: toLastModified(post.updated ?? post.date),
      changeFrequency: "monthly",
      priority: "0.8",
    })),
  ];

  const urls = entries
    .map(
      (entry) => `
  <url>
    <loc>${xmlEscape(`${BASE_URL}${entry.path}`)}</loc>
    <lastmod>${entry.lastModified}</lastmod>
    <changefreq>${entry.changeFrequency}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>
`;
}

function buildRss(posts) {
  const items = posts
    .map(
      (post) => `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${BASE_URL}/blog/${post.slug}</link>
      <guid>${BASE_URL}/blog/${post.slug}</guid>
      <pubDate>${new Date(post.date || "2026-01-01").toUTCString()}</pubDate>
      <description><![CDATA[${post.description}]]></description>
    </item>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Muhammad Shahid Blog</title>
    <link>${BASE_URL}/blog</link>
    <description>Senior .NET + Angular engineer helping teams design and ship secure healthcare, SaaS, and eCommerce systems — APIs, SPAs, Azure, identity, and clean architecture.</description>
    <language>en-us</language>
    <atom:link href="${BASE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>
`;
}

async function submitIndexNow(urlList) {
  if (!process.env.VERCEL && !process.env.CI && process.env.INDEXNOW !== "1") {
    return;
  }

  try {
    const response = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: "www.muhammadshahid.dev",
        key: INDEXNOW_KEY,
        keyLocation: `${BASE_URL}/${INDEXNOW_KEY}.txt`,
        urlList,
      }),
    });
    console.log(`IndexNow ${response.status} (${urlList.length} URLs).`);
  } catch (error) {
    console.warn(`IndexNow skipped: ${error instanceof Error ? error.message : error}`);
  }
}

const posts = readPosts();
fs.mkdirSync(PUBLIC_DIR, { recursive: true });
fs.writeFileSync(path.join(PUBLIC_DIR, `${INDEXNOW_KEY}.txt`), INDEXNOW_KEY);
fs.writeFileSync(path.join(PUBLIC_DIR, "sitemap.xml"), buildSitemap(posts));
fs.writeFileSync(path.join(PUBLIC_DIR, "rss.xml"), buildRss(posts));
console.log(`Wrote public/sitemap.xml and public/rss.xml (${posts.length} posts).`);

// ---------------------------------------------------------------------------
// IndexNow — submit every URL so Google re-crawls non-indexed / redirect pages.
// The redirect issue (muhammadshahid.dev → www) clears when Google sees the
// correct www canonical via a fresh crawl signal for all affected URLs.
// ---------------------------------------------------------------------------

/** All blog post slugs currently in content/blog/. Keep in sync with the filesystem. */
const ALL_BLOG_SLUGS = [
  // Angular
  "angular-auth-guard-aspnet-core",
  "angular-dotnet-integration",
  "angular-interceptor-401-refresh-queue",
  "angular-interview-questions-aspnet-core",
  "angular-jwt-interceptors",
  "angular-onpush-change-detection",
  "angular-signals-aspnet-core",
  "angular-standalone-components",
  "angular-switchmap-exhaustmap-concatmap",
  // API & Architecture
  "api-design-principles",
  "bff-pattern-aspnet-core-angular-yarp",
  "clean-architecture-aspnet-core",
  "cursor-vs-offset-pagination-aspnet-core",
  "docker-dotnet-angular-local",
  "dotnet-framework-vs-dotnet-core",
  "duende-bff-vs-yarp-custom-bff",
  "freelance-dotnet-project-checklist",
  "modular-monolith-vs-microservices-dotnet",
  "repository-definition-meaning",
  "repository-pattern-dotnet",
  "solid-principles-aspnet-core",
  "swagger-openapi-aspnet-core",
  "vertical-slice-vs-clean-architecture",
  "what-is-an-api",
  // ASP.NET Core
  "aspnet-core-401-vs-403",
  "aspnet-core-api-validation",
  "aspnet-core-api-versioning",
  "aspnet-core-appsettings-localappsettings",
  "aspnet-core-correlation-id",
  "aspnet-core-data-protection-xml-encryptor",
  "aspnet-core-dependency-injection",
  "aspnet-core-forwarded-headers",
  "aspnet-core-global-exception-handling",
  "aspnet-core-headers-readonly-response-started",
  "aspnet-core-health-checks",
  "aspnet-core-idx10501-jwt-kid",
  "aspnet-core-idx10503-jwt-signature",
  "aspnet-core-interview-questions-scenarios",
  "aspnet-core-ioptions-snapshot-monitor",
  "aspnet-core-json-object-cycle",
  "aspnet-core-jwt-auth",
  "aspnet-core-jwt-refresh-token-rotation",
  "aspnet-core-middleware-order",
  "aspnet-core-minimal-apis",
  "aspnet-core-output-caching",
  "aspnet-core-rate-limiting",
  "aspnet-core-rbac-guide",
  "aspnet-core-security-headers",
  "aspnet-core-unable-to-resolve-service",
  "aspnet-core-webapplicationfactory",
  // Async / Threading / C#
  "async-promise-explained",
  "async-vs-sync-programming",
  "asynchronous-class-csharp",
  "asynchronous-meaning-definition",
  "callback-vs-promise-async",
  "csharp-async-await-aspnet-core",
  "csharp-async-await-interview-questions",
  "csharp-asynclocal-vs-threadlocal",
  "csharp-backgroundservice-hosted-service-async",
  "csharp-cancellationtoken-aspnet-core",
  "csharp-channel-producer-consumer",
  "csharp-concurrentdictionary-lock",
  "csharp-configureawait-false-library",
  "csharp-expert-interview-questions",
  "csharp-iasyncenumerable-yield-return",
  "csharp-interlocked-compareexchange",
  "csharp-lock-statement-monitor-mutex",
  "csharp-multithreading-primer",
  "csharp-semaphore-slim-async-lock",
  "csharp-task-run-aspnet-core",
  "csharp-task-vs-thread",
  "csharp-task-whenall-vs-parallel-foreach",
  "csharp-task-yield-ui-thread",
  "csharp-taskcompletionsource-legacy-event",
  "csharp-threadpool-starvation-sync-over-async",
  "deadlock-csharp-explained",
  // C# OOP / Design Patterns
  "csharp-factory-pattern",
  "csharp-nullable-reference-types",
  "csharp-oop-interview-questions",
  "csharp-strategy-pattern",
  // Caching
  "caching-system-dotnet-imemorycache-redis",
  "redis-caching-aspnet-core",
  "redis-connection-error-aspnet-core",
  "what-is-a-cache-miss",
  // EF Core / SQL
  "dapper-vs-ef-core",
  "ef-core-asnotracking-vs-identity-resolution",
  "ef-core-bulk-update-executeupdate",
  "ef-core-cartesian-explosion-multiple-include",
  "ef-core-connection-resiliency",
  "ef-core-global-query-filters-soft-delete",
  "ef-core-interceptors-audit-log",
  "ef-core-interview-questions",
  "ef-core-migrations-production",
  "ef-core-nplus1-include-vs-assplitquery",
  "ef-core-optimistic-concurrency-token",
  "ef-core-relationships",
  "ef-core-second-operation-dbcontext",
  "ef-core-specification-pattern",
  "ef-core-sql-performance",
  "ef-core-sql-server-parameter-sniffing",
  "ef-core-value-conversions-enum",
  "ienumerable-vs-iqueryable-ef-core",
  "sql-server-deadlocks-snapshot-isolation",
  "sql-server-tempdb-contention",
  // Git
  "git-checkout-remote-branch",
  "git-merge-vs-rebase",
  // Identity / Auth
  "entra-id-angular-aspnet-core",
  "idempotency-key-aspnet-core",
  "identityserver-redirect-uri-login-loop",
  "identityserver-vs-aspnet-identity",
  "identityserver4-openiddict-migration-checklist",
  "keyed-services-aspnet-core-fromkeyedservices",
  "linq-interview-questions",
  "mapidentityapi-opaque-token-vs-jwt",
  "mediatr-cqrs-aspnet-core",
  "mediatr-license-wolverine-alternative",
  "refresh-token-httponly-cookie-angular-aspnet-core",
  // Infrastructure
  "azure-app-service-aspnet-core",
  "azure-blob-aspnet-core-uploads",
  "cors-angular-aspnet-core",
  "dotnet-ai-semantic-kernel-aspnet-core",
  "dotnet-interview-questions-answers",
  "edi-x12-parser-csharp-dotnet",
  "ihttpclientfactory-aspnet-core",
  "serilog-pii-redaction-healthcare-aspnet-core",
  "signalr-aspnet-core-realtime",
  "transactional-outbox-ef-core",
  // Angular (new)
  "angular-reactive-forms-validation-problemdetails",
  "angular-ssr-hosted-aspnet-core",
  "ngrx-vs-signals-vs-signalstore-angular",
  // Azure (new)
  "azure-functions-isolated-worker-dotnet-api",
  "azure-key-vault-secrets-aspnet-core",
  "azure-service-bus-aspnet-core",
  "managed-identity-aspnet-core-azure",
  // Security (new)
  "content-security-policy-angular-aspnet-core",
  "owasp-api-security-top-10-aspnet-core",
  "prevent-bola-idor-aspnet-core",
  "stride-threat-modeling-aspnet-core-apis",
  // DevOps (new)
  "github-actions-cicd-aspnet-core-angular",
  // Testing (new)
  "testcontainers-aspnet-core-sql-redis",
  // Architecture / API (new)
  "dotnet-aspire-aspnet-core-angular",
  "grpc-vs-rest-aspnet-core",
  "hangfire-vs-quartz-vs-channel-workers-aspnet-core",
  "hot-chocolate-graphql-aspnet-core",
  "multi-tenancy-aspnet-core-beyond-query-filters",
  "opentelemetry-aspnet-core-traces-metrics-logs",
  "rfc-9457-problem-details-aspnet-core",
];

const ALL_LEARNING_SLUGS_INDEXNOW = [
  "interview-questions",
  "async-concurrency",
  "design-patterns",
  "dependency-injection",
  "authentication",
  "identity",
  "ef-core",
  "cqrs",
  "edi",
  "api-design",
  "caching",
  "architecture",
  "angular",
  "azure",
  "security",
  "devops",
  "testing",
];

const ALL_STATIC_PATHS_INDEXNOW = [
  "",
  "/blog",
  "/work",
  "/about",
  "/contact",
  "/privacy",
  "/services",
];

const PROJECT_SLUGS_INDEXNOW = ["carbazaar", "ecom-net10", "healthcare-saas"];

const indexNowUrls = [
  ...ALL_STATIC_PATHS_INDEXNOW.map((p) => `${BASE_URL}${p}`),
  ...PROJECT_SLUGS_INDEXNOW.map((slug) => `${BASE_URL}/work/${slug}`),
  ...ALL_LEARNING_SLUGS_INDEXNOW.map((slug) => `${BASE_URL}/learning/${slug}`),
  ...ALL_BLOG_SLUGS.map((slug) => `${BASE_URL}/blog/${slug}`),
  `${BASE_URL}/sitemap.xml`,
];

await submitIndexNow(indexNowUrls);

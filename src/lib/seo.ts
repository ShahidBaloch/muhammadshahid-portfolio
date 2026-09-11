import { getHomepagePosts } from "@/lib/posts";
import { siteConfig } from "@/lib/site";

export const personId = `${siteConfig.url}/#person`;

export function personJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": personId,
    name: siteConfig.name,
    url: siteConfig.url,
    image: `${siteConfig.url}/images/profile.png`,
    jobTitle: siteConfig.title,
    email: `mailto:${siteConfig.email}`,
    address: {
      "@type": "PostalAddress",
      addressLocality: "Lahore",
      addressCountry: "PK",
    },
    sameAs: [siteConfig.linkedin, siteConfig.github],
    knowsAbout: [
      "ASP.NET Core",
      "Angular",
      ".NET",
      "Azure",
      "API design",
      "what is an API",
      "repository pattern",
      "C# interview questions",
      "EF Core",
      "Identity and access management",
      "asynchronous programming",
      "deadlock",
      "callback async programming",
      "asynchronous meaning",
      "async vs sync",
      "C# async await",
      "C# multithreading",
      "multithreading",
      "sync over async",
      "Task vs Thread",
      "thread pool starvation",
      "Task.Run vs await",
      "cache miss",
      "Redis caching",
      "IMemoryCache",
    ],
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
    publisher: { "@id": personId },
    inLanguage: "en",
  };
}

export function pageSocial({
  title,
  description,
  path,
  type = "website",
}: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
}) {
  const url = `${siteConfig.url}${path}`;
  return {
    openGraph: {
      type,
      title,
      description,
      url,
      siteName: siteConfig.name,
      locale: "en_US",
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image" as const,
      title,
      description,
      images: ["/opengraph-image"],
    },
  };
}

export function blogJsonLd() {
  const featured = getHomepagePosts(3);
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: `${siteConfig.name} Blog`,
    url: `${siteConfig.url}/blog`,
    description:
      "Original articles from healthcare, SaaS, and eCommerce work. Browse by topic or search the full feed.",
    author: { "@id": personId },
    publisher: { "@id": personId },
    inLanguage: "en",
    blogPost: featured.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      url: `${siteConfig.url}/blog/${post.slug}`,
      datePublished: post.date,
      dateModified: post.updated ?? post.date,
    })),
  };
}

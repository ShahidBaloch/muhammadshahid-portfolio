import { getAllPosts } from "@/lib/posts";
import { services, siteConfig } from "@/lib/site";

export const personId = `${siteConfig.url}/#person`;

export function personJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": personId,
    name: siteConfig.name,
    url: siteConfig.url,
    image: `${siteConfig.url}/images/profile-192.webp`,
    jobTitle: siteConfig.title,
    email: `mailto:${siteConfig.email}`,
    address: {
      "@type": "PostalAddress",
      addressLocality: "Lahore",
      addressCountry: "PK",
    },
    sameAs: [siteConfig.linkedin, siteConfig.github],
    // Real skills only. A list of keyword variants here reads as stuffing to search engines.
    knowsAbout: [
      ".NET",
      "C#",
      "ASP.NET Core",
      "Entity Framework Core",
      "SQL Server",
      "Angular",
      "TypeScript",
      "Azure",
      "API design",
      "Authentication and single sign-on",
      "Asynchronous programming in C#",
      "Redis caching",
      "Software architecture",
      "Domain-driven design",
      "Microservices",
      "Event-driven architecture",
      "OpenTelemetry",
      "Healthcare EDI (X12)",
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

/** Cap JSON-LD size on /blog — full discovery lives in sitemap.xml and RSS. */
export function blogJsonLd(featuredLimit = 20) {
  const posts = getAllPosts().slice(0, featuredLimit);
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
    blogPost: posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      url: `${siteConfig.url}/blog/${post.slug}`,
      datePublished: post.date,
      dateModified: post.updated ?? post.date,
    })),
  };
}
export function servicesJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": `${siteConfig.url}/services#professional-service`,
    name: "Freelance .NET and Angular engineering",
    url: `${siteConfig.url}/services`,
    image: `${siteConfig.url}/images/profile-192.webp`,
    areaServed: ["Remote", "Lahore"],
    provider: { "@id": personId },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Engagements",
      itemListElement: services.map((service) => ({
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: service.title,
          description: service.description,
        },
      })),
    },
  };
}

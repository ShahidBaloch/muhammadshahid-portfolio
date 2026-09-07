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
      "C# interview questions",
      "EF Core",
      "Identity and access management",
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

export function blogJsonLd() {
  const featured = getHomepagePosts(3);
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: `${siteConfig.name} Blog`,
    url: `${siteConfig.url}/blog`,
    description:
      "C# async await interview questions, what an identity server is in ASP.NET Core, the ASP.NET Core config file, and original notes from production healthcare and SaaS work.",
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

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
      "Clean Architecture",
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
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: `${siteConfig.name} Blog`,
    url: `${siteConfig.url}/blog`,
    description:
      "Original articles on ASP.NET Core, Angular, Azure, IdentityServer, EF Core, and C# from production healthcare, SaaS, and marketplace work.",
    author: { "@id": personId },
    publisher: { "@id": personId },
    inLanguage: "en",
  };
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Portrait } from "@/components/Portrait";
import { PostDate } from "@/components/PostDate";
import { MarkdownContent } from "@/components/MarkdownContent";
import { OnThisPage } from "@/components/OnThisPage";
import { getPostH2Headings, getPostOutline } from "@/lib/headings";
import { getPostBySlug, getPostSlugs, getRelatedPosts } from "@/lib/posts";
import { personId } from "@/lib/seo";
import { getLearningTopic, siteConfig } from "@/lib/site";

type PageProps = {
  params: Promise<{ slug: string }>;
};

/** Unknown slugs must 404 at the edge — not 200 with not-found HTML (soft 404). */
export const dynamicParams = false;

export function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const post = getPostBySlug(slug);
    const modified = post.updated ?? post.date;
    return {
      title: post.title,
      description: post.description,
      keywords: post.tags,
      authors: [{ name: siteConfig.name, url: siteConfig.url }],
      alternates: { canonical: `/blog/${post.slug}` },
      openGraph: {
        type: "article",
        title: post.title,
        description: post.description,
        publishedTime: post.date,
        modifiedTime: modified,
        url: `${siteConfig.url}/blog/${post.slug}`,
        images: [
          {
            url: `/blog/${post.slug}/opengraph-image`,
            width: 1200,
            height: 630,
            alt: post.title,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: post.title,
        description: post.description,
        images: [`/blog/${post.slug}/opengraph-image`],
      },
    };
  } catch {
    return { title: "Post not found" };
  }
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const slugs = getPostSlugs();
  if (!slugs.includes(slug)) {
    notFound();
  }

  const post = getPostBySlug(slug);
  const related = getRelatedPosts(slug, 5);
  const headings = getPostH2Headings(post.content);
  const outline = getPostOutline(post.content);
  const learningTopic = post.category ? getLearningTopic(post.category) : undefined;
  const pageUrl = `${siteConfig.url}/blog/${post.slug}`;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    url: pageUrl,
    image: [`${siteConfig.url}/blog/${post.slug}/opengraph-image`],
    author: { "@id": personId },
    publisher: { "@id": personId },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": pageUrl,
    },
    keywords: post.tags.join(", "),
    inLanguage: "en",
    ...(headings.length > 0
      ? {
          hasPart: headings.map((heading) => ({
            "@type": "WebPageElement",
            name: heading.text,
            url: `${pageUrl}#${heading.id}`,
          })),
        }
      : {}),
  };

  const faqJsonLd =
    post.faq && post.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: post.faq.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: {
              "@type": "Answer",
              text: item.a,
            },
          })),
        }
      : null;

  const breadcrumbItems = [
    { name: "Home", item: siteConfig.url },
    { name: "Blog", item: `${siteConfig.url}/blog` },
  ];
  if (learningTopic) {
    breadcrumbItems.push({
      name: learningTopic.label,
      item: `${siteConfig.url}/learning/${learningTopic.slug}`,
    });
  }
  breadcrumbItems.push({
    name: post.title,
    item: pageUrl,
  });

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.item,
    })),
  };

  return (
    <article className="reading-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {faqJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      ) : null}
      <div className="container-narrow reading-surface content-width">
        <nav className="text-sm text-muted" aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href="/" className="hover:text-link">
                Home
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href="/blog" className="hover:text-link">
                Blog
              </Link>
            </li>
            {learningTopic ? (
              <>
                <li aria-hidden>/</li>
                <li>
                  <Link href={`/learning/${learningTopic.slug}`} className="hover:text-link">
                    {learningTopic.label}
                  </Link>
                </li>
              </>
            ) : null}
            <li aria-hidden>/</li>
            <li aria-current="page" className="text-ink">
              <span className="line-clamp-1">{post.title}</span>
            </li>
          </ol>
        </nav>
        <header className="mt-4 border-b border-slate-line pb-6">
          <PostDate
            date={post.date}
            updated={post.updated}
            readingTime={post.readingTime}
            byline={`By ${siteConfig.name}`}
          />
          <h1 className="heading-page mt-3 lg:text-[2.85rem]">
            {post.title}
          </h1>
          <p className="mt-4 text-lg text-muted">{post.description}</p>
          {learningTopic ? (
            <p className="mt-4 text-sm text-muted">
              Part of{" "}
              <Link
                href={`/learning/${learningTopic.slug}`}
                className="font-semibold link-underline"
              >
                {learningTopic.label}
              </Link>
            </p>
          ) : null}
        </header>

        {post.faq && post.faq.length > 5 ? (
          <p className="mt-6 text-sm">
            <a href="#article-body" className="font-semibold link-underline">
              Skip to article
              <span className="sr-only"> (bypass quick answers)</span>
            </a>
          </p>
        ) : null}

        {post.faq && post.faq.length > 0 ? (
          <section className="card-panel mt-6 rounded-xl p-5 sm:p-6" aria-labelledby="quick-answers">
            <h2 id="quick-answers" className="heading-subsection">
              Quick answers
            </h2>
            <dl className="mt-4 space-y-4">
              {post.faq.map((item) => (
                <div key={item.q}>
                  <dt className="font-semibold text-ink">{item.q}</dt>
                  <dd className="mt-1 text-muted">{item.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <div className="mt-6 lg:grid lg:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)] lg:items-start lg:gap-10">
          <OnThisPage sections={outline} />

          <div id="article-body" className="prose-site mt-7 min-w-0 sm:prose-lg lg:mt-0" tabIndex={-1}>
            <MarkdownContent content={post.content} />
          </div>
        </div>

        <aside className="card-panel mt-8 rounded-xl p-5 sm:p-6">
          <p className="eyebrow">About the author</p>
          <div className="mt-4 flex items-start gap-4">
            <Portrait />
            <div>
              <p className="font-display text-xl font-semibold text-ink">{siteConfig.name}</p>
              <p className="mt-2 text-muted">
                {siteConfig.title}. {siteConfig.tagline} Based in {siteConfig.location}.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link href="/about" className="btn-secondary !py-2 !text-xs">
                  About
                </Link>
                <a
                  href={siteConfig.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary !py-2 !text-xs"
                >
                  LinkedIn
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
                <a
                  href={siteConfig.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary !py-2 !text-xs"
                >
                  GitHub
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
                <Link href="/contact" className="btn-primary !py-2 !text-xs">
                  Contact
                </Link>
              </div>
            </div>
          </div>
        </aside>

        {related.length > 0 ? (
          <aside className="mt-8 border-t border-slate-line pt-6">
            <h2 className="heading-subsection">More reading</h2>
            <ul className="mt-4 space-y-3">
              {related.map((item) => (
                <li key={item.slug}>
                  <Link href={`/blog/${item.slug}`} className="font-medium link-underline">
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>
    </article>
  );
}

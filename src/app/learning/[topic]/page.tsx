import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PostDate } from "@/components/PostDate";
import { SectionHeading } from "@/components/SectionHeading";
import { MarkdownContent } from "@/components/MarkdownContent";
import { slugifyHeading } from "@/lib/headings";
import { getPostsForTopic } from "@/lib/posts";
import { pageSocial, personId } from "@/lib/seo";
import { getLearningTopic, learningTopics, siteConfig } from "@/lib/site";

type PageProps = {
  params: Promise<{ topic: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return learningTopics.map((topic) => ({ topic: topic.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { topic: topicSlug } = await params;
  const topic = getLearningTopic(topicSlug);
  if (!topic) {
    return { title: "Topic not found" };
  }

  const path = `/learning/${topic.slug}`;
  return {
    title: topic.title,
    description: topic.description,
    ...(topic.keywords && topic.keywords.length > 0 ? { keywords: topic.keywords } : {}),
    authors: [{ name: siteConfig.name, url: siteConfig.url }],
    alternates: { canonical: path },
    ...pageSocial({
      title: topic.title,
      description: topic.description,
      path,
    }),
  };
}

function faqAnswerPlainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1");
}

function newestPostDate(posts: { date: string; updated?: string }[]): string | undefined {
  if (posts.length === 0) return undefined;
  return posts.reduce((latest, post) => {
    const value = post.updated ?? post.date;
    return value > latest ? value : latest;
  }, posts[0].updated ?? posts[0].date);
}

export default async function LearningTopicPage({ params }: PageProps) {
  const { topic: topicSlug } = await params;
  const topic = getLearningTopic(topicSlug);
  if (!topic) {
    notFound();
  }

  const posts = getPostsForTopic(topic);
  const pageUrl = `${siteConfig.url}/learning/${topic.slug}`;
  const dateModified = newestPostDate(posts);
  const relatedTopics = (topic.relatedTopicSlugs ?? [])
    .map((slug) => getLearningTopic(slug))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: topic.title,
    description: topic.description,
    url: pageUrl,
    ...(dateModified ? { dateModified } : {}),
    isPartOf: {
      "@type": "Blog",
      "@id": `${siteConfig.url}/blog`,
      name: `${siteConfig.name} Blog`,
    },
    publisher: { "@id": personId },
    inLanguage: "en",
    hasPart: posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      url: `${siteConfig.url}/blog/${post.slug}`,
      datePublished: post.date,
      dateModified: post.updated ?? post.date,
      author: { "@id": personId },
    })),
  };
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: topic.title,
    itemListElement: posts.map((post, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${siteConfig.url}/blog/${post.slug}`,
      name: post.title,
    })),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteConfig.url },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${siteConfig.url}/blog` },
      { "@type": "ListItem", position: 3, name: "Topics", item: `${siteConfig.url}/learning` },
      { "@type": "ListItem", position: 4, name: topic.label, item: pageUrl },
    ],
  };
  const faqJsonLd =
    topic.faq && topic.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: topic.faq.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: {
              "@type": "Answer",
              text: faqAnswerPlainText(item.a),
            },
          })),
        }
      : null;

  return (
    <section className="section-pad pt-28 sm:pt-32">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
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
      <div className="container-narrow">
        <nav className="text-sm text-muted" aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href="/" className="hover:text-teal">
                Home
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href="/blog" className="hover:text-teal">
                Blog
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href="/learning" className="hover:text-teal">
                Topics
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="text-ink">
              {topic.label}
            </li>
          </ol>
        </nav>

        <div className="mt-6">
          <SectionHeading
            eyebrow="Blog topic"
            title={topic.title}
            description={topic.description}
            level={1}
          />
        </div>

        <div className="prose-site mt-8 max-w-3xl text-lg leading-relaxed text-muted">
          <MarkdownContent content={topic.intro} />
        </div>

        {relatedTopics.length > 0 ? (
          <p className="mt-4 max-w-3xl text-muted">
            Related:{" "}
            {relatedTopics.map((item, index) => (
              <span key={item.slug}>
                {index > 0 ? " · " : null}
                <Link href={`/learning/${item.slug}`} className="font-medium text-teal link-underline">
                  {item.label}
                </Link>
              </span>
            ))}
          </p>
        ) : null}

        {topic.faq && topic.faq.length > 0 ? (
          <section className="mt-8 max-w-3xl rounded-xl border border-slate-line bg-mist p-5 sm:p-6" aria-labelledby="quick-answers">
            <h2 id="quick-answers" className="font-display text-xl font-semibold text-ink">
              Quick answers
            </h2>
            <dl className="mt-4 space-y-4">
              {topic.faq.map((item) => (
                <div key={item.q}>
                  <dt className="font-semibold text-ink">{item.q}</dt>
                  <dd className="prose-site mt-1 text-muted">
                    <MarkdownContent content={item.a} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {topic.tracks && topic.tracks.length > 0 ? (
          <nav className="mt-10 max-w-3xl" aria-label="Start here">
            {topic.tracks.map((track) => {
              const items = track.slugs
                .map((slug) => posts.find((post) => post.slug === slug))
                .filter((post): post is (typeof posts)[number] => Boolean(post));
              if (items.length === 0) return null;
              const headingId = slugifyHeading(track.title);
              return (
                <section key={track.title} className="mt-8 first:mt-0">
                  <h2 id={headingId} className="scroll-mt-28 font-display text-xl font-semibold text-ink">
                    {track.title}
                  </h2>
                  {track.blurb ? <p className="mt-2 text-muted">{track.blurb}</p> : null}
                  <ul className="mt-3 list-disc space-y-2 pl-5">
                    {items.map((post) => (
                      <li key={post.slug} className="text-muted">
                        <Link href={`/blog/${post.slug}`} className="font-medium text-teal link-underline">
                          {post.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </nav>
        ) : null}

        <nav className="mt-8 flex flex-wrap gap-2" aria-label="Blog topics">
          {learningTopics.map((item) => (
            <Link
              key={item.slug}
              href={`/learning/${item.slug}`}
              className={`rounded border px-3 py-1.5 text-sm transition ${
                item.slug === topic.slug
                  ? "chip-active"
                  : "border-slate-line text-muted hover:border-teal hover:text-ink"
              }`}
              aria-current={item.slug === topic.slug ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {posts.length === 0 ? (
          <p className="mt-12 py-10 text-muted">Articles for this track are coming soon.</p>
        ) : (
          <div className="mt-12">
            <h2 className="font-display text-2xl font-semibold text-ink">
              All {topic.label} articles
            </h2>
            <div className="mt-6 divide-y divide-slate-line border-y border-slate-line">
              {posts.map((post) => (
                <article key={post.slug} className="py-8">
                  <PostDate date={post.date} updated={post.updated} readingTime={post.readingTime} />
                  <h3 className="mt-2 font-display text-2xl font-semibold text-ink sm:text-3xl">
                    <Link href={`/blog/${post.slug}`} className="hover:text-teal">
                      {post.title}
                    </Link>
                  </h3>
                  <p className="mt-3 max-w-2xl text-muted">{post.description}</p>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

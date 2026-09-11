import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { PostDate } from "@/components/PostDate";
import { SectionHeading } from "@/components/SectionHeading";
import { MarkdownContent } from "@/components/MarkdownContent";
import { slugifyHeading } from "@/lib/headings";
import { getPostsForTopic } from "@/lib/posts";
import { getLearningTopicBody } from "@/lib/learning";
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
  const topicBody = getLearningTopicBody(topic.slug);
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
    <section className="reading-page">
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
            <li aria-hidden>/</li>
            <li>
              <Link href="/learning" className="hover:text-link">
                Topics
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="text-ink">
              {topic.label}
            </li>
          </ol>
        </nav>

        <div className="mt-4">
          <SectionHeading
            eyebrow={topic.compactHub ? "Learning hub" : "Blog topic"}
            title={topic.title}
            description={topic.description}
            level={1}
          />
        </div>

        {topic.intro ? (
          <div className="prose-site reading-surface mt-8 content-width rounded-xl text-lg leading-relaxed">
            <MarkdownContent content={topic.intro} />
          </div>
        ) : null}

        {topic.compactHub
          ? (() => {
              const bodyBlock = topicBody ? (
                <div
                  className={`prose-site reading-surface content-width rounded-xl ${
                    topic.intro ? "mt-7 border-t border-slate-line pt-7" : "mt-6"
                  }`}
                >
                  <MarkdownContent content={topicBody} />
                </div>
              ) : null;

              const startHereBlock =
                posts[0] && !topic.bodyFirst ? (
                  <div className={`content-width ${topic.bodyFirst ? "mt-7" : "mt-6"}`}>
                    <Link
                      href={`/blog/${posts[0].slug}`}
                      className="card-highlight group block rounded-xl p-5 sm:p-6"
                    >
                      <p className="text-sm font-semibold uppercase tracking-wide text-link">Start here</p>
                      <h2 className="heading-subsection mt-2 group-hover:text-link">
                        {posts[0].title}
                      </h2>
                      <p className="mt-2 text-muted">{posts[0].description}</p>
                      <div className="mt-3">
                        <PostDate
                          date={posts[0].date}
                          updated={posts[0].updated}
                          readingTime={posts[0].readingTime}
                        />
                      </div>
                    </Link>
                  </div>
                ) : null;

              const calloutsBlock =
                topic.hubCallouts && topic.hubCallouts.length > 0 ? (
                  <div className="mt-6 content-width space-y-3" aria-label="Interactive checks">
                    <p className="text-sm font-semibold uppercase tracking-wide text-muted">
                      Try it — tap to reveal
                    </p>
                    {topic.hubCallouts.map((item) => (
                      <details
                        key={item.title}
                        className="card-callout group rounded-xl open:border-link/40"
                      >
                        <summary className="cursor-pointer list-none px-4 py-3 font-semibold text-ink marker:content-none hover:text-link [&::-webkit-details-marker]:hidden">
                          {item.title}
                        </summary>
                        <div className="prose-site border-t border-slate-line px-4 pb-4 pt-3 text-muted">
                          <MarkdownContent content={item.content} />
                        </div>
                      </details>
                    ))}
                  </div>
                ) : null;

              const pathsBlock =
                topic.hubPaths && topic.hubPaths.length > 0 ? (
                  <nav
                    className="mt-6 grid content-width gap-3 sm:grid-cols-2 lg:grid-cols-4"
                    aria-label="Pick your path"
                  >
                    {topic.hubPaths.map((path) => {
                      const className =
                        "card-feature group block rounded-xl p-4 sm:p-5";
                      const content = (
                        <>
                          <p className="font-display font-semibold text-ink group-hover:text-link">
                            {path.label}
                          </p>
                          <p className="mt-1 text-sm text-muted">{path.description}</p>
                        </>
                      );
                      return path.href.startsWith("#") ? (
                        <a key={path.label} href={path.href} className={className}>
                          {content}
                        </a>
                      ) : (
                        <Link key={path.label} href={path.href} className={className}>
                          {content}
                        </Link>
                      );
                    })}
                  </nav>
                ) : null;

              const jumpNavBlock =
                topic.tracks && topic.tracks.length > 1 ? (
                  <nav
                    className="mt-6 content-width border-t border-slate-line pt-6"
                    aria-label="Jump to track"
                  >
                    <p className="text-sm font-semibold uppercase tracking-wide text-muted">
                      All tracks
                    </p>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {topic.tracks.map((track) => (
                        <li key={track.title}>
                          <a
                            href={`#${slugifyHeading(track.title)}`}
                            className="rounded-full border border-slate-line px-3 py-1.5 text-sm text-muted transition hover:border-link hover:text-link"
                          >
                            {track.shortTitle ?? track.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </nav>
                ) : null;

              const tracksBlock =
                topic.tracks && topic.tracks.length > 0 ? (
                  <nav className="mt-6 content-width" aria-label={`${topic.label} tracks`}>
                    {topic.tracks.map((track) => {
                      const items = track.slugs
                        .map((slug) => posts.find((post) => post.slug === slug))
                        .filter((post): post is (typeof posts)[number] => Boolean(post));
                      if (items.length === 0) return null;
                      const headingId = slugifyHeading(track.title);
                      return (
                        <section key={track.title} className="mt-7 first:mt-0">
                          <h2 id={headingId} className="heading-subsection scroll-mt-28">
                            {track.title}
                            <span className="ml-2 text-sm font-normal text-muted">
                              · {items.length} article{items.length === 1 ? "" : "s"}
                            </span>
                          </h2>
                          {track.blurb ? (
                            <div className="prose-site mt-2 max-w-none text-sm text-muted">
                              <MarkdownContent content={track.blurb} />
                            </div>
                          ) : null}
                          <ul className="mt-4 space-y-3">
                            {items.map((post) => (
                              <li key={post.slug}>
                                <Link
                                  href={`/blog/${post.slug}`}
                                  className="card-feature group block rounded-xl p-4 sm:p-5"
                                >
                                  <h3 className="heading-card font-semibold group-hover:text-link">
                                    {post.title}
                                  </h3>
                                  <p className="mt-2 text-sm text-muted">{post.description}</p>
                                  <div className="mt-3">
                                    <PostDate
                                      date={post.date}
                                      updated={post.updated}
                                      readingTime={post.readingTime}
                                    />
                                  </div>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </section>
                      );
                    })}
                  </nav>
                ) : null;

              const relatedBlock =
                relatedTopics.length > 0 ? (
                  <p className="mt-6 content-width text-sm text-muted">
                    Related:{" "}
                    {relatedTopics.map((item, index) => (
                      <span key={item.slug}>
                        {index > 0 ? " · " : null}
                        <Link href={`/learning/${item.slug}`} className="font-medium link-underline">
                          {item.label}
                        </Link>
                      </span>
                    ))}
                  </p>
                ) : null;

              const hubSections = topic.bodyFirst
                ? [
                    { key: "body", node: bodyBlock },
                    { key: "callouts", node: calloutsBlock },
                    { key: "paths", node: pathsBlock },
                    { key: "jump-nav", node: jumpNavBlock },
                    { key: "tracks", node: tracksBlock },
                    { key: "related", node: relatedBlock },
                  ]
                : [
                    { key: "start-here", node: startHereBlock },
                    { key: "callouts", node: calloutsBlock },
                    { key: "paths", node: pathsBlock },
                    { key: "jump-nav", node: jumpNavBlock },
                    { key: "tracks", node: tracksBlock },
                    { key: "related", node: relatedBlock },
                    { key: "body", node: bodyBlock },
                  ];

              return hubSections
                .filter((section) => section.node != null)
                .map(({ key, node }) => <Fragment key={key}>{node}</Fragment>);
            })()
          : null}

        {!topic.compactHub && topicBody ? (
          <div
            className={`prose-site reading-surface content-width rounded-xl ${
              topic.intro || topic.tracks?.length ? "mt-7 border-t border-slate-line pt-7" : "mt-6"
            }`}
          >
            <MarkdownContent content={topicBody} />
          </div>
        ) : null}

        {!topic.compactHub && topic.tracks && topic.tracks.length > 0 ? (
          <nav className="mt-7 content-width" aria-label="Start here">
            {topic.tracks.map((track) => {
              const items = track.slugs
                .map((slug) => posts.find((post) => post.slug === slug))
                .filter((post): post is (typeof posts)[number] => Boolean(post));
              if (items.length === 0) return null;
              const headingId = slugifyHeading(track.title);
              return (
                <section key={track.title} className="mt-6 first:mt-0">
                  <h2 id={headingId} className="heading-subsection scroll-mt-28">
                    {track.title}
                  </h2>
                  {track.blurb ? <p className="mt-2 text-muted">{track.blurb}</p> : null}
                  <ul className="mt-3 list-disc space-y-2 pl-5">
                    {items.map((post) => (
                      <li key={post.slug} className="text-muted">
                        <Link href={`/blog/${post.slug}`} className="font-medium link-underline">
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

        {!topic.compactHub && relatedTopics.length > 0 ? (
          <p className="mt-4 content-width text-muted">
            Related:{" "}
            {relatedTopics.map((item, index) => (
              <span key={item.slug}>
                {index > 0 ? " · " : null}
                <Link href={`/learning/${item.slug}`} className="font-medium link-underline">
                  {item.label}
                </Link>
              </span>
            ))}
          </p>
        ) : null}

        {topic.faq && topic.faq.length > 0 ? (
          <section
            className={`card-panel content-width rounded-xl p-5 sm:p-6 ${
              topic.compactHub ? "mt-7" : "mt-6"
            }`}
            aria-labelledby="quick-answers"
          >
            <h2 id="quick-answers" className="heading-subsection">
              Quick answers
            </h2>
            {topic.compactHub ? (
              <div className="mt-4 divide-y divide-slate-line">
                {topic.faq.map((item) => (
                  <details key={item.q} className="group py-3 first:pt-0 last:pb-0">
                    <summary className="cursor-pointer list-none font-semibold text-ink marker:content-none [&::-webkit-details-marker]:hidden">
                      {item.q}
                    </summary>
                    <div className="prose-site mt-2 text-muted">
                      <MarkdownContent content={item.a} />
                    </div>
                  </details>
                ))}
              </div>
            ) : (
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
            )}
          </section>
        ) : null}

        {!topic.compactHub ? (
          <nav className="mt-8 flex flex-wrap gap-2" aria-label="Blog topics">
            {learningTopics.map((item) => (
              <Link
                key={item.slug}
                href={`/learning/${item.slug}`}
                className={`rounded border px-3 py-1.5 text-sm transition ${
                  item.slug === topic.slug
                    ? "chip-active"
                    : "border-slate-line text-muted hover:border-link hover:text-ink"
                }`}
                aria-current={item.slug === topic.slug ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}

        {!topic.compactHub && posts.length === 0 ? (
          <p className="mt-8 py-6 text-muted">Articles for this track are coming soon.</p>
        ) : !topic.compactHub ? (
          <div className="mt-8">
            <h2 className="heading-section">
              All {topic.label} articles
            </h2>
            <div className="mt-6 divide-y divide-slate-line border-y border-slate-line">
              {posts.map((post) => (
                <article key={post.slug} className="py-5 sm:py-6">
                  <PostDate date={post.date} updated={post.updated} readingTime={post.readingTime} />
                  <h3 className="heading-subsection mt-2 sm:text-[1.65rem]">
                    <Link href={`/blog/${post.slug}`} className="hover:text-link">
                      {post.title}
                    </Link>
                  </h3>
                  <p className="mt-3 max-w-2xl text-muted">{post.description}</p>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getPostBySlug, getPostSlugs, getRelatedPosts } from "@/lib/posts";
import { getLearningTopic, siteConfig } from "@/lib/site";

type PageProps = {
  params: Promise<{ slug: string }>;
};

const ogImage = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: `${siteConfig.name} — ${siteConfig.title}`,
};

export function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const post = getPostBySlug(slug);
    return {
      title: post.title,
      description: post.description,
      alternates: { canonical: `/blog/${post.slug}` },
      openGraph: {
        type: "article",
        title: post.title,
        description: post.description,
        publishedTime: post.date,
        url: `${siteConfig.url}/blog/${post.slug}`,
        images: [ogImage],
      },
      twitter: {
        card: "summary_large_image",
        title: post.title,
        description: post.description,
        images: [ogImage.url],
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
  const related = getRelatedPosts(slug, 3);
  const learningTopic = post.category ? getLearningTopic(post.category) : undefined;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    url: `${siteConfig.url}/blog/${post.slug}`,
    image: [`${siteConfig.url}/opengraph-image`],
    author: {
      "@type": "Person",
      name: siteConfig.name,
      url: siteConfig.url,
    },
    publisher: {
      "@type": "Person",
      name: siteConfig.name,
      url: siteConfig.url,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${siteConfig.url}/blog/${post.slug}`,
    },
    keywords: post.tags.join(", "),
  };

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
    item: `${siteConfig.url}/blog/${post.slug}`,
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
    <article className="section-pad pt-28 sm:pt-32">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="container-narrow max-w-3xl">
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
            {learningTopic ? (
              <>
                <li aria-hidden>/</li>
                <li>
                  <Link href={`/learning/${learningTopic.slug}`} className="hover:text-teal">
                    {learningTopic.label}
                  </Link>
                </li>
              </>
            ) : null}
          </ol>
        </nav>
        <header className="mt-6 border-b border-slate-line pb-8">
          <p className="text-sm text-muted">
            <time dateTime={post.date}>
              {new Date(post.date).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
            <span aria-hidden> · </span>
            {post.readingTime}
            <span aria-hidden> · </span>
            By {siteConfig.name}
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl text-balance">
            {post.title}
          </h1>
          <p className="mt-4 text-lg text-muted">{post.description}</p>
          {learningTopic ? (
            <p className="mt-4 text-sm text-muted">
              Part of{" "}
              <Link
                href={`/learning/${learningTopic.slug}`}
                className="font-semibold text-teal link-underline"
              >
                {learningTopic.label}
              </Link>
            </p>
          ) : null}
        </header>

        <div className="prose prose-lg mt-10 max-w-none prose-headings:font-display prose-headings:tracking-tight prose-headings:text-ink prose-p:text-muted prose-li:text-muted prose-a:text-teal prose-strong:text-ink">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
        </div>

        <aside className="mt-14 rounded-2xl border border-slate-line bg-mist/60 p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal">About the author</p>
          <p className="mt-3 font-display text-xl font-semibold text-ink">{siteConfig.name}</p>
          <p className="mt-2 text-muted">
            {siteConfig.title}. {siteConfig.tagline} Based in {siteConfig.location}.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/about" className="btn-secondary !py-2 !text-xs">
              About
            </Link>
            <Link href="/contact" className="btn-primary !py-2 !text-xs">
              Contact
            </Link>
          </div>
        </aside>

        {related.length > 0 ? (
          <aside className="mt-16 border-t border-slate-line pt-10">
            <h2 className="font-display text-xl font-semibold text-ink">More reading</h2>
            <ul className="mt-4 space-y-3">
              {related.map((item) => (
                <li key={item.slug}>
                  <Link href={`/blog/${item.slug}`} className="font-medium text-teal link-underline">
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

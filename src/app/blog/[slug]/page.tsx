import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getAllPosts, getPostBySlug, getPostSlugs } from "@/lib/posts";
import { siteConfig } from "@/lib/site";

type PageProps = {
  params: Promise<{ slug: string }>;
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
  const related = getAllPosts()
    .filter((item) => item.slug !== slug)
    .slice(0, 2);

  return (
    <article className="section-pad pt-28 sm:pt-32">
      <div className="container-narrow max-w-3xl">
        <Link href="/blog" className="text-sm font-semibold text-teal link-underline">
          ← All posts
        </Link>
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
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl text-balance">
            {post.title}
          </h1>
          <p className="mt-4 text-lg text-muted">{post.description}</p>
        </header>

        <div className="prose prose-lg mt-10 max-w-none prose-headings:font-display prose-headings:tracking-tight prose-headings:text-ink prose-p:text-muted prose-li:text-muted prose-a:text-teal prose-strong:text-ink">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
        </div>

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

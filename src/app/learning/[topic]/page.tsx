import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeading } from "@/components/SectionHeading";
import { getPostsForTopic } from "@/lib/posts";
import { getLearningTopic, learningTopics } from "@/lib/site";

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

  return {
    title: `${topic.title} | Blog Topics`,
    description: topic.description,
    alternates: { canonical: `/learning/${topic.slug}` },
  };
}

export default async function LearningTopicPage({ params }: PageProps) {
  const { topic: topicSlug } = await params;
  const topic = getLearningTopic(topicSlug);
  if (!topic) {
    notFound();
  }

  const posts = getPostsForTopic(topic);

  return (
    <section className="section-pad pt-28 sm:pt-32">
      <div className="container-narrow">
        <Link href="/blog" className="text-sm font-semibold text-teal link-underline">
          ← All articles
        </Link>

        <div className="mt-6">
          <SectionHeading
            eyebrow="Blog topic"
            title={topic.title}
            description={topic.description}
            level={1}
          />
        </div>

        <p className="mt-8 max-w-3xl text-lg leading-relaxed text-muted">{topic.intro}</p>

        <nav className="mt-8 flex flex-wrap gap-2" aria-label="Blog topics">
          {learningTopics.map((item) => (
            <Link
              key={item.slug}
              href={`/learning/${item.slug}`}
              className={`rounded border px-3 py-1.5 text-sm transition ${
                item.slug === topic.slug
                  ? "border-ink bg-ink text-white"
                  : "border-slate-line text-muted hover:border-ink hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-12 divide-y divide-slate-line border-y border-slate-line">
          {posts.length === 0 ? (
            <p className="py-10 text-muted">Articles for this track are coming soon.</p>
          ) : (
            posts.map((post) => (
              <article key={post.slug} className="py-8">
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
                <h2 className="mt-2 font-display text-2xl font-semibold text-ink sm:text-3xl">
                  <Link href={`/blog/${post.slug}`} className="hover:text-teal">
                    {post.title}
                  </Link>
                </h2>
                <p className="mt-3 max-w-2xl text-muted">{post.description}</p>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

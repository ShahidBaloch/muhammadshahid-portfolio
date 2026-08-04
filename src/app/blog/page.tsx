import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeading } from "@/components/SectionHeading";
import { getAllPosts, getPostsForTopic } from "@/lib/posts";
import { learningTopics } from "@/lib/site";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Practical articles on ASP.NET Core, Angular, Azure, C# design patterns, dependency injection, and architecture by Muhammad Shahid.",
  alternates: { canonical: "/blog" },
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <section className="section-pad pt-28 sm:pt-32">
      <div className="container-narrow">
        <SectionHeading
          eyebrow="Blog"
          title="Notes on .NET, Angular, and shipping software."
          description="Original articles from production work. Browse by topic when you want a guided path — or scroll the full feed below."
          level={1}
        />

        <div className="mt-10">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal">Browse by topic</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {learningTopics.map((topic) => {
              const count = getPostsForTopic(topic).length;
              return (
                <Link
                  key={topic.slug}
                  href={`/learning/${topic.slug}`}
                  className="surface surface-hover rounded-xl p-5 transition hover:border-teal/40"
                >
                  <h2 className="font-display text-lg font-semibold text-ink">{topic.label}</h2>
                  <p className="mt-2 line-clamp-2 text-sm text-muted">{topic.description}</p>
                  <p className="mt-3 text-sm font-semibold text-teal">
                    {count} article{count === 1 ? "" : "s"} →
                  </p>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mt-14">
          <h2 className="font-display text-2xl font-semibold text-ink">All articles</h2>
          <div className="mt-6 divide-y divide-slate-line border-y border-slate-line">
            {posts.map((post) => (
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
                <h3 className="mt-2 font-display text-2xl font-semibold text-[inherit] sm:text-3xl">
                  <Link href={`/blog/${post.slug}`} className="hover:text-teal">
                    {post.title}
                  </Link>
                </h3>
                <p className="mt-3 max-w-2xl text-muted">{post.description}</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <li
                      key={tag}
                      className="rounded border border-slate-line bg-mist px-2.5 py-1 font-mono text-xs text-ink-soft"
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

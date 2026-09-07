import type { Metadata } from "next";
import Link from "next/link";
import { BlogFeed } from "@/components/BlogFeed";
import { SectionHeading } from "@/components/SectionHeading";
import { getAllPosts, getHomepagePosts, getPostsForTopic } from "@/lib/posts";
import { blogJsonLd, pageSocial } from "@/lib/seo";
import { learningTopics } from "@/lib/site";

const title = "Notes from .NET and Angular production work";
const description =
  "Original articles from healthcare, SaaS, and eCommerce work. Browse by topic or search the full feed.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/blog" },
  ...pageSocial({ title, description, path: "/blog" }),
};

export default function BlogPage() {
  const posts = getAllPosts();
  const startHere = getHomepagePosts(3);

  return (
    <section className="section-pad pt-28 sm:pt-32">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogJsonLd()) }}
      />
      <div className="container-narrow">
        <SectionHeading
          eyebrow="Blog"
          title={title}
          description="Original articles from production work. Browse by topic when you want a guided path — or filter the feed below."
          level={1}
        />

        <div className="mt-10">
          <p className="eyebrow">Start here</p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-ink">
            Pages people already find in Google
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            C# async/await interview questions, what an identity server is in ASP.NET Core, and the
            ASP.NET Core config file — the queries this site already ranks for.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {startHere.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="surface surface-hover rounded-xl p-5 transition hover:border-ink"
              >
                <h3 className="font-display text-lg font-semibold text-ink">{post.title}</h3>
                <p className="mt-2 line-clamp-3 text-sm text-muted">{post.description}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-10">
          <p className="eyebrow">Browse by topic</p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-ink">Topic hubs</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {learningTopics.map((topic) => {
              const count = getPostsForTopic(topic).length;
              return (
                <Link
                  key={topic.slug}
                  href={`/learning/${topic.slug}`}
                  className="surface surface-hover rounded-xl p-5 transition hover:border-ink"
                >
                  <h3 className="font-display text-lg font-semibold text-ink">{topic.label}</h3>
                  <p className="mt-2 line-clamp-2 text-sm text-muted">{topic.description}</p>
                  <p className="mt-3 text-sm font-semibold text-teal">
                    {count} article{count === 1 ? "" : "s"} →
                  </p>
                </Link>
              );
            })}
          </div>
        </div>

        <BlogFeed posts={posts} />
      </div>
    </section>
  );
}

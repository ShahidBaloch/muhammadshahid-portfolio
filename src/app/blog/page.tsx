import type { Metadata } from "next";
import Link from "next/link";
import { BlogFeed } from "@/components/BlogFeed";
import { SectionHeading } from "@/components/SectionHeading";
import { getAllPosts, getHomepagePosts, getPostsForTopic } from "@/lib/posts";
import { blogJsonLd } from "@/lib/seo";
import { learningTopics } from "@/lib/site";

export const metadata: Metadata = {
  title: "C# Interview Questions, IdentityServer, ASP.NET Core",
  description:
    "C# async await interview questions, what an identity server is in ASP.NET Core, the ASP.NET Core config file, and original notes from production healthcare and SaaS work.",
  alternates: { canonical: "/blog" },
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
          title="Notes on .NET, Angular, and shipping software."
          description="Original articles from production work. Browse by topic when you want a guided path — or filter the feed below."
          level={1}
        />

        <div className="mt-10">
          <p className="eyebrow">Start here</p>
          <p className="mt-3 font-display text-2xl font-semibold text-ink">
            Pages people already find in Google
          </p>
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
                <h2 className="font-display text-lg font-semibold text-ink">{post.title}</h2>
                <p className="mt-2 line-clamp-3 text-sm text-muted">{post.description}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-10">
          <p className="eyebrow">Browse by topic</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {learningTopics.map((topic) => {
              const count = getPostsForTopic(topic).length;
              return (
                <Link
                  key={topic.slug}
                  href={`/learning/${topic.slug}`}
                  className="surface surface-hover rounded-xl p-5 transition hover:border-ink"
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

        <BlogFeed posts={posts} />
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { BlogFeed } from "@/components/BlogFeed";
import { SectionHeading } from "@/components/SectionHeading";
import { getAllPosts, getPostsForTopic } from "@/lib/posts";
import { blogJsonLd } from "@/lib/seo";
import { learningTopics } from "@/lib/site";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Original C# interview questions, IdentityServer, EF Core, and ASP.NET Core notes from production healthcare and SaaS work.",
  alternates: { canonical: "/blog" },
};

export default function BlogPage() {
  const posts = getAllPosts();

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

import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeading } from "@/components/SectionHeading";
import { getAllPosts } from "@/lib/posts";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Practical articles on ASP.NET Core, Angular, Azure, auth, and full stack delivery by Muhammad Shahid.",
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
          description="SEO-friendly posts you can extend anytime — add a Markdown file in content/blog."
        />

        <div className="mt-12 divide-y divide-slate-line border-y border-slate-line">
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
              <h2 className="mt-2 font-display text-2xl font-semibold text-[inherit] sm:text-3xl">
                <Link href={`/blog/${post.slug}`} className="hover:text-teal">
                  {post.title}
                </Link>
              </h2>
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
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeading } from "@/components/SectionHeading";
import { getPostsForTopic } from "@/lib/posts";
import { pageSocial } from "@/lib/seo";
import { learningTopics } from "@/lib/site";

const title = "Interviews, Async, Auth, EF Core, EDI, and Architecture";
const description =
  "Topic guides for C# async and multithreading, ASP.NET Core interview questions, Angular authentication, identity, EF Core, healthcare EDI, CQRS, dependency injection, and architecture.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/learning" },
  ...pageSocial({ title, description, path: "/learning" }),
};

export default function LearningPage() {
  return (
    <section className="section-pad page-top">
      <div className="container-narrow">
        <Link href="/blog" className="text-sm font-semibold link-underline">
          ← All articles
        </Link>

        <div className="mt-6">
          <SectionHeading
            eyebrow="Blog topics"
            title="Interviews, Async, Auth, EF Core, EDI, and Architecture"
            description="Topic hubs group related articles for study flow. Every piece still lives in the main blog."
            level={1}
          />
        </div>

        <div className="section-stack grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {learningTopics.map((topic) => {
            const count = getPostsForTopic(topic).length;
            return (
              <article key={topic.slug} className="surface-hover rounded-xl p-6">
                <p className="eyebrow">Topic</p>
                <h2 className="heading-subsection mt-3">
                  <Link href={`/learning/${topic.slug}`} className="hover:text-link">
                    {topic.label}
                  </Link>
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">{topic.description}</p>
                <p className="mt-5 text-sm font-semibold text-link">
                  <Link href={`/learning/${topic.slug}`}>
                    {count} article{count === 1 ? "" : "s"}
                    <span aria-hidden> →</span>
                  </Link>
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

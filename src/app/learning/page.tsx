import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeading } from "@/components/SectionHeading";
import { getPostsForTopic } from "@/lib/posts";
import { learningTopics } from "@/lib/site";

export const metadata: Metadata = {
  title: "Blog Topics — Auth, EF Core, EDI, DI & Architecture",
  description:
    "Topic guides for ASP.NET Core + Angular authentication, identity, EF Core, healthcare EDI, CQRS, dependency injection, and architecture.",
  alternates: { canonical: "/learning" },
};

export default function LearningPage() {
  return (
    <section className="section-pad pt-28 sm:pt-32">
      <div className="container-narrow">
        <Link href="/blog" className="text-sm font-semibold text-teal link-underline">
          ← All articles
        </Link>

        <div className="mt-6">
          <SectionHeading
            eyebrow="Blog topics"
            title="Guided paths through the writing."
            description="These topic hubs group related articles for SEO and study flow. Every piece still lives in the main blog."
            level={1}
          />
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {learningTopics.map((topic) => {
            const count = getPostsForTopic(topic).length;
            return (
              <Link
                key={topic.slug}
                href={`/learning/${topic.slug}`}
                className="surface surface-hover block rounded-xl p-6"
              >
                <p className="eyebrow">Topic</p>
                <h2 className="mt-3 font-display text-xl font-semibold text-ink">{topic.label}</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">{topic.description}</p>
                <p className="mt-5 text-sm font-semibold text-teal">
                  {count} article{count === 1 ? "" : "s"} →
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectCard } from "@/components/ProjectCard";
import { CtaBand } from "@/components/SectionHeading";
import { pageSocial, personId } from "@/lib/seo";
import { getProject, projects, siteConfig } from "@/lib/site";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) {
    return { title: "Work not found" };
  }

  const path = `/work/${project.slug}`;
  return {
    title: project.title,
    description: project.summary,
    alternates: { canonical: path },
    ...pageSocial({
      title: project.title,
      description: project.summary,
      path,
      type: "article",
    }),
  };
}

export default async function WorkCasePage({ params }: PageProps) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) {
    notFound();
  }

  const pageUrl = `${siteConfig.url}/work/${project.slug}`;
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteConfig.url },
      { "@type": "ListItem", position: 2, name: "Work", item: `${siteConfig.url}/work` },
      { "@type": "ListItem", position: 3, name: project.title, item: pageUrl },
    ],
  };
  const creativeWorkJsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: project.title,
    description: project.summary,
    url: pageUrl,
    author: { "@id": personId },
    creator: { "@id": personId },
    inLanguage: "en",
    about: project.stack,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(creativeWorkJsonLd) }}
      />
      <section className="section-pad pt-28 sm:pt-32">
        <div className="container-narrow">
          <nav className="text-sm text-muted" aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link href="/" className="hover:text-teal">
                  Home
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li>
                <Link href="/work" className="hover:text-teal">
                  Work
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li aria-current="page" className="text-ink">
                {project.title}
              </li>
            </ol>
          </nav>
          <div className="mt-8">
            <ProjectCard project={project} asPage />
          </div>

          <div className="reading-surface mt-12 max-w-2xl space-y-5 text-lg leading-relaxed text-muted">
            {project.caseNotes.map((note) => (
              <p key={note.slice(0, 48)}>{note}</p>
            ))}
          </div>

          {project.related.length > 0 ? (
            <aside className="mt-12 max-w-2xl border-t border-slate-line pt-8">
              <h2 className="font-display text-xl font-semibold text-ink">Related writing</h2>
              <ul className="mt-4 space-y-3">
                {project.related.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="font-medium text-teal link-underline">
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}

          <p className="mt-10 max-w-2xl text-sm text-muted">
            Want a similar shape for your product?{" "}
            <Link href="/contact" className="font-semibold text-teal link-underline">
              {siteConfig.inquiryCta}
            </Link>{" "}
            and I will reply within one business day.
          </p>
        </div>
      </section>
      <CtaBand />
    </>
  );
}

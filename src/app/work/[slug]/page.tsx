import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectCard } from "@/components/ProjectCard";
import { CtaBand } from "@/components/SectionHeading";
import { getProject, projects } from "@/lib/site";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) {
    return { title: "Work not found" };
  }

  return {
    title: project.title,
    description: project.summary,
    alternates: { canonical: `/work/${project.slug}` },
  };
}

export default async function WorkCasePage({ params }: PageProps) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) {
    notFound();
  }

  return (
    <>
      <section className="section-pad pt-28 sm:pt-32">
        <div className="container-narrow">
          <Link href="/work" className="text-sm font-semibold text-teal link-underline">
            ← All work
          </Link>
          <div className="mt-8">
            <ProjectCard project={project} asPage />
          </div>
          <p className="mt-8 max-w-2xl text-sm text-muted">
            Want a similar shape for your product? Send a project inquiry and I will reply within
            one business day.
          </p>
        </div>
      </section>
      <CtaBand />
    </>
  );
}

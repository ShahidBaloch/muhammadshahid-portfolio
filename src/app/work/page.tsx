import type { Metadata } from "next";
import { ProjectCard } from "@/components/ProjectCard";
import { CtaBand, SectionHeading } from "@/components/SectionHeading";
import { pageSocial } from "@/lib/seo";
import { projects } from "@/lib/site";

const title = "Selected .NET and Angular Work";
const description =
  "Selected .NET and Angular projects by Muhammad Shahid — microservices marketplaces, eCommerce platforms, and healthcare SaaS.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/work" },
  ...pageSocial({ title, description, path: "/work" }),
};

export default function WorkPage() {
  return (
    <>
      <section className="section-pad pt-28 sm:pt-32">
        <div className="container-narrow">
          <SectionHeading
            eyebrow="Work"
            title="Selected .NET and Angular Work"
            description="Case-style summaries: problem, solution, stack, and result — from auction microservices to healthcare operations."
            level={1}
          />
          <div className="mt-12">
            {projects.map((project) => (
              <ProjectCard key={project.slug} project={project} />
            ))}
          </div>
        </div>
      </section>
      <CtaBand />
    </>
  );
}

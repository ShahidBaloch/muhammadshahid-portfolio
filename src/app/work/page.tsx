import type { Metadata } from "next";
import { ProjectCard } from "@/components/ProjectCard";
import { CtaBand, SectionHeading } from "@/components/SectionHeading";
import { projects } from "@/lib/site";

export const metadata: Metadata = {
  title: "Work",
  description:
    "Selected .NET and Angular projects by Muhammad Shahid — microservices marketplaces, eCommerce platforms, and healthcare SaaS.",
  alternates: { canonical: "/work" },
};

export default function WorkPage() {
  return (
    <>
      <section className="section-pad pt-28 sm:pt-32">
        <div className="container-narrow">
          <SectionHeading
            eyebrow="Work"
            title="Projects built for real product constraints."
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

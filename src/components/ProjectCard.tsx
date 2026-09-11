import Link from "next/link";
import type { Project } from "@/lib/site";
import { ProjectVisual } from "@/components/ProjectVisual";

export function ProjectCard({
  project,
  asPage = false,
}: {
  project: Project;
  asPage?: boolean;
}) {
  return (
    <article className="group border-b border-slate-line py-7 first:pt-0 last:border-b-0">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="font-mono text-xs text-kicker">{project.domain}</p>
          {asPage ? (
            <h1 className="heading-page mt-2">
              {project.title}
            </h1>
          ) : (
            <h2 className="heading-section mt-2">
              <Link href={`/work/${project.slug}`} className="hover:text-link">
                {project.title}
              </Link>
            </h2>
          )}
          {project.confidential ? (
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Client work under NDA — patterns only, no screenshots
            </p>
          ) : null}
          <p className="mt-3 text-lg text-muted">{project.summary}</p>
          <dl className="mt-6 space-y-4 text-sm leading-relaxed sm:text-base">
            <div>
              <dt className="font-semibold text-ink">Problem</dt>
              <dd className="mt-1 text-muted">{project.problem}</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Solution</dt>
              <dd className="mt-1 text-muted">{project.solution}</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Result</dt>
              <dd className="mt-1 text-muted">{project.result}</dd>
            </div>
          </dl>
        </div>

        <div className="w-full shrink-0 space-y-5 lg:max-w-xs">
          <ProjectVisual project={project} />
          <div>
            <p className="font-mono text-xs text-muted">Stack</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {project.stack.map((item) => (
                <li
                  key={item}
                  className="rounded border border-slate-line bg-paper px-2.5 py-1 font-mono text-xs text-ink-soft"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-4">
            {asPage ? null : (
              <Link href={`/work/${project.slug}`} className="text-sm font-semibold link-underline">
                Case notes →
              </Link>
            )}
            {project.github ? (
              <Link
                href={project.github}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold link-underline"
              >
                GitHub →
              </Link>
            ) : null}
            {project.liveUrl ? (
              <Link
                href={project.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold link-underline"
              >
                Live demo →
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

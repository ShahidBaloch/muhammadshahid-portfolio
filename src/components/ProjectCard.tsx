import Link from "next/link";
import type { Project } from "@/lib/site";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <article className="group border-b border-slate-line py-10 first:pt-0 last:border-b-0">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="font-mono text-xs text-teal">{project.domain}</p>
                <h3 className="mt-2 font-display text-2xl font-semibold text-ink sm:text-3xl">
            {project.title}
          </h3>
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

        <div className="w-full shrink-0 lg:max-w-xs">
          <p className="font-mono text-xs text-muted">Stack</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {project.stack.map((item) => (
              <li
                key={item}
                className="rounded border border-slate-line bg-mist px-2.5 py-1 font-mono text-xs text-ink-soft"
              >
                {item}
              </li>
            ))}
          </ul>
          {project.github ? (
            <Link
              href={project.github}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex text-sm font-semibold text-teal link-underline"
            >
              View on GitHub →
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

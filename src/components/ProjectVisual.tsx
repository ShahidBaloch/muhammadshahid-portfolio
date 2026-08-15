import type { Project } from "@/lib/site";

export function ProjectVisual({ project }: { project: Project }) {
  return (
    <div className="rounded-lg border border-slate-line bg-paper p-4 sm:p-5" aria-hidden>
      <p className="eyebrow">{project.confidential ? "Architecture · NDA" : "Architecture"}</p>
      <div className="mt-3 space-y-2">
        {project.layers.map((layer, index) => (
          <div
            key={layer}
            className={`rounded-md px-3 py-2 text-center text-xs font-medium ${
              index === 0
                ? "bg-navy text-white"
                : "border border-slate-line bg-mist text-ink-soft"
            }`}
          >
            {layer}
          </div>
        ))}
      </div>
    </div>
  );
}

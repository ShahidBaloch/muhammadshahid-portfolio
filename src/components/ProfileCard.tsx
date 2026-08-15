import { Portrait } from "@/components/Portrait";
import { siteConfig } from "@/lib/site";

type ProfileCardProps = {
  className?: string;
};

export function ProfileCard({ className = "" }: ProfileCardProps) {
  return (
    <aside className={`surface relative overflow-hidden rounded-2xl p-6 sm:p-8 ${className}`}>
      <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-cyan/20 blur-2xl" aria-hidden />

      <div className="relative flex min-w-0 items-center gap-3 sm:gap-4">
        <Portrait priority />
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold text-ink sm:text-xl">{siteConfig.name}</p>
          <p className="mt-1 text-sm text-muted">{siteConfig.title}</p>
          <p className="mt-2 text-xs font-medium text-teal">{siteConfig.availability}</p>
        </div>
      </div>

      <dl className="relative mt-8 grid gap-4 border-t border-slate-line pt-6 sm:grid-cols-2">
        <div>
          <dt className="eyebrow">Focus</dt>
          <dd className="mt-2 text-sm leading-relaxed text-ink-soft">Healthcare · SaaS · eCommerce</dd>
        </div>
        <div>
          <dt className="eyebrow">Stack</dt>
          <dd className="mt-2 text-sm leading-relaxed text-ink-soft">.NET · Angular · Azure · Identity</dd>
        </div>
        <div>
          <dt className="eyebrow">Based in</dt>
          <dd className="mt-2 text-sm leading-relaxed text-ink-soft">{siteConfig.location}</dd>
        </div>
        <div>
          <dt className="eyebrow">Engagement</dt>
          <dd className="mt-2 text-sm leading-relaxed text-ink-soft">Freelance &amp; contract · remote</dd>
        </div>
      </dl>
    </aside>
  );
}

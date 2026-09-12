import { Portrait } from "@/components/Portrait";
import { siteConfig } from "@/lib/site";

type ProfileCardProps = {
  className?: string;
};

export function ProfileCard({ className = "" }: ProfileCardProps) {
  return (
    <aside
      className={`surface relative w-full overflow-hidden rounded-2xl p-4 sm:p-5 lg:max-w-md lg:justify-self-end ${className}`}
    >
      <div
        className="pointer-events-none absolute -bottom-8 -right-8 z-0 h-28 w-28 rounded-full bg-teal/12 blur-2xl"
        aria-hidden
      />

      <div className="relative flex min-w-0 items-center gap-3 sm:gap-4">
        <Portrait priority />
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold text-ink sm:text-xl">{siteConfig.name}</p>
          <p className="mt-1 text-sm text-muted">{siteConfig.title}</p>
          <p className="mt-1.5 text-xs font-medium text-link">{siteConfig.availability}</p>
        </div>
      </div>

      <dl className="relative mt-5 grid gap-2.5 border-t border-slate-line pt-4 sm:grid-cols-2 sm:gap-3">
        <div className="min-w-0">
          <dt className="eyebrow">Focus</dt>
          <dd className="mt-1 text-sm leading-snug text-ink-soft">Healthcare · SaaS · eCommerce</dd>
        </div>
        <div className="min-w-0">
          <dt className="eyebrow">Stack</dt>
          <dd className="mt-1 text-sm leading-snug text-ink-soft">.NET · Angular · Azure · Identity</dd>
        </div>
        <div className="min-w-0">
          <dt className="eyebrow">Based in</dt>
          <dd className="mt-1 text-sm leading-snug text-ink-soft">{siteConfig.location}</dd>
        </div>
        <div className="min-w-0">
          <dt className="eyebrow">Engagement</dt>
          <dd className="mt-1 text-sm leading-snug text-ink-soft">Freelance &amp; contract · remote</dd>
        </div>
      </dl>
    </aside>
  );
}

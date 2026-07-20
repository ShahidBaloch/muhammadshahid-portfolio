import Image from "next/image";
import { siteConfig } from "@/lib/site";

type ProfileCardProps = {
  className?: string;
};

export function ProfileCard({ className = "" }: ProfileCardProps) {
  return (
    <aside
      className={`surface relative overflow-hidden rounded-2xl p-6 sm:p-8 ${className}`}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-teal/15 blur-2xl"
        aria-hidden
      />

      <div className="relative flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0 sm:h-24 sm:w-24">
          <div
            className="absolute inset-0 rounded-full bg-teal opacity-90"
            aria-hidden
          />
          <div className="absolute inset-[3px] overflow-hidden rounded-full bg-mist ring-2 ring-white">
            <Image
              src="/images/profile.png"
              alt={siteConfig.name}
              fill
              priority
              className="object-cover object-top saturate-[0.85]"
              sizes="96px"
            />
          </div>
        </div>

        <div>
          <p className="font-display text-xl font-semibold text-ink">{siteConfig.name}</p>
          <p className="mt-1 text-sm text-muted">{siteConfig.title}</p>
          <p className="mt-2 text-xs font-medium text-teal">{siteConfig.availability}</p>
        </div>
      </div>

      <dl className="relative mt-8 grid gap-4 border-t border-slate-line pt-6 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Focus</dt>
          <dd className="mt-2 text-sm leading-relaxed text-ink-soft">
            Healthcare · SaaS · eCommerce platforms
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Stack</dt>
          <dd className="mt-2 text-sm leading-relaxed text-ink-soft">
            .NET · Angular · Azure · Identity
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Based in</dt>
          <dd className="mt-2 text-sm leading-relaxed text-ink-soft">{siteConfig.location}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Engagement</dt>
          <dd className="mt-2 text-sm leading-relaxed text-ink-soft">
            Freelance &amp; contract · remote-ready
          </dd>
        </div>
      </dl>

      <ul className="relative mt-6 flex flex-wrap gap-2">
        {["Clean Architecture", "APIs", "SSO", "CI/CD"].map((tag) => (
          <li
            key={tag}
            className="rounded-full border border-slate-line bg-paper px-3 py-1 text-xs font-medium text-ink-soft"
          >
            {tag}
          </li>
        ))}
      </ul>
    </aside>
  );
}

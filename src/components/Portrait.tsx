import { siteConfig } from "@/lib/site";

type PortraitProps = {
  className?: string;
  priority?: boolean;
};

/**
 * 96px circular photo. public/images/profile-96.webp and -192.webp are pre-resized from
 * profile.png (same crop and styling as the old next/image "fill" version, without the
 * runtime image optimizer).
 */
export function Portrait({ className = "", priority = false }: PortraitProps) {
  return (
    <div
      className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-full ring-2 ring-teal/30 sm:h-24 sm:w-24 ${className}`}
    >
      <img
        src="/images/profile-192.webp"
        srcSet="/images/profile-96.webp 96w, /images/profile-192.webp 192w"
        sizes="96px"
        alt={siteConfig.name}
        width={192}
        height={192}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        className="object-cover object-[center_18%]"
        style={{ position: "absolute", height: "100%", width: "100%", inset: 0, color: "transparent" }}
      />
    </div>
  );
}

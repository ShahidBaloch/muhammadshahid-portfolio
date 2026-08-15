import Image from "next/image";
import { siteConfig } from "@/lib/site";

type PortraitProps = {
  className?: string;
  priority?: boolean;
};

export function Portrait({ className = "", priority = false }: PortraitProps) {
  return (
    <div
      className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-full ring-2 ring-white sm:h-24 sm:w-24 ${className}`}
    >
      <Image
        src="/images/profile.png"
        alt={siteConfig.name}
        fill
        priority={priority}
        sizes="96px"
        className="object-cover object-[center_18%]"
      />
    </div>
  );
}

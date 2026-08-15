type BrandMarkProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClass = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-11 w-11 text-sm",
  lg: "h-14 w-14 text-lg",
} as const;

export function BrandMark({ size = "sm", className = "" }: BrandMarkProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-teal font-display font-semibold tracking-tight text-white ${sizeClass[size]} ${className}`}
      aria-hidden
    >
      MS
    </span>
  );
}

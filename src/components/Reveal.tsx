import type { ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delayMs?: number;
};

/** Static wrapper; scripts/reveal.ts fades it in when it scrolls into view. */
export function Reveal({ children, className = "", delayMs = 0 }: RevealProps) {
  return (
    <div className={`reveal ${className}`} style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}>
      {children}
    </div>
  );
}

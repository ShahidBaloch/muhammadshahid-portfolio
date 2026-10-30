import type { AnchorHTMLAttributes } from "react";

/**
 * A plain <a>. Pages are static HTML, so navigation is a normal page load and nothing is
 * prefetched. `prefetch` is accepted (and ignored) so existing call sites keep compiling.
 */
export default function Link({ prefetch: _prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) {
  return <a {...props} />;
}

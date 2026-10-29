// Imports the real component by its dist path: next.config.ts aliases "next/link" to this file.
import NextLink from "next/dist/client/link";
import type { ComponentProps } from "react";

/**
 * next/link with prefetch off by default. Viewport prefetch pulled every visible link's payload
 * (the blog feed alone shows dozens) on each page view, costing CDN requests and origin transfer.
 * Navigation still works on click and crawlers still see a plain <a href>. Pass prefetch to opt in.
 */
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}

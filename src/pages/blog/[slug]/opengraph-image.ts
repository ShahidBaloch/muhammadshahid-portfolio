import type { APIRoute } from "astro";
import render, { generateStaticParams } from "@/lib/og-post";

export function getStaticPaths() {
  return generateStaticParams().map((params) => ({ params }));
}

export const GET: APIRoute = ({ params }) => render({ params: Promise.resolve({ slug: params.slug! }) });

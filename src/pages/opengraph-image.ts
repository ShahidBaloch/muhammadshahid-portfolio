import type { APIRoute } from "astro";
import render from "@/lib/og-site";

export const GET: APIRoute = () => render();

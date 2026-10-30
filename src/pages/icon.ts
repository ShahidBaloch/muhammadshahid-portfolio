import type { APIRoute } from "astro";
import render from "@/lib/og-icon";

export const GET: APIRoute = () => render();

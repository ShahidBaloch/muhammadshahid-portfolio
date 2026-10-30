// @ts-check
import preact from "@astrojs/preact";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Static site: every page is prebuilt HTML served from Vercel's CDN (no ISR reads). The only
// server code is api/contact.ts, a Vercel Function outside the Astro build.
// Islands (header, cookie banner, contact form) run on Preact through preact/compat.
export default defineConfig({
  site: "https://www.muhammadshahid.dev",
  output: "static",
  trailingSlash: "never",
  build: { format: "file", inlineStylesheets: "never" },
  integrations: [preact({ compat: true })],
  vite: {
    plugins: [tailwindcss()],
    // @vercel/og loads its fonts and wasm from disk; run it from node_modules, not bundled.
    // (package.json "overrides" maps react/react-dom to @preact/compat, so libraries such as
    // react-markdown create Preact elements too; real React would render as nothing.)
    ssr: { external: ["@vercel/og"] },
    // Keep the env var names already set in Vercel (NEXT_PUBLIC_*).
    envPrefix: ["PUBLIC_", "NEXT_PUBLIC_"],
  },
});

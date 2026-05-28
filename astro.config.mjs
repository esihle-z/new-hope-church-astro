// astro.config.mjs
// ─────────────────────────────────────────────────────────────
// Astro configuration for New Hope Church site.
// ─────────────────────────────────────────────────────────────

import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://newhopechurch.co.za",
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});

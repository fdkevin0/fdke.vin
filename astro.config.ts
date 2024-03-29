import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  markdown: {
    shikiConfig: {
      theme: "dracula",
      wrap: true
    }
  },
  site: "https://www.astro-theme-cactus.netlify.app",
  integrations: [mdx({}), tailwind({
    applyBaseStyles: false,
  }), sitemap()]
});
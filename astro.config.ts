import fs from "node:fs";
import { fileURLToPath } from "node:url";
import cloudflare from "@astrojs/cloudflare";
// Rehype plugins
import { rehypeHeadingIds } from "@astrojs/markdown-remark";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwind from "@tailwindcss/vite";
import { defineConfig, envField } from "astro/config";
import icon from "astro-icon";
import robotsTxt from "astro-robots-txt";
import webmanifest from "astro-webmanifest";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeExternalLinks from "rehype-external-links";
import rehypeUnwrapImages from "rehype-unwrap-images";
// Remark plugins
import { remarkAdmonition } from "remark-admonition";
import remarkDirective from "remark-directive"; /* Handle ::: directives as nodes */
import { admonitionTypes, rehypeAdmonitions } from "./src/plugins/rehype-admonitions";
import { remarkGithubCard } from "./src/plugins/remark-github-card";
import { remarkReadingTime } from "./src/plugins/remark-reading-time";
import { siteConfig } from "./src/site.config";

// https://astro.build/config
export default defineConfig({
	site: siteConfig.url,

	image: {
		domains: ["webmention.io"],
	},

	integrations: [
		icon(),
		sitemap(),
		mdx(),
		robotsTxt(),
		webmanifest({
			// See: https://github.com/alextim/astro-lib/blob/main/packages/astro-webmanifest/README.md
			name: siteConfig.title,
			short_name: "fdke.vin",
			description: siteConfig.description,
			lang: siteConfig.lang,
			icon: "public/icons/icon-source.png", // the source for generating favicon & icons
			icons: [
				{
					src: "icons/apple-touch-icon.png", // used in src/components/BaseHead.astro L:26
					sizes: "180x180",
					type: "image/png",
				},
				{
					src: "icons/icon-192.png",
					sizes: "192x192",
					type: "image/png",
				},
				{
					src: "icons/icon-512.png",
					sizes: "512x512",
					type: "image/png",
				},
			],
			start_url: "/",
			background_color: "#1d1f21",
			theme_color: "#2bbc8a",
			display: "standalone",
			config: {
				insertFaviconLinks: false,
				insertThemeColorMeta: false,
				insertManifestLink: false,
			},
		}),
	],

	markdown: {
		rehypePlugins: [
			rehypeAdmonitions,
			rehypeHeadingIds,
			[rehypeAutolinkHeadings, { behavior: "wrap", properties: { className: ["not-prose"] } }],
			[
				rehypeExternalLinks,
				{
					rel: ["noreferrer", "noopener"],
					target: "_blank",
				},
			],
			rehypeUnwrapImages,
		],
		remarkPlugins: [
			remarkReadingTime,
			remarkDirective,
			remarkGithubCard,
			[
				remarkAdmonition,
				{
					defaultElement: "aside",
					defaultProperties: { className: ["admonition"] },
					types: admonitionTypes,
				},
			],
		],
		remarkRehype: {
			footnoteLabelProperties: {
				className: [""],
			},
		},
	},

	vite: {
		optimizeDeps: {
			// Fedify's vocab/runtime graph is heavy and trips esbuild's dep
			// scanner during `astro check`/dev. The Cloudflare build bundles it
			// via Rollup instead, so skip esbuild pre-bundling for these.
			exclude: [
				"@resvg/resvg-wasm",
				"@fedify/fedify",
				"@fedify/vocab",
				"@fedify/vocab-runtime",
				"@fedify/webfinger",
				"@fedify/uri-template",
				"@js-temporal/polyfill",
				"@logtape/logtape",
				"@opentelemetry/api",
				"@opentelemetry/core",
				"@opentelemetry/sdk-metrics",
				"@opentelemetry/sdk-trace-base",
				"@opentelemetry/semantic-conventions",
				"byte-encodings",
				"es-toolkit",
				"json-canon",
				"jsonld",
				"structured-field-values",
				"urlpattern-polyfill",
			],
		},
		resolve: {
			alias: {
				debug: fileURLToPath(new URL("./src/shims/debug.ts", import.meta.url)),
			},
		},
		ssr: {
			noExternal: ["debug"],
		},
		// biome-ignore lint/suspicious/noExplicitAny: Astro and Tailwind resolve incompatible Vite plugin types here.
		plugins: [tailwind(), rawFonts([".ttf", ".woff"])] as any,
	},

	env: {
		schema: {
			WEBMENTION_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
			WEBMENTION_URL: envField.string({ context: "client", access: "public", optional: true }),
			WEBMENTION_PINGBACK: envField.string({ context: "client", access: "public", optional: true }),
			CLOUDFLARE_TEAM_DOMAIN: envField.string({
				context: "server",
				access: "secret",
				optional: true,
			}),
			CLOUDFLARE_POLICY_AUD: envField.string({
				context: "server",
				access: "secret",
				optional: true,
			}),
		},
	},

	adapter: cloudflare({
		inspectorPort: 0,
		remoteBindings: !process.env.CI,
		imageService: { build: "compile", runtime: "cloudflare-binding" },
		prerenderEnvironment: "node",
	}),
});

function rawFonts(ext: string[]) {
	return {
		name: "vite-plugin-raw-fonts",
		// @ts-expect-error:next-line
		transform(_, id) {
			if (ext.some((e) => id.endsWith(e))) {
				const buffer = fs.readFileSync(id);
				return {
					code: `export default ${JSON.stringify(buffer)}`,
					map: null,
				};
			}
		},
	};
}

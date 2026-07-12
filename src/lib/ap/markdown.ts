import { createMarkdownProcessor, type MarkdownRenderer } from "@astrojs/markdown-remark";
import rehypeExternalLinks from "rehype-external-links";

/**
 * Render a D1 Note's markdown `content` to HTML at request time.
 *
 * Notes lost their `.md` collection entry (and with it Astro's build-time
 * `render()`) when they moved into D1, so the SSR pages render the stored
 * markdown themselves. The processor mirrors the site's pipeline (GFM,
 * smartypants, external-link hardening) but drops Shiki syntax highlighting —
 * Notes have no fenced code, and Shiki pulls WASM that is heavier than the
 * free Worker bundle can spare. The processor is created once per isolate and
 * reused, matching the feed subsystem's `ensureFeedSchema` caching convention.
 */
let processorPromise: Promise<MarkdownRenderer> | null = null;

function getProcessor(): Promise<MarkdownRenderer> {
	processorPromise ??= createMarkdownProcessor({
		gfm: true,
		smartypants: true,
		syntaxHighlight: false,
		rehypePlugins: [[rehypeExternalLinks, { rel: ["noreferrer", "noopener"], target: "_blank" }]],
	});
	return processorPromise;
}

/** Render note markdown to an HTML fragment (no surrounding `<html>`). */
export async function renderNoteMarkdown(markdown: string): Promise<string> {
	const processor = await getProcessor();
	const { code } = await processor.render(markdown);
	return code;
}

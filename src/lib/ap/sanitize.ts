import rehypeParse from "rehype-parse";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";

/**
 * Sanitize untrusted remote HTML (a federated reply's `content`) before it is
 * rendered under one of our Notes (issue AP-7).
 *
 * Remote servers send `content` as HTML (Mastodon-flavoured `<p>`/`<a>`/`<span>`
 * with mention and hashtag classes). We must never inject that verbatim: it can
 * carry `<script>`, event handlers, `javascript:` URLs, or hotlinked `<img>`
 * that leaks the reader's IP to a remote host. This runs the HTML through
 * `rehype-sanitize` with an allowlist derived from its GitHub-safe default,
 * narrowed to drop images (avatars/images are proxied through R2 instead).
 *
 * Pure input→output over the HTML string (no I/O), so it is unit-tested.
 */

/** The allowlist: rehype-sanitize's default, minus `<img>` (no hotlinking). */
const SCHEMA: typeof defaultSchema = {
	...defaultSchema,
	tagNames: (defaultSchema.tagNames ?? []).filter((tag) => tag !== "img"),
};

let processor: ReturnType<typeof buildProcessor> | null = null;

function buildProcessor() {
	return unified()
		.use(rehypeParse, { fragment: true })
		.use(rehypeSanitize, SCHEMA)
		.use(rehypeStringify);
}

/**
 * Sanitize a remote HTML fragment to a safe HTML string. Empty/whitespace-only
 * input yields an empty string.
 */
export async function sanitizeRemoteHtml(html: string): Promise<string> {
	if (!html || !html.trim()) return "";
	if (!processor) processor = buildProcessor();
	const file = await processor.process(html);
	return String(file);
}

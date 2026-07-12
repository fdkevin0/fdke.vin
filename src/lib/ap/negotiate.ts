import { acceptsActivityPub } from "@/lib/ap/accept";
import { renderNoteMarkdown } from "@/lib/ap/markdown";
import { serializeNote } from "@/lib/ap/serialize";
import type { Note, NoteAttachment } from "@/lib/ap/types";

/**
 * ActivityPub content negotiation for a single Note URL.
 *
 * A Fediverse server fetching `application/activity+json` gets the AS2 `Note`
 * object; everyone else gets `null` so the caller falls through to the SSR HTML
 * page at the same canonical URL. Lives in a `.ts` module (rather than inline in
 * the `.astro` frontmatter) so the Fedify serializer stays out of the page's
 * module graph and the whole flow is unit-testable input→output.
 */
export async function negotiateNoteActivity(
	note: Note,
	options: {
		accept: string | null | undefined;
		origin: URL | string;
		attachments?: NoteAttachment[];
	},
): Promise<Response | null> {
	if (!acceptsActivityPub(options.accept)) return null;

	const htmlContent = await renderNoteMarkdown(note.content);
	const as2 = await serializeNote(note, {
		origin: options.origin,
		htmlContent,
		...(options.attachments && options.attachments.length > 0
			? {
					attachments: options.attachments.map((a) => ({
						url: a.url,
						mediaType: a.mediaType,
						...(a.name ? { name: a.name } : {}),
					})),
				}
			: {}),
	});

	return new Response(JSON.stringify(as2, null, 2), {
		headers: {
			"Content-Type": "application/activity+json; charset=utf-8",
			Vary: "Accept",
		},
	});
}

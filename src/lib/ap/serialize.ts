import { Note as As2Note, Document, PUBLIC_COLLECTION, Source } from "@fedify/fedify/vocab";
import { toInstant } from "@/lib/ap/temporal";
import type { Note, NoteAttachment } from "@/lib/ap/types";

/**
 * Serialize application Notes into spec-shaped ActivityStreams 2.0 JSON-LD.
 *
 * The protocol vocabulary (object construction and JSON-LD compaction) is
 * delegated to Fedify's `@fedify/fedify/vocab` classes — we only own the
 * mapping from a D1 {@link Note} row to AS2 fields (see ADR-0002, amended to
 * delegate the protocol layer to Fedify). This function is pure: given the
 * same note + options it always builds the same fields, with no I/O, so it is
 * unit-tested input→output (the `post.test.ts` style).
 */

export interface SerializeNoteOptions {
	/** Site origin used to build absolute ids, e.g. `https://fdke.vin` (trailing slash tolerated). */
	origin: URL | string;
	/** Actor URI the Note is attributed to, supplied by the Fedify context. */
	actorId: URL;
	/** Followers collection URI supplied by Fedify and placed in `cc`. */
	followersUri: URL;
	/** Rendered HTML placed in the AS2 `content` field (Mastodon renders `content` as HTML). */
	htmlContent: string;
	/** Media attachments serialized as AS2 `Document` objects in `attachment`. */
	attachments?: NoteAttachment[];
}

/**
 * Build a Fedify AS2 `Note` vocab object for a D1 Note.
 *
 * Its `toJsonLd()` output carries Fedify's compacted `@context` (ActivityStreams +
 * security + Mastodon/FEP vocab), `type: "Note"`, the canonical `id`
 * (`${origin}/notes/{ulid}/`), `attributedTo` (the actor), `to` (Public) and
 * `cc` (followers), the rendered `content`, a markdown `source`, `published`/
 * `updated`, and any `attachment` documents.
 */
export function buildNoteObject(note: Note, options: SerializeNoteOptions): As2Note {
	const base = options.origin instanceof URL ? options.origin : new URL(options.origin);
	const id = new URL(`/notes/${note.id}/`, base);
	const attachments = (options.attachments ?? []).map((a) => {
		const values: ConstructorParameters<typeof Document>[0] = {
			mediaType: a.mediaType,
			url: new URL(a.url, base),
		};
		if (a.name != null) values.name = a.name;
		return new Document(values);
	});

	const values: ConstructorParameters<typeof As2Note>[0] = {
		id,
		attribution: options.actorId,
		tos: [PUBLIC_COLLECTION],
		ccs: [options.followersUri],
		content: options.htmlContent,
		published: toInstant(note.publishDate.toISOString()),
		updated: toInstant(note.updatedDate.toISOString()),
		source: new Source({ content: note.content, mediaType: "text/markdown" }),
	};
	if (note.summary) values.summary = note.summary;
	if (attachments.length > 0) values.attachments = attachments;

	return new As2Note(values);
}

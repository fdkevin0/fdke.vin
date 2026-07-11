import { Note as As2Note, Document, PUBLIC_COLLECTION, Source } from "@fedify/fedify/vocab";
import { Temporal } from "@js-temporal/polyfill";
import type { Note } from "@/lib/ap/types";

/**
 * Serialize application Notes into spec-shaped ActivityStreams 2.0 JSON-LD.
 *
 * The protocol vocabulary (object construction and JSON-LD compaction) is
 * delegated to Fedify's `@fedify/fedify/vocab` classes — we only own the
 * mapping from a D1 {@link Note} row to AS2 fields (see ADR-0002, amended to
 * delegate the protocol layer to Fedify). This function is pure: given the
 * same note + options it always returns the same JSON, with no I/O, so it is
 * unit-tested input→output (the `post.test.ts` style).
 */

/** A media attachment on a Note, surfaced as an AS2 `Document`. */
export interface NoteAttachment {
	/** Canonical URL of the attachment media (stored URL, e.g. an R2 object URL). */
	url: URL | string;
	/** IANA media type, e.g. `image/jpeg`. */
	mediaType: string;
	/** Optional display name / alt text. */
	name?: string;
}

export interface SerializeNoteOptions {
	/** Site origin used to build absolute ids, e.g. `https://fdke.vin` (trailing slash tolerated). */
	origin: URL | string;
	/**
	 * Actor URI the Note is attributed to. Defaults to `${origin}/actor` —
	 * the single-actor dispatcher is wired in a later phase; the URI is fixed
	 * here so AS2 objects are consistent once published.
	 */
	actorId?: URL | string;
	/** Followers collection URI, placed in `cc`. Defaults to `${origin}/followers`. */
	followersUri?: URL | string;
	/** Rendered HTML placed in the AS2 `content` field (Mastodon renders `content` as HTML). */
	htmlContent: string;
	/** Media attachments serialized as AS2 `Document` objects in `attachment`. */
	attachments?: NoteAttachment[];
}

function toUrl(value: URL | string, base: URL): URL {
	return value instanceof URL ? value : new URL(value, base);
}

/**
 * Build the spec-shaped AS2 `Note` JSON-LD for a D1 Note.
 *
 * The returned object carries Fedify's compacted `@context` (ActivityStreams +
 * security + Mastodon/FEP vocab), `type: "Note"`, the canonical `id`
 * (`${origin}/notes/{ulid}/`), `attributedTo` (the actor), `to` (Public) and
 * `cc` (followers), the rendered `content`, a markdown `source`, `published`/
 * `updated`, and any `attachment` documents.
 */
export async function serializeNote(
	note: Note,
	options: SerializeNoteOptions,
): Promise<Record<string, unknown>> {
	const base = options.origin instanceof URL ? options.origin : new URL(options.origin);
	const id = new URL(`/notes/${note.id}/`, base);
	const actorId = options.actorId ? toUrl(options.actorId, base) : new URL("/actor", base);
	const followers = options.followersUri
		? toUrl(options.followersUri, base)
		: new URL("/followers", base);

	const attachments = (options.attachments ?? []).map((a) => {
		const values: ConstructorParameters<typeof Document>[0] = {
			mediaType: a.mediaType,
			url: toUrl(a.url, base),
		};
		if (a.name !== undefined) values.name = a.name;
		return new Document(values);
	});

	const values: ConstructorParameters<typeof As2Note>[0] = {
		id,
		attribution: actorId,
		tos: [PUBLIC_COLLECTION],
		ccs: [followers],
		content: options.htmlContent,
		published: Temporal.Instant.from(note.publishDate.toISOString()),
		updated: Temporal.Instant.from(note.updatedDate.toISOString()),
		source: new Source({ content: note.content, mediaType: "text/markdown" }),
	};
	if (note.summary) values.summary = note.summary;
	if (attachments.length > 0) values.attachments = attachments;

	const object = new As2Note(values);
	const json = await object.toJsonLd();
	return json as Record<string, unknown>;
}

import { Create, PUBLIC_COLLECTION, Update } from "@fedify/fedify/vocab";
import { Temporal } from "@js-temporal/polyfill";
import { actorUri, followersUri } from "@/lib/ap/config";
import { buildNoteObject, type NoteAttachment } from "@/lib/ap/serialize";
import type { Note } from "@/lib/ap/types";

/**
 * Build the AS2 activity envelope the site emits about one of its Notes:
 * a `Create` when a Note is first posted, an `Update` when it is edited.
 *
 * Shared by the outbox (which lists `Create`s for every Note) and the delivery
 * queue (which signs and POSTs these to followers). Pure input→output — the same
 * note + options always yield the same JSON-LD, so it is unit-tested without I/O.
 */

/** Which activity to build around a Note. */
export type ActivityKind = "Create" | "Update";

export interface ActivityForNoteOptions {
	/** Site origin used to build absolute ids, e.g. `https://fdke.vin`. */
	origin: URL | string;
	/** Rendered HTML placed in the Note's AS2 `content`. */
	htmlContent: string;
	/** Media attachments serialized as AS2 `Document`s on the Note. */
	attachments?: NoteAttachment[];
}

/**
 * Build a `Create`/`Update` wrapping the Note object, attributed to the actor
 * and addressed to Public + followers.
 *
 * The `Create` id is stable (`{noteUrl}#create`) so re-emitting is idempotent;
 * the `Update` id is versioned by the note's `updated` timestamp
 * (`{noteUrl}#updates/{iso}`) so each edit is a distinct activity remote servers
 * won't dedupe against the last.
 */
export async function activityForNote(
	kind: ActivityKind,
	note: Note,
	options: ActivityForNoteOptions,
): Promise<Record<string, unknown>> {
	const activity = buildActivityForNote(kind, note, options);
	const json = await activity.toJsonLd();
	return json as Record<string, unknown>;
}

/**
 * Build the `Create`/`Update` as a Fedify vocab object (the object
 * {@link activityForNote} compacts to JSON, and the outbox collection nests).
 */
export function buildActivityForNote(
	kind: ActivityKind,
	note: Note,
	options: ActivityForNoteOptions,
): Create | Update {
	const object = buildNoteObject(note, {
		origin: options.origin,
		htmlContent: options.htmlContent,
		...(options.attachments ? { attachments: options.attachments } : {}),
	});
	const noteUrl = new URL(`/notes/${note.id}/`, new URL(String(options.origin)));

	const actor = actorUri(options.origin);
	const followers = followersUri(options.origin);
	const shared = {
		actor,
		object,
		tos: [PUBLIC_COLLECTION],
		ccs: [followers],
	};

	return kind === "Create"
		? new Create({
				id: new URL("#create", noteUrl),
				published: Temporal.Instant.from(note.publishDate.toISOString()),
				...shared,
			})
		: new Update({
				id: new URL(`#updates/${note.updatedDate.toISOString()}`, noteUrl),
				published: Temporal.Instant.from(note.updatedDate.toISOString()),
				...shared,
			});
}

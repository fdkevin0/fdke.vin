import { Create, Delete, PUBLIC_COLLECTION, Tombstone, Update } from "@fedify/fedify/vocab";
import { actorUri, followersUri } from "@/lib/ap/config";
import { buildNoteObject, type NoteAttachment } from "@/lib/ap/serialize";
import { toInstant } from "@/lib/ap/temporal";
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

/** The full set of activities the delivery queue carries about a Note. */
export type DeliveryKind = ActivityKind | "Delete";

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
				published: toInstant(note.publishDate.toISOString()),
				...shared,
			})
		: new Update({
				id: new URL(`#updates/${note.updatedDate.toISOString()}`, noteUrl),
				published: toInstant(note.updatedDate.toISOString()),
				...shared,
			});
}

/**
 * Build a `Delete(Tombstone)` for a Note the author removed (issue AP-8),
 * addressed to Public + followers so remote servers tombstone their copy.
 *
 * Unlike Create/Update this needs only the Note id (the row is already gone from
 * D1 by delivery time), so it takes the id and origin rather than a {@link Note}.
 * The activity id is stable (`{noteUrl}#delete`).
 */
export async function deleteActivityForNote(
	noteId: string,
	options: { origin: URL | string },
): Promise<Record<string, unknown>> {
	const base = new URL(String(options.origin));
	const noteUrl = new URL(`/notes/${noteId}/`, base);
	const activity = new Delete({
		id: new URL("#delete", noteUrl),
		actor: actorUri(options.origin),
		object: new Tombstone({ id: noteUrl }),
		tos: [PUBLIC_COLLECTION],
		ccs: [followersUri(options.origin)],
	});
	const json = await activity.toJsonLd();
	return json as Record<string, unknown>;
}

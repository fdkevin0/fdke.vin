import { Create, Delete, PUBLIC_COLLECTION, Tombstone, Update } from "@fedify/fedify/vocab";
import { buildNoteObject, type SerializeNoteOptions } from "@/lib/ap/serialize";
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

/**
 * Build a `Create`/`Update` wrapping the Note object, attributed to the actor
 * and addressed to Public + followers.
 *
 * The `Create` id is stable (`{noteUrl}#create`) so re-emitting is idempotent;
 * the `Update` id is versioned by the note's `updated` timestamp
 * (`{noteUrl}#updates/{iso}`) so each edit is a distinct activity remote servers
 * won't dedupe against the last.
 */
export function buildActivityForNote(
	kind: ActivityKind,
	note: Note,
	options: SerializeNoteOptions,
): Create | Update {
	const object = buildNoteObject(note, options);
	const noteUrl = new URL(`/notes/${note.id}/`, new URL(String(options.origin)));

	const shared = {
		actor: options.actorId,
		object,
		tos: [PUBLIC_COLLECTION],
		ccs: [options.followersUri],
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
export function buildDeleteActivityForNote(
	noteId: string,
	options: { origin: URL | string; actorId: URL; followersUri: URL },
): Delete {
	const base = new URL(String(options.origin));
	const noteUrl = new URL(`/notes/${noteId}/`, base);
	return new Delete({
		id: new URL("#delete", noteUrl),
		actor: options.actorId,
		object: new Tombstone({ id: noteUrl }),
		tos: [PUBLIC_COLLECTION],
		ccs: [options.followersUri],
	});
}

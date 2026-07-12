export const prerender = false;

import type { APIRoute } from "astro";
import { enqueueNoteDelivery } from "@/lib/ap/delivery";
import { deleteInteractionsForNote } from "@/lib/ap/interactions";
import { getApEnv } from "@/lib/ap/runtime";
import { deleteNote, getNoteById } from "@/lib/ap/storage";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";
import { requireAccessUser } from "@/lib/api/tokens/request";

/**
 * Delete a Note from the dashboard (issue AP-8): remove it from the site and its
 * stored interactions, then enqueue a signed `Delete(Tombstone)` to followers so
 * remote servers tombstone their copy. This closes the loop Telegram can't —
 * channel deletes aren't delivered as webhooks.
 */
export const DELETE: APIRoute = async ({ params, locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) return user;

	const id = params.id?.trim();
	if (!id) return jsonError(400, "Note id is required");

	try {
		const env = await getApEnv();
		const note = await getNoteById(env, id);
		if (!note) return jsonError(404, "Note not found");

		// Federate the tombstone before the row is gone is unnecessary — the Delete
		// activity needs only the id — so remove locally first, then fan out.
		await deleteNote(env, id);
		await deleteInteractionsForNote(env, id);
		await enqueueNoteDelivery(env, { kind: "Delete", noteId: id });

		return jsonNoStore({ deleted: true, id });
	} catch (error) {
		logApiError("ap.notes.delete", error, { user: user.email, id });
		return jsonError(500, getErrorMessage(error, "Failed to delete note"));
	}
};

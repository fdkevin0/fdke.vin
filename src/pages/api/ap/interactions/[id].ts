export const prerender = false;

import type { APIRoute } from "astro";
import { deleteInteraction, setInteractionHidden } from "@/lib/ap/interactions";
import { getApEnv } from "@/lib/ap/runtime";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";
import { readJson, requireAccessUser } from "@/lib/api/tokens/request";

/**
 * Hide or unhide a stored reply (issue AP-8) so it stops/starts rendering under
 * its Note. Body: `{ hidden: boolean }`.
 */
export const PATCH: APIRoute = async ({ params, request, locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) return user;

	const id = params.id?.trim();
	if (!id) return jsonError(400, "Interaction id is required");

	try {
		const body = await readJson<{ hidden?: boolean }>(request);
		if (typeof body.hidden !== "boolean") return jsonError(400, "`hidden` must be a boolean");

		const env = await getApEnv();
		const ok = await setInteractionHidden(env, id, body.hidden);
		if (!ok) return jsonError(404, "Interaction not found");

		return jsonNoStore({ id, hidden: body.hidden });
	} catch (error) {
		logApiError("ap.interactions.hide", error, { user: user.email, id });
		return jsonError(500, getErrorMessage(error, "Failed to update interaction"));
	}
};

/** Permanently remove a stored interaction. */
export const DELETE: APIRoute = async ({ params, locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) return user;

	const id = params.id?.trim();
	if (!id) return jsonError(400, "Interaction id is required");

	try {
		const env = await getApEnv();
		const ok = await deleteInteraction(env, id);
		if (!ok) return jsonError(404, "Interaction not found");

		return jsonNoStore({ deleted: true, id });
	} catch (error) {
		logApiError("ap.interactions.delete", error, { user: user.email, id });
		return jsonError(500, getErrorMessage(error, "Failed to delete interaction"));
	}
};

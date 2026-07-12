export const prerender = false;

import type { APIRoute } from "astro";
import { listInteractionsForNote } from "@/lib/ap/interactions";
import { getApEnv } from "@/lib/ap/runtime";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";
import { requireAccessUser } from "@/lib/api/tokens/request";

/**
 * List all interactions (replies, likes, announces — including hidden replies)
 * for a Note, for dashboard reply moderation (issue AP-8).
 */
export const GET: APIRoute = async ({ params, locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) return user;

	const id = params.id?.trim();
	if (!id) return jsonError(400, "Note id is required");

	try {
		const env = await getApEnv();
		const interactions = await listInteractionsForNote(env, id);
		return jsonNoStore({ interactions });
	} catch (error) {
		logApiError("ap.notes.interactions", error, { user: user.email, id });
		return jsonError(500, getErrorMessage(error, "Failed to list interactions"));
	}
};

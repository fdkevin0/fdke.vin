export const prerender = false;

import type { APIRoute } from "astro";
import { deliveryStatusForNotes } from "@/lib/ap/deliveries";
import { countFollowers } from "@/lib/ap/followers";
import { interactionCountsForNotes } from "@/lib/ap/interactions";
import { getApEnv } from "@/lib/ap/runtime";
import { listNotes } from "@/lib/ap/storage";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";
import { requireAccessUser } from "@/lib/api/tokens/request";

/**
 * List Notes with their federation/delivery status and interaction counts, for
 * the dashboard Note-management view (issue AP-8).
 */
export const GET: APIRoute = async ({ locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) return user;

	try {
		const env = await getApEnv();
		const notes = await listNotes(env);
		const ids = notes.map((note) => note.id);
		const [delivery, counts, followerCount] = await Promise.all([
			deliveryStatusForNotes(env, ids),
			interactionCountsForNotes(env, ids),
			countFollowers(env),
		]);

		return jsonNoStore({
			followerCount,
			notes: notes.map((note) => ({
				id: note.id,
				title: note.title,
				preview: note.content.slice(0, 140),
				source: note.source,
				publishDate: note.publishDate.toISOString(),
				updatedDate: note.updatedDate.toISOString(),
				counts: counts.get(note.id) ?? { replies: 0, likes: 0, announces: 0 },
				delivery: delivery.get(note.id) ?? { pending: 0, delivered: 0, failed: 0, total: 0 },
			})),
		});
	} catch (error) {
		logApiError("ap.notes.list", error, { user: user.email });
		return jsonError(500, getErrorMessage(error, "Failed to list notes"));
	}
};

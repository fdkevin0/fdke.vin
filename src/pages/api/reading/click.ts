export const prerender = false;

import type { APIRoute } from "astro";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";
import { getFeedEnv } from "@/lib/feed/runtime";
import { extendFeedItemVisibility } from "@/lib/feed/storage";

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = (await request.json()) as { itemId?: string };
		const itemId = body.itemId?.trim();
		if (!itemId) {
			return jsonError(400, "Missing itemId");
		}

		const visibleUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
		const env = await getFeedEnv();
		const clickCount = await extendFeedItemVisibility(env, itemId, visibleUntil);
		if (clickCount === null) {
			return jsonError(404, "Reading item not found");
		}

		return jsonNoStore({ ok: true, itemId, visibleUntil, clickCount });
	} catch (error) {
		logApiError("reading.click", error);
		return jsonError(500, getErrorMessage(error, "Failed to extend reading item visibility"));
	}
};

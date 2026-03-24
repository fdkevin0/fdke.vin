export const prerender = false;

import type { APIRoute } from "astro";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";
import { getFeedEnv } from "@/lib/feed/runtime";
import { listVisibleFeedItems } from "@/lib/feed/storage";

export const GET: APIRoute = async () => {
	try {
		const env = await getFeedEnv();
		const items = await listVisibleFeedItems(env);
		return jsonNoStore({ items });
	} catch (error) {
		logApiError("reading.list", error);
		return jsonError(500, getErrorMessage(error, "Failed to load reading"));
	}
};

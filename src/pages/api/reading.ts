export const prerender = false;

import type { APIRoute } from "astro";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";
import { getFeedEnv } from "@/lib/feed/runtime";
import { listTodayRecommendations } from "@/lib/feed/storage";

export const GET: APIRoute = async () => {
	try {
		const env = await getFeedEnv();
		const recommendations = await listTodayRecommendations(env);
		return jsonNoStore({ recommendations });
	} catch (error) {
		logApiError("reading.list", error);
		return jsonError(500, getErrorMessage(error, "Failed to load random reading"));
	}
};

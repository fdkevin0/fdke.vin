export const prerender = false;

import type { APIRoute } from "astro";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";
import { requireAccessUser } from "@/lib/api/tokens/request";
import { getFeedEnv } from "@/lib/feed/runtime";
import { listTodayRecommendations } from "@/lib/feed/storage";

export const GET: APIRoute = async ({ locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) {
		return user;
	}

	try {
		const env = await getFeedEnv();
		const recommendations = await listTodayRecommendations(env);
		return jsonNoStore({ recommendations });
	} catch (error) {
		logApiError("feed.recommendations.today", error, { user: user.email });
		return jsonError(500, getErrorMessage(error, "Failed to load today recommendations"));
	}
};

export const prerender = false;

import type { APIRoute } from "astro";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";
import { requireAccessUser } from "@/lib/api/tokens/request";
import { getFeedEnv } from "@/lib/feed/runtime";
import {
	countFailedFeedItemsForAiRetry,
	retryFailedFeedItemsAi,
} from "@/lib/feed/storage";

export const GET: APIRoute = async ({ locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) {
		return user;
	}

	try {
		const env = await getFeedEnv();
		const failedCount = await countFailedFeedItemsForAiRetry(env);
		return jsonNoStore({ failedCount });
	} catch (error) {
		logApiError("feed.items.ai-retry.count", error, { user: user.email });
		return jsonError(500, getErrorMessage(error, "Failed to load AI retry status"));
	}
};

export const POST: APIRoute = async ({ locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) {
		return user;
	}

	try {
		const env = await getFeedEnv();
		const retriedCount = await retryFailedFeedItemsAi(env);
		return jsonNoStore({ retriedCount }, { status: 202 });
	} catch (error) {
		logApiError("feed.items.ai-retry.enqueue", error, { user: user.email });
		return jsonError(500, getErrorMessage(error, "Failed to retry AI items"));
	}
};

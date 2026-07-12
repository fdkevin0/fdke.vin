export const prerender = false;

import type { APIRoute } from "astro";
import { z } from "zod";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";
import { requireAccessUser } from "@/lib/api/tokens/request";
import { getFeedEnv } from "@/lib/feed/runtime";
import { listRecentFeedItems } from "@/lib/feed/storage";

const feedItemsQuerySchema = z.object({
	limit: z.coerce
		.number()
		.catch(50)
		.transform((value) => Math.min(Math.max(value, 1), 100)),
});

export const GET: APIRoute = async ({ locals, url }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) {
		return user;
	}

	try {
		const { limit } = feedItemsQuerySchema.parse({ limit: url.searchParams.get("limit") || 50 });
		const env = await getFeedEnv();
		const items = await listRecentFeedItems(env, limit);
		return jsonNoStore({ items });
	} catch (error) {
		logApiError("feed.items.list", error, { user: user.email });
		return jsonError(500, getErrorMessage(error, "Failed to list feed items"));
	}
};

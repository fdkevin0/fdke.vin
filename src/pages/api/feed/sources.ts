export const prerender = false;

import type { APIRoute } from "astro";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";
import { requireAccessUser } from "@/lib/api/tokens/request";
import { readFeedSourceInput } from "@/lib/feed/request";
import { getFeedEnv } from "@/lib/feed/runtime";
import { createFeedSource, listFeedSources } from "@/lib/feed/storage";

export const GET: APIRoute = async ({ locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) {
		return user;
	}

	try {
		const env = await getFeedEnv();
		const feeds = await listFeedSources(env);
		return jsonNoStore({ feeds });
	} catch (error) {
		logApiError("feed.sources.list", error, { user: user.email });
		return jsonError(500, getErrorMessage(error, "Failed to list feed sources"));
	}
};

export const POST: APIRoute = async ({ request, locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) {
		return user;
	}

	try {
		const input = await readFeedSourceInput(request);
		if (input instanceof Response) {
			return input;
		}

		const env = await getFeedEnv();
		const feed = await createFeedSource(env, input, user);
		return jsonNoStore({ feed }, { status: 201 });
	} catch (error) {
		logApiError("feed.sources.create", error, { user: user.email });
		return jsonError(500, getErrorMessage(error, "Failed to create feed source"));
	}
};

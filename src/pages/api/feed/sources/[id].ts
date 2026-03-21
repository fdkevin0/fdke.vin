export const prerender = false;

import type { APIRoute } from "astro";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";
import { requireAccessUser } from "@/lib/api/tokens/request";
import { readFeedSourceInput } from "@/lib/feed/request";
import { getFeedEnv } from "@/lib/feed/runtime";
import { deleteFeedSource, updateFeedSource } from "@/lib/feed/storage";

export const PATCH: APIRoute = async ({ params, request, locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) {
		return user;
	}

	const id = params.id;
	if (!id) {
		return jsonError(400, "Feed id is required");
	}

	try {
		const input = await readFeedSourceInput(request);
		if (input instanceof Response) {
			return input;
		}

		const env = await getFeedEnv();
		const feed = await updateFeedSource(env, id, input, user);
		if (!feed) {
			return jsonError(404, "Feed source not found");
		}

		return jsonNoStore({ feed });
	} catch (error) {
		logApiError("feed.sources.update", error, { user: user.email, id });
		return jsonError(500, getErrorMessage(error, "Failed to update feed source"));
	}
};

export const DELETE: APIRoute = async ({ params, locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) {
		return user;
	}

	const id = params.id;
	if (!id) {
		return jsonError(400, "Feed id is required");
	}

	try {
		const env = await getFeedEnv();
		const deleted = await deleteFeedSource(env, id);
		if (!deleted) {
			return jsonError(404, "Feed source not found");
		}
		return jsonNoStore({ ok: true });
	} catch (error) {
		logApiError("feed.sources.delete", error, { user: user.email, id });
		return jsonError(500, getErrorMessage(error, "Failed to delete feed source"));
	}
};

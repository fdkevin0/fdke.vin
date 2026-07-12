export const prerender = false;

import type { APIRoute } from "astro";
import { z } from "zod";
import { getErrorMessage, jsonError, jsonNoStore, logApiError, readJson } from "@/lib/api/http";
import { getFeedEnv } from "@/lib/feed/runtime";
import { extendFeedItemVisibility } from "@/lib/feed/storage";

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await readJson(
			request,
			z.object({ itemId: z.string("Missing itemId").trim().min(1, "Missing itemId") }),
		);
		if (body instanceof Response) return body;
		const { itemId } = body;

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

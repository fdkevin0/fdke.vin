export const prerender = false;

import type { APIRoute } from "astro";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";
import { requireAccessUser } from "@/lib/api/tokens/request";
import { triggerFeedRun } from "@/lib/feed/coordinator";
import { getFeedEnv } from "@/lib/feed/runtime";

export const POST: APIRoute = async ({ locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) {
		return user;
	}

	try {
		const env = await getFeedEnv();
		const run = await triggerFeedRun(env, "manual", user.email);
		return jsonNoStore({ run }, { status: 202 });
	} catch (error) {
		logApiError("feed.sync", error, { user: user.email });
		return jsonError(500, getErrorMessage(error, "Failed to trigger feed sync"));
	}
};

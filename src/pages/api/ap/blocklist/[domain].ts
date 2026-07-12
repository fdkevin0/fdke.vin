export const prerender = false;

import type { APIRoute } from "astro";
import { removeBlockedDomain } from "@/lib/ap/blocklist";
import { getApEnv } from "@/lib/ap/runtime";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";
import { requireAccessUser } from "@/lib/api/tokens/request";

/** Remove a domain from the inbox blocklist (issue AP-8). */
export const DELETE: APIRoute = async ({ params, locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) return user;

	const domain = params.domain?.trim();
	if (!domain) return jsonError(400, "Domain is required");

	try {
		const env = await getApEnv();
		await removeBlockedDomain(env, decodeURIComponent(domain));
		return jsonNoStore({ deleted: true, domain });
	} catch (error) {
		logApiError("ap.blocklist.remove", error, { user: user.email, domain });
		return jsonError(500, getErrorMessage(error, "Failed to remove domain"));
	}
};

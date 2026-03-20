export const prerender = false;

import type { APIRoute } from "astro";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";
import { requireAccessUser } from "@/lib/api/tokens/request";
import { rotateApiToken } from "@/lib/api/tokens/storage";

export const POST: APIRoute = async ({ params, locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) {
		return user;
	}

	const tokenId = params.id?.trim();
	if (!tokenId) {
		return jsonError(400, "Token id is required");
	}

	try {
		const rotated = await rotateApiToken({ user, tokenId });
		if (!rotated) {
			return jsonError(404, "Token not found");
		}

		return jsonNoStore(rotated);
	} catch (error) {
		logApiError("tokens.rotate", error, { tokenId, user: user.email });
		return jsonError(500, getErrorMessage(error, "Failed to rotate token"));
	}
};

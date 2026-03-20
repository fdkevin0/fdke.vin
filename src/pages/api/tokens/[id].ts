export const prerender = false;

import type { APIRoute } from "astro";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";
import { readTokenWriteInput, requireAccessUser } from "@/lib/api/tokens/request";
import { revokeApiToken, updateApiToken } from "@/lib/api/tokens/storage";

export const PATCH: APIRoute = async ({ request, params, locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) {
		return user;
	}

	const tokenId = params.id?.trim();
	if (!tokenId) {
		return jsonError(400, "Token id is required");
	}

	try {
		const input = await readTokenWriteInput(request);
		if (input instanceof Response) {
			return input;
		}

		const updated = await updateApiToken({ user, tokenId, ...input });
		if (!updated) {
			return jsonError(404, "Token not found");
		}

		return jsonNoStore({ token: updated });
	} catch (error) {
		logApiError("tokens.update", error, { tokenId, user: user.email });
		return jsonError(500, getErrorMessage(error, "Failed to update token"));
	}
};

export const DELETE: APIRoute = async ({ params, locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) {
		return user;
	}

	const tokenId = params.id?.trim();
	if (!tokenId) {
		return jsonError(400, "Token id is required");
	}

	try {
		const deleted = await revokeApiToken(user, tokenId);
		if (!deleted) {
			return jsonError(404, "Token not found");
		}

		return jsonNoStore({ ok: true });
	} catch (error) {
		logApiError("tokens.delete", error, { tokenId, user: user.email });
		return jsonError(500, getErrorMessage(error, "Failed to revoke token"));
	}
};

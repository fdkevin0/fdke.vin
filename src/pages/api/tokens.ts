export const prerender = false;

import type { APIRoute } from "astro";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";
import { readTokenWriteInput, requireAccessUser } from "@/lib/api/tokens/request";
import { createApiToken, listApiTokensForUser } from "@/lib/api/tokens/storage";

export const GET: APIRoute = async ({ locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) {
		return user;
	}

	try {
		const tokens = await listApiTokensForUser(user);
		return jsonNoStore({ tokens });
	} catch (error) {
		logApiError("tokens.list", error, { user: user.email });
		return jsonError(500, getErrorMessage(error, "Failed to list tokens"));
	}
};

export const POST: APIRoute = async ({ request, locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) {
		return user;
	}

	try {
		const input = await readTokenWriteInput(request);
		if (input instanceof Response) {
			return input;
		}

		const created = await createApiToken({ user, ...input });
		return jsonNoStore(created, { status: 201 });
	} catch (error) {
		logApiError("tokens.create", error, { user: user.email });
		return jsonError(500, getErrorMessage(error, "Failed to create token"));
	}
};

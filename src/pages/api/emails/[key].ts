export const prerender = false;

import type { APIRoute } from "astro";
import { getEmailContent } from "@/lib/api/email";
import { getErrorMessage, jsonError, logApiError, text } from "@/lib/api/http";

export const GET: APIRoute = async ({ params }) => {
	const key = params.key?.trim();
	if (!key) {
		return jsonError(400, "Email key is required");
	}

	try {
		const content = await getEmailContent(key);
		if (!content) {
			return jsonError(404, "Email not found");
		}

		return text(content, {
			status: 200,
			headers: { "Content-Type": "message/rfc822" },
		});
	} catch (error) {
		logApiError("emails.get", error, { key });
		return jsonError(500, getErrorMessage(error, "Failed to fetch email"));
	}
};

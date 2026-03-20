export const prerender = false;

import type { APIRoute } from "astro";
import { listEmails } from "@/lib/api/email";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";

export const GET: APIRoute = async () => {
	try {
		const emails = await listEmails();
		return jsonNoStore({ emails });
	} catch (error) {
		logApiError("emails.list", error);
		return jsonError(500, getErrorMessage(error, "Failed to fetch emails"));
	}
};

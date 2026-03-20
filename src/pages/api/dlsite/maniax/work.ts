export const prerender = false;

import type { APIRoute } from "astro";
import { getDlsiteWorkInfo, parseDlsiteLocale } from "@/lib/api/dlsite";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";

export const GET: APIRoute = async ({ url }) => {
	const code = url.searchParams.get("code")?.trim();
	if (!code) {
		return jsonError(400, "Please provide a code parameter");
	}

	const localeParam = url.searchParams.get("locale");
	const locale = parseDlsiteLocale(localeParam);
	if (localeParam && !locale) {
		return jsonError(400, "Invalid locale parameter");
	}

	try {
		const result = await getDlsiteWorkInfo(code, locale);
		return jsonNoStore(result);
	} catch (error) {
		logApiError("dlsite.maniax.work", error, { code, locale: locale ?? null });
		const message = getErrorMessage(error, "Failed to fetch DLsite work");
		if (message === "DLsite scrape shield encountered") {
			return jsonError(503, message);
		}

		return jsonError(500, message);
	}
};

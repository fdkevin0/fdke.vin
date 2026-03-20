export const prerender = false;

import type { APIRoute } from "astro";
import { listBocCurrencies } from "@/lib/api/exchange/boc";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";

export const GET: APIRoute = async ({ url }) => {
	if (url.searchParams.get("platform")?.toLowerCase() !== "boc") {
		return jsonError(400, "Unsupported platform");
	}

	try {
		const currencies = await listBocCurrencies();
		return jsonNoStore(currencies);
	} catch (error) {
		logApiError("exchange.currencies", error, { platform: url.searchParams.get("platform") });
		return jsonError(500, getErrorMessage(error, "Failed to load BOC currencies from DB"));
	}
};

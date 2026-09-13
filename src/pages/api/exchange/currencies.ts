export const prerender = false;

import type { APIRoute } from "astro";
import { listBocCurrencies } from "@/lib/api/exchange/boc";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";

export const GET: APIRoute = async () => {
	try {
		const currencies = await listBocCurrencies();
		return jsonNoStore(currencies);
	} catch (error) {
		logApiError("exchange.currencies", error);
		return jsonError(500, getErrorMessage(error, "Failed to load BOC currencies from DB"));
	}
};

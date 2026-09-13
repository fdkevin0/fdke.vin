export const prerender = false;

import type { APIRoute } from "astro";
import { queryBocRateHistory } from "@/lib/api/exchange/boc";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";

export const GET: APIRoute = async ({ url }) => {
	const currency = url.searchParams.get("currency")?.trim();
	if (!currency) return jsonError(400, "Currency is required");
	const rawLimit = url.searchParams.get("limit");
	const limit = rawLimit === null ? 30 : Number(rawLimit);
	if (!Number.isInteger(limit) || limit <= 0) return jsonError(400, "Invalid limit");

	try {
		const result = await queryBocRateHistory(currency, limit);
		if (result.length === 0) {
			return jsonError(404, `No rate found for ${currency.toUpperCase()}`);
		}

		return jsonNoStore(result);
	} catch (error) {
		logApiError("exchange.rates", error, { currency, limit });
		return jsonError(500, getErrorMessage(error, "Failed to load BOC rates from DB"));
	}
};

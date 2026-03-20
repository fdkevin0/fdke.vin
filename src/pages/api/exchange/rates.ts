export const prerender = false;

import type { APIRoute } from "astro";
import { normalizeExchangeDateParam, queryBocRateHistory } from "@/lib/api/exchange/boc";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";

export const GET: APIRoute = async ({ url }) => {
	if (url.searchParams.get("platform")?.toLowerCase() !== "boc") {
		return jsonError(400, "Unsupported platform");
	}

	const currency = url.searchParams.get("currency")?.trim();
	const start = normalizeExchangeDateParam(url.searchParams.get("start"));
	const end = normalizeExchangeDateParam(url.searchParams.get("end"));
	const limitParam = url.searchParams.get("limit");
	const limit = limitParam ? Number(limitParam) : undefined;
	const pageParam = url.searchParams.get("page");
	const page = pageParam ? Number(pageParam) : 1;
	const startTs = start ? Date.parse(start) : undefined;
	const endTs = end ? Date.parse(end) : undefined;

	if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0 || !Number.isInteger(limit))) {
		return jsonError(400, "Invalid limit");
	}

	if (!Number.isFinite(page) || page <= 0 || !Number.isInteger(page)) {
		return jsonError(400, "Invalid page");
	}

	if (url.searchParams.get("start") && !start) {
		return jsonError(400, "Invalid start time");
	}

	if (url.searchParams.get("end") && !end) {
		return jsonError(400, "Invalid end time");
	}

	if (startTs !== undefined && endTs !== undefined && startTs > endTs) {
		return jsonError(400, "start must be earlier than end");
	}

	try {
		const result = await queryBocRateHistory({
			currency: currency || undefined,
			start: start ?? undefined,
			end: end ?? undefined,
			limit: limit ?? undefined,
			page,
		});

		if (currency && result.pagination.total === 0) {
			return jsonError(404, `No rate found for ${currency.toUpperCase()}`);
		}

		return jsonNoStore(result);
	} catch (error) {
		logApiError("exchange.rates", error, {
			currency: currency ?? null,
			start: start ?? null,
			end: end ?? null,
			limit: limit ?? null,
			page,
		});
		return jsonError(500, getErrorMessage(error, "Failed to load BOC rates from DB"));
	}
};

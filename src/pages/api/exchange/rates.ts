export const prerender = false;

import type { APIRoute } from "astro";
import { z } from "zod";
import { normalizeExchangeDateParam, queryBocRateHistory } from "@/lib/api/exchange/boc";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";

const optionalPositiveInteger = z.preprocess(
	(value) => (value === null || value === "" ? undefined : value),
	z.coerce.number().int().positive().optional(),
);

const ratesQuerySchema = z.object({
	currency: z
		.string()
		.trim()
		.optional()
		.transform((value) => value || undefined),
	start: z
		.string()
		.nullable()
		.transform((value, context) => {
			if (!value) return undefined;
			const normalized = normalizeExchangeDateParam(value);
			if (normalized) return normalized;
			context.addIssue({ code: "custom", message: "Invalid start time" });
			return z.NEVER;
		}),
	end: z
		.string()
		.nullable()
		.transform((value, context) => {
			if (!value) return undefined;
			const normalized = normalizeExchangeDateParam(value);
			if (normalized) return normalized;
			context.addIssue({ code: "custom", message: "Invalid end time" });
			return z.NEVER;
		}),
	limit: optionalPositiveInteger,
	page: optionalPositiveInteger.default(1),
});

export const GET: APIRoute = async ({ url }) => {
	if (url.searchParams.get("platform")?.toLowerCase() !== "boc") {
		return jsonError(400, "Unsupported platform");
	}

	const query = ratesQuerySchema.safeParse({
		currency: url.searchParams.get("currency") ?? undefined,
		start: url.searchParams.get("start"),
		end: url.searchParams.get("end"),
		limit: url.searchParams.get("limit"),
		page: url.searchParams.get("page"),
	});
	if (!query.success) {
		const issue = query.error.issues[0];
		const field = issue?.path[0];
		const message =
			field === "limit" ? "Invalid limit" : field === "page" ? "Invalid page" : issue?.message;
		return jsonError(400, message ?? "Invalid query");
	}
	const { currency, start, end, limit, page } = query.data;
	const startTs = start ? Date.parse(start) : undefined;
	const endTs = end ? Date.parse(end) : undefined;

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

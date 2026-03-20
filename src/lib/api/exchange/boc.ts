import { getCloudflareEnv } from "@/lib/cloudflare-runtime";

const DEFAULT_HISTORY_LIMIT = 30;

interface BocRateRowRecord {
	currency: string;
	pub_time: string;
	buying_rate: number | null;
	cash_buying_rate: number | null;
	selling_rate: number | null;
	cash_selling_rate: number | null;
	middle_rate: number | null;
}

interface CountRow {
	count: number | string;
}

export interface BocRateRow {
	currency: string;
	buyingRate: number | null;
	cashBuyingRate: number | null;
	sellingRate: number | null;
	cashSellingRate: number | null;
	middleRate: number | null;
	pubTime: string;
}

export interface BocRateQueryOptions {
	currency?: string | undefined;
	start?: string | undefined;
	end?: string | undefined;
	limit?: number | undefined;
	page?: number | undefined;
}

export interface BocRateQueryResult {
	data: BocRateRow[];
	pagination: {
		total: number;
		page: number;
		pageSize: number;
		totalPages: number;
		hasNextPage: boolean;
	};
}

export async function listBocCurrencies(): Promise<string[]> {
	const db = await getDatabase();
	const result = await db
		.prepare(
			`SELECT currency
			 FROM boc_rate_history
			 GROUP BY currency
			 ORDER BY currency ASC`,
		)
		.all<{ currency: string }>();

	return (result.results ?? []).map((row) => row.currency);
}

export async function queryBocRateHistory(
	options: BocRateQueryOptions = {},
): Promise<BocRateQueryResult> {
	const db = await getDatabase();
	const currency = options.currency?.toUpperCase();
	const defaultLimit = options.start || options.end ? 200 : DEFAULT_HISTORY_LIMIT;
	const pageSize = Math.max(1, Math.min(options.limit ?? defaultLimit, 1000));
	const page = Math.max(1, options.page ?? 1);
	const offset = (page - 1) * pageSize;

	const { clause, bindings } = buildWhereClause({
		currency,
		start: options.start,
		end: options.end,
	});

	const totalResult = await db
		.prepare(`SELECT count(*) AS count FROM boc_rate_history${clause}`)
		.bind(...bindings)
		.first<CountRow>();

	const rowsResult = await db
		.prepare(
			`SELECT currency, pub_time, buying_rate, cash_buying_rate, selling_rate, cash_selling_rate, middle_rate
			 FROM boc_rate_history${clause}
			 ORDER BY pub_time DESC
			 LIMIT ? OFFSET ?`,
		)
		.bind(...bindings, pageSize, offset)
		.all<BocRateRowRecord>();

	const total = Number(totalResult?.count ?? 0);
	const totalPages = Math.ceil(total / pageSize);

	return {
		data: (rowsResult.results ?? []).map(mapRateRow),
		pagination: {
			total,
			page,
			pageSize,
			totalPages,
			hasNextPage: page < totalPages,
		},
	};
}

export function normalizeExchangeDateParam(value: string | null): string | undefined {
	if (!value) {
		return undefined;
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return undefined;
	}

	const raw = Number(trimmed);
	if (!Number.isFinite(raw) || raw < 0) {
		return undefined;
	}

	return formatUtcTimestamp(raw * 1000);
}

function formatUtcTimestamp(ms: number): string {
	const date = new Date(ms);
	const pad = (value: number) => value.toString().padStart(2, "0");
	return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function buildWhereClause(options: {
	currency?: string | undefined;
	start?: string | undefined;
	end?: string | undefined;
}): {
	clause: string;
	bindings: unknown[];
} {
	const conditions: string[] = [];
	const bindings: unknown[] = [];

	if (options.currency) {
		conditions.push("currency = ?");
		bindings.push(options.currency);
	}

	if (options.start) {
		conditions.push("pub_time >= ?");
		bindings.push(options.start);
	}

	if (options.end) {
		conditions.push("pub_time <= ?");
		bindings.push(options.end);
	}

	return {
		clause: conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "",
		bindings,
	};
}

function mapRateRow(row: BocRateRowRecord): BocRateRow {
	return {
		currency: row.currency,
		buyingRate: row.buying_rate,
		cashBuyingRate: row.cash_buying_rate,
		sellingRate: row.selling_rate,
		cashSellingRate: row.cash_selling_rate,
		middleRate: row.middle_rate,
		pubTime: row.pub_time,
	};
}

async function getDatabase(): Promise<D1Database> {
	const runtimeEnv = await getCloudflareEnv<{ DATABASE?: D1Database }>();
	if (!runtimeEnv.DATABASE) {
		throw new Error("DATABASE is not configured");
	}

	return runtimeEnv.DATABASE;
}

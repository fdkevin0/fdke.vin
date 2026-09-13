import { requireCloudflareEnv } from "@/lib/cloudflare-runtime";

const DEFAULT_HISTORY_LIMIT = 30;

export interface BocRateRow {
	currency: string;
	buyingRate: number | null;
	cashBuyingRate: number | null;
	sellingRate: number | null;
	cashSellingRate: number | null;
	middleRate: number | null;
	pubTime: string;
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
	currency: string,
	limit = DEFAULT_HISTORY_LIMIT,
): Promise<BocRateRow[]> {
	return queryBocRateHistoryFrom(await getDatabase(), currency, limit);
}

/** The pure D1 query kept separate so the Node test suite can exercise it. */
export async function queryBocRateHistoryFrom(
	db: D1Database,
	currency: string,
	limit = DEFAULT_HISTORY_LIMIT,
): Promise<BocRateRow[]> {
	const pageSize = Math.max(1, Math.min(limit, 1000));
	const rowsResult = await db
		.prepare(
			`SELECT currency, pub_time AS pubTime, buying_rate AS buyingRate,
			        cash_buying_rate AS cashBuyingRate, selling_rate AS sellingRate,
			        cash_selling_rate AS cashSellingRate, middle_rate AS middleRate
			 FROM boc_rate_history
			 WHERE currency = ?
			 ORDER BY pub_time DESC
			 LIMIT ?`,
		)
		.bind(currency.toUpperCase(), pageSize)
		.all<BocRateRow>();

	return rowsResult.results ?? [];
}

async function getDatabase(): Promise<D1Database> {
	return (await requireCloudflareEnv("DATABASE")).DATABASE;
}

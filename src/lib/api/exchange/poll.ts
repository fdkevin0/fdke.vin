import type { BocRateRow } from "@/lib/api/exchange/boc";

/**
 * The Bank of China published-rates page, English edition. The table is plain
 * server-rendered HTML with one seven-cell row per currency.
 */
const BOC_URL = "https://www.bankofchina.com/sourcedb/whpj/enindex_1619.html";

/** The header row's first cell — skipped rather than parsed as a currency. */
const HEADER_CELL = "Currency Name";

/** Every BOC rate row carries exactly these seven cells, in this order. */
const CELLS_PER_ROW = 7;

/**
 * The cron expression that drives the poll, matched in `src/worker.ts` to tell
 * this trigger apart from the hourly feed run. Must stay in sync with
 * `triggers.crons` in `wrangler.jsonc`.
 */
export const BOC_POLL_CRON = "*/2 * * * *";

export interface BocPollResult {
	/** Rows parsed off the page. */
	fetched: number;
	/** Rows that were new — i.e. a currency/pub_time pair not already stored. */
	inserted: number;
}

/**
 * One BOC rate poll: fetch the published-rates page, parse it, and append any
 * publication we have not already stored.
 *
 * `boc_rate_history` is keyed by `(currency, pub_time)`, so a repeat poll that
 * sees the same publication inserts nothing — `INSERT OR IGNORE` makes that the
 * normal, silent case rather than an error.
 */
export async function pollBocRates(env: Env): Promise<BocPollResult> {
	const rates = await fetchBocRates();
	const inserted = await recordBocRates(env, rates);
	return { fetched: rates.length, inserted };
}

/** Fetch and parse the BOC published-rates page. */
export async function fetchBocRates(): Promise<BocRateRow[]> {
	const response = await fetch(BOC_URL);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch Bank of China rates: ${response.status} ${response.statusText}`,
		);
	}
	return parseBocRates(response);
}

/**
 * Parse the rate table out of a BOC page response.
 *
 * Uses `HTMLRewriter` so the page streams rather than landing in memory as a
 * string. Only *start* tags drive the state machine — `</td>` and `</tr>` are
 * optional in HTML and BOC's markup cannot be relied on to emit them — so a new
 * `<td>` closes the previous cell and a new `<tr>` closes the previous row.
 */
export async function parseBocRates(response: Response): Promise<BocRateRow[]> {
	const rows: BocRateRow[] = [];
	let cells: string[] = [];
	let cell: string | null = null;

	const closeCell = () => {
		if (cell !== null) cells.push(cell);
		cell = null;
	};

	const closeRow = () => {
		const row = parseRateCells(cells);
		if (row) rows.push(row);
		cells = [];
	};

	const appendText = (text: string) => {
		if (cell !== null) cell += text;
	};

	const rewriter = new HTMLRewriter()
		.on("tr", {
			element() {
				closeCell();
				closeRow();
			},
		})
		// A `td` text handler fires for the cell's whole subtree, so text nested in
		// `<td><font>7.09</font></td>` arrives here too — a second `td *` handler
		// would append the same chunk twice.
		.on("td", {
			element() {
				closeCell();
				cell = "";
			},
			text(chunk) {
				appendText(chunk.text);
			},
		});

	await rewriter.transform(response).arrayBuffer();

	// The document ends without another `<tr>` to close the final row.
	closeCell();
	closeRow();

	return rows;
}

/**
 * Turn one row's raw cell texts into a rate row, or `null` when the row is not a
 * rate row (wrong cell count, the header, or an empty currency).
 */
export function parseRateCells(cells: string[]): BocRateRow | null {
	if (cells.length !== CELLS_PER_ROW) return null;

	const currency = cleanText(cells[0] ?? "");
	if (!currency || currency === HEADER_CELL) return null;

	// The publication cell trails a non-breaking space; drop it outright rather
	// than folding it to a space, so the stored `pub_time` string stays byte-for-byte
	// what the previous cheerio-based poller wrote (it is half the primary key).
	const pubTime = decodeEntities(cells[6] ?? "")
		.replace(/\u00a0/g, "")
		.trim();
	if (!pubTime) return null;

	return {
		currency,
		buyingRate: toNumber(cells[1]),
		cashBuyingRate: toNumber(cells[2]),
		sellingRate: toNumber(cells[3]),
		cashSellingRate: toNumber(cells[4]),
		middleRate: toNumber(cells[5]),
		pubTime,
	};
}

/** Append the rows we have not stored yet; returns how many were actually new. */
export async function recordBocRates(env: Env, rates: BocRateRow[]): Promise<number> {
	if (rates.length === 0) return 0;

	// One statement per row so a single malformed currency cannot reject the
	// whole publication, batched into one round trip.
	const statements = rates.map((rate) =>
		env.DATABASE.prepare(
			`INSERT OR IGNORE INTO boc_rate_history
			 (currency, pub_time, buying_rate, cash_buying_rate, selling_rate, cash_selling_rate, middle_rate)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		).bind(
			rate.currency,
			rate.pubTime,
			rate.buyingRate,
			rate.cashBuyingRate,
			rate.sellingRate,
			rate.cashSellingRate,
			rate.middleRate,
		),
	);

	const results = await env.DATABASE.batch(statements);
	return results.reduce((sum, result) => sum + (result.meta?.changes ?? 0), 0);
}

/**
 * `HTMLRewriter` hands back the raw source text of a node, so character
 * references arrive undecoded — BOC's cells are full of `&nbsp;`.
 */
function decodeEntities(value: string): string {
	return (
		value
			.replace(/&nbsp;/gi, "\u00a0")
			.replace(/&lt;/gi, "<")
			.replace(/&gt;/gi, ">")
			.replace(/&quot;/gi, '"')
			.replace(/&#0*39;/g, "'")
			// Last: an already-decoded `&` must not re-trigger the rules above.
			.replace(/&amp;/gi, "&")
	);
}

/** Decode entities and trim — `trim()` also removes a leading/trailing non-breaking space. */
function cleanText(value: string): string {
	return decodeEntities(value).trim();
}

/** A rate cell is a number or blank; anything else is stored as `NULL`. */
function toNumber(value: string | undefined): number | null {
	const cleaned = cleanText(value ?? "");
	if (!cleaned) return null;
	const num = Number(cleaned);
	return Number.isFinite(num) ? num : null;
}

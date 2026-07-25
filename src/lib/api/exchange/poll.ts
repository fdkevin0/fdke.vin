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
 *
 * BOC publishes about three times a day, so a quarter-hour poll cannot miss a
 * publication; the watermark below makes the runs in between free anyway.
 */
export const BOC_POLL_CRON = "*/15 * * * *";

export interface BocPollResult {
	/** Rows parsed off the page. */
	fetched: number;
	/** Rows that were new — i.e. a currency/pub_time pair not already stored. */
	inserted: number;
	/** True when the watermark already covered the fetched round and nothing was written. */
	alreadyStored: boolean;
}

/**
 * The last publication round the poll stored: its publication time, and how many
 * rows of it landed. The count is what keeps a round that only partly parsed
 * recoverable — see {@link isPublicationRoundStored}.
 */
export interface PollWatermark {
	pubTime: string;
	rowCount: number;
}

/**
 * One BOC rate poll: fetch the published-rates page, parse it, and append the
 * publication round if we have not already stored it.
 */
export async function pollBocRates(env: Env): Promise<BocPollResult> {
	const rates = await fetchBocRates();
	return recordPublicationRound(env, rates);
}

/**
 * Store a fetched publication round, unless the watermark says we already have it.
 *
 * `boc_rate_history` is keyed by `(currency, pub_time)`, so re-inserting a stored
 * round would be harmless — but it would cost one ignored statement per currency,
 * on every run, for the ~99% of runs that fall between rounds. Reading the
 * watermark first makes "is this round new?" one decision here rather than forty
 * conflicts in D1.
 */
export async function recordPublicationRound(
	env: Env,
	rates: BocRateRow[],
): Promise<BocPollResult> {
	if (rates.length === 0) return { fetched: 0, inserted: 0, alreadyStored: false };

	const watermark = await readPollWatermark(env);
	if (isPublicationRoundStored(rates, watermark)) {
		return { fetched: rates.length, inserted: 0, alreadyStored: true };
	}

	const inserted = await storePublicationRound(env, rates);
	return { fetched: rates.length, inserted, alreadyStored: false };
}

/**
 * The newest publication time on a fetched page, or `null` if it held no rows.
 *
 * `pub_time` is a zero-padded `YYYY/MM/DD HH:MM:SS`, so string order is
 * chronological order and no parsing is needed to compare two of them.
 */
export function latestPublicationTime(rates: BocRateRow[]): string | null {
	let latest: string | null = null;
	for (const rate of rates) {
		if (latest === null || rate.pubTime > latest) latest = rate.pubTime;
	}
	return latest;
}

/**
 * True when the page is exactly the publication round the watermark recorded,
 * i.e. the poll has nothing to write.
 *
 * Two guards keep the watermark from hiding a row we never stored, which the
 * `(currency, pub_time)` primary key can no longer heal once we stop writing:
 *
 * - *every* row must sit at the watermark's publication time, not merely be no
 *   newer than it. BOC advances all currencies together, so this is normally one
 *   comparison; a currency that somehow lagged behind still gets written.
 * - the page must hold no more rows than we stored. `parseBocRates` drops rows it
 *   cannot read, so a round can land incomplete — the count is what makes the
 *   next poll re-write it instead of skipping it forever.
 */
export function isPublicationRoundStored(
	rates: BocRateRow[],
	watermark: PollWatermark | null,
): boolean {
	if (watermark === null || rates.length === 0) return false;
	if (rates.length > watermark.rowCount) return false;
	return rates.every((rate) => rate.pubTime === watermark.pubTime);
}

/**
 * The last round we stored, or `null` before the first poll — the one statement a
 * poll between rounds issues.
 *
 * A read failure is reported as "no watermark", which costs a full write pass the
 * primary key would absorb anyway. That keeps the poll working on a deploy that
 * lands before `boc_poll_state` exists: the write path creates it.
 */
async function readPollWatermark(env: Env): Promise<PollWatermark | null> {
	try {
		const row = await env.DATABASE.prepare(
			"SELECT last_pub_time, last_row_count FROM boc_poll_state WHERE id = 1",
		).first<{ last_pub_time: string; last_row_count: number }>();
		if (!row) return null;
		return { pubTime: row.last_pub_time, rowCount: row.last_row_count };
	} catch (error) {
		console.warn("[cron:boc] could not read the poll watermark", error);
		return null;
	}
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

/**
 * Append the rows of a round we have not stored yet and advance the watermark
 * over them; returns how many rows were actually new.
 */
export async function storePublicationRound(env: Env, rates: BocRateRow[]): Promise<number> {
	const latest = latestPublicationTime(rates);
	if (latest === null) return 0;

	// Only on the write path — a few times a day — so a poll between rounds stays
	// at one statement rather than paying for this on every cold isolate.
	await ensurePollStateSchema(env);

	// One statement per row so a single malformed currency cannot reject the
	// whole round, batched into one round trip.
	const inserts = rates.map((rate) =>
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

	// Last in the same batch — D1 runs a batch as one transaction, so the watermark
	// cannot move past rows that failed to land. The `WHERE` guard keeps it
	// monotonic: a stale page can never rewind it and hide a later round, but a
	// fuller read of the round we are already on can raise the count.
	const advanceWatermark = env.DATABASE.prepare(
		`INSERT INTO boc_poll_state (id, last_pub_time, last_row_count) VALUES (1, ?1, ?2)
		 ON CONFLICT(id) DO UPDATE SET last_pub_time = ?1, last_row_count = ?2
		 WHERE last_pub_time < ?1 OR (last_pub_time = ?1 AND last_row_count < ?2)`,
	).bind(latest, rates.length);

	const results = await env.DATABASE.batch([...inserts, advanceWatermark]);
	return results
		.slice(0, inserts.length)
		.reduce((sum, result) => sum + (result.meta?.changes ?? 0), 0);
}

let ensureSchemaPromise: Promise<void> | null = null;

/**
 * `boc_rate_history` predates this repo and is owned by `scripts/d1/exchange.sql`,
 * but `boc_poll_state` is new — creating it lazily keeps a deploy from silently
 * breaking the poll until someone remembers to run the script.
 */
function ensurePollStateSchema(env: Env): Promise<void> {
	if (!ensureSchemaPromise) {
		ensureSchemaPromise = (async () => {
			await env.DATABASE.prepare(
				`CREATE TABLE IF NOT EXISTS boc_poll_state (
					id INTEGER PRIMARY KEY CHECK (id = 1),
					last_pub_time TEXT NOT NULL,
					last_row_count INTEGER NOT NULL
				)`,
			).run();
		})();
	}
	return ensureSchemaPromise;
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

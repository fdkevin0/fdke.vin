import { describe, expect, it } from "vitest";
import type { BocRateRow } from "@/lib/api/exchange/boc";
import {
	isPublicationRoundStored,
	latestPublicationTime,
	parseRateCells,
	recordPublicationRound,
} from "@/lib/api/exchange/poll";

/**
 * Covers the pure half of the BOC poller — raw table cells to a rate row. The
 * streaming half (`parseBocRates`) needs the Workers `HTMLRewriter` global, which
 * this node-based vitest run does not provide.
 *
 * The cell shapes below are what the live page actually yields: `HTMLRewriter`
 * hands back undecoded source text, so `&nbsp;` arrives literally, and the
 * publication cell trails one.
 */
describe("parseRateCells", () => {
	const PUB_TIME_CELL = "2026/07/26 00:00:05&nbsp;";
	const usd = ["USD", "708.51", "702.72", "711.44", "711.44", "709.5", PUB_TIME_CELL];

	it("maps the seven cells onto a rate row", () => {
		expect(parseRateCells(usd)).toEqual({
			currency: "USD",
			buyingRate: 708.51,
			cashBuyingRate: 702.72,
			sellingRate: 711.44,
			cashSellingRate: 711.44,
			middleRate: 709.5,
			pubTime: "2026/07/26 00:00:05",
		});
	});

	it("drops a non-breaking space rather than folding it to a space", () => {
		// `pub_time` is half the primary key, so it has to stay byte-for-byte what the
		// previous cheerio-based poller wrote for the rows already in D1.
		const row = parseRateCells([...usd.slice(0, 6), "2026/07/26&nbsp;00:00:05"]);
		expect(row?.pubTime).toBe("2026/07/2600:00:05");
	});

	it("stores a blank rate cell as null rather than 0", () => {
		const row = parseRateCells(["HKD", "90.9", "", "91.3", "91.3", "&nbsp;", PUB_TIME_CELL]);
		expect(row?.cashBuyingRate).toBeNull();
		expect(row?.middleRate).toBeNull();
	});

	it("stores an unparseable rate cell as null", () => {
		const row = parseRateCells(["EUR", "n/a", "1", "2", "3", "4", PUB_TIME_CELL]);
		expect(row?.buyingRate).toBeNull();
	});

	it("skips the header row", () => {
		expect(
			parseRateCells([
				"Currency Name",
				"Buying Rate",
				"Cash Buying Rate",
				"Selling Rate",
				"Cash Selling Rate",
				"Middle Rate",
				"Pub Time",
			]),
		).toBeNull();
	});

	it("skips rows that are not seven cells wide", () => {
		expect(parseRateCells(["USD", "708.51"])).toBeNull();
		expect(parseRateCells([...usd, "extra"])).toBeNull();
	});

	it("skips a row with no currency or no publication time", () => {
		expect(parseRateCells(["", "1", "2", "3", "4", "5", PUB_TIME_CELL])).toBeNull();
		expect(parseRateCells(["USD", "1", "2", "3", "4", "5", "&nbsp;"])).toBeNull();
	});
});

/** A parsed rate row; only `currency` and `pubTime` matter to the watermark. */
function rate(currency: string, pubTime: string): BocRateRow {
	return {
		currency,
		buyingRate: 1,
		cashBuyingRate: 1,
		sellingRate: 1,
		cashSellingRate: 1,
		middleRate: 1,
		pubTime,
	};
}

describe("latestPublicationTime", () => {
	it("returns the newest publication time on the page", () => {
		// The strings are zero-padded, so lexicographic order is chronological order.
		expect(
			latestPublicationTime([
				rate("USD", "2026/07/26 00:00:05"),
				rate("EUR", "2026/07/26 10:30:11"),
				rate("HKD", "2026/07/26 05:30:02"),
			]),
		).toBe("2026/07/26 10:30:11");
	});

	it("returns null for an empty page", () => {
		expect(latestPublicationTime([])).toBeNull();
	});
});

describe("isPublicationRoundStored", () => {
	const PUB_TIME = "2026/07/26 10:30:11";
	const page = [rate("USD", PUB_TIME), rate("EUR", PUB_TIME)];

	it("is true when the page is exactly the round the watermark recorded", () => {
		expect(isPublicationRoundStored(page, { pubTime: PUB_TIME, rowCount: 2 })).toBe(true);
	});

	it("is false when the page has advanced past the watermark", () => {
		expect(isPublicationRoundStored(page, { pubTime: "2026/07/26 05:30:02", rowCount: 2 })).toBe(
			false,
		);
	});

	it("is false when the page holds more rows than we managed to store", () => {
		// The guard that keeps a partially parsed round recoverable: the watermark
		// advanced over 1 row, so a later poll seeing all 2 must still write.
		expect(isPublicationRoundStored(page, { pubTime: PUB_TIME, rowCount: 1 })).toBe(false);
	});

	it("is false when a single currency lags behind the watermark", () => {
		// BOC advances every currency together, so this should not happen — but a
		// lagging row must still be written rather than silently dropped.
		const mixed = [...page, rate("THB", "2026/07/26 05:30:02")];
		expect(isPublicationRoundStored(mixed, { pubTime: PUB_TIME, rowCount: 3 })).toBe(false);
	});

	it("is false when there is no watermark yet", () => {
		expect(isPublicationRoundStored(page, null)).toBe(false);
	});

	it("is false for an empty page, so nothing is mistaken for stored", () => {
		expect(isPublicationRoundStored([], { pubTime: PUB_TIME, rowCount: 2 })).toBe(false);
	});
});

/**
 * A D1 stand-in that records the statements actually executed. The point of the
 * watermark is how many statements a poll issues, so the tests below assert on
 * that count rather than on stored rows.
 */
function fakeDatabase(stored: { pubTime: string; rowCount: number } | null) {
	const executed: { sql: string; params: unknown[] }[] = [];

	const prepare = (sql: string) => {
		let params: unknown[] = [];
		const statement = {
			bind(...bound: unknown[]) {
				params = bound;
				return statement;
			},
			run: async () => {
				executed.push({ sql, params });
				return { meta: { changes: 1 } };
			},
			first: async () => {
				executed.push({ sql, params });
				if (stored === null) return null;
				return { last_pub_time: stored.pubTime, last_row_count: stored.rowCount };
			},
			_execute() {
				executed.push({ sql, params });
			},
		};
		return statement;
	};

	const database = {
		prepare,
		batch: async (statements: { _execute(): void }[]) => {
			for (const statement of statements) statement._execute();
			return statements.map(() => ({ meta: { changes: 1 } }));
		},
	};

	const writes = () => executed.filter(({ sql }) => /INSERT|UPDATE|DELETE/i.test(sql));

	return { env: { DATABASE: database } as unknown as Env, executed, writes };
}

describe("recordPublicationRound", () => {
	const PUB_TIME = "2026/07/26 10:30:11";
	const page = [rate("USD", PUB_TIME), rate("EUR", PUB_TIME)];

	it("issues exactly one statement, and no writes, for a round we already stored", async () => {
		const db = fakeDatabase({ pubTime: PUB_TIME, rowCount: 2 });
		const result = await recordPublicationRound(db.env, page);

		expect(result).toEqual({ fetched: 2, inserted: 0, alreadyStored: true });
		expect(db.writes()).toEqual([]);
		expect(db.executed).toHaveLength(1);
		expect(db.executed[0]?.sql).toContain("SELECT last_pub_time");
	});

	it("inserts the rows and advances the watermark when the round is new", async () => {
		const db = fakeDatabase({ pubTime: "2026/07/26 05:30:02", rowCount: 2 });
		const result = await recordPublicationRound(db.env, page);

		expect(result).toEqual({ fetched: 2, inserted: 2, alreadyStored: false });
		// Two rows plus the watermark; the row count travels with the publication time.
		expect(db.writes()).toHaveLength(3);
		expect(db.writes().at(-1)?.params).toEqual([PUB_TIME, 2]);
	});

	it("re-writes a round the watermark only partly covers", async () => {
		// The regression the row count exists to prevent: a round stored with one of
		// its two currencies must not be skipped once the full page parses.
		const db = fakeDatabase({ pubTime: PUB_TIME, rowCount: 1 });
		const result = await recordPublicationRound(db.env, page);

		expect(result.alreadyStored).toBe(false);
		expect(db.writes().at(-1)?.params).toEqual([PUB_TIME, 2]);
	});

	it("inserts everything on the first poll, when no watermark exists yet", async () => {
		const db = fakeDatabase(null);
		const result = await recordPublicationRound(db.env, page);

		expect(result.alreadyStored).toBe(false);
		expect(result.inserted).toBe(2);
	});

	it("touches the database at all only when there are rows to consider", async () => {
		const db = fakeDatabase({ pubTime: PUB_TIME, rowCount: 2 });
		const result = await recordPublicationRound(db.env, []);

		expect(result).toEqual({ fetched: 0, inserted: 0, alreadyStored: false });
		expect(db.executed).toEqual([]);
	});
});

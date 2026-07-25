import { describe, expect, it } from "vitest";
import { parseRateCells } from "@/lib/api/exchange/poll";

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

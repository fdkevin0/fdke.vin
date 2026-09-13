import { describe, expect, it } from "vitest";
import { queryBocRateHistoryFrom } from "@/lib/api/exchange/boc";
import { fakeD1 } from "@/lib/testing/fake-d1";

/**
 * Covers the SQL half of the rate-history read. `queryBocRateHistory` resolves the
 * D1 binding through `cloudflare:workers`, which this node-based vitest run cannot
 * import, so the query itself takes the database as an argument.
 *
 * The point of the change these tests guard (issue #75) is which statements the
 * read issues, so they assert on that as much as on the rows returned.
 */

/** A stored row after the query's SQL aliases are applied. */
function row(pubTime: string, currency = "USD") {
	return {
		currency,
		pubTime,
		buyingRate: 708.51,
		cashBuyingRate: 702.72,
		sellingRate: 711.44,
		cashSellingRate: 711.44,
		middleRate: 709.5,
	};
}

/** `count` rows, newest first, one minute apart. */
function rows(count: number) {
	return Array.from({ length: count }, (_, index) =>
		row(`2026/07/26 10:${String(59 - index).padStart(2, "0")}:00`),
	);
}

describe("queryBocRateHistoryFrom", () => {
	it("issues one statement, and never a count(*)", async () => {
		const { db, executed } = fakeD1(rows(5));
		await queryBocRateHistoryFrom(db, "usd");

		expect(executed).toHaveLength(1);
		expect(executed[0]?.sql).not.toMatch(/count\s*\(/i);
	});

	it("returns the SQL-aliased API shape", async () => {
		const { db } = fakeD1([row("2026/07/26 10:30:11")]);
		const result = await queryBocRateHistoryFrom(db, "USD");

		expect(result[0]).toEqual({
			currency: "USD",
			buyingRate: 708.51,
			cashBuyingRate: 702.72,
			sellingRate: 711.44,
			cashSellingRate: 711.44,
			middleRate: 709.5,
			pubTime: "2026/07/26 10:30:11",
		});
	});

	it("upper-cases the currency filter", async () => {
		const { db, executed } = fakeD1(rows(1));
		await queryBocRateHistoryFrom(db, "hkd");

		expect(executed[0]?.sql).toContain("currency = ?");
		expect(executed[0]?.params[0]).toBe("HKD");
	});

	it("clamps an absurd limit rather than letting a caller read the whole table", async () => {
		const { db, executed } = fakeD1(rows(1));
		await queryBocRateHistoryFrom(db, "USD", 100_000);

		expect(executed[0]?.params).toEqual(["USD", 1000]);
	});
});

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

/** A stored row, in the snake_case shape D1 hands back. */
function row(pubTime: string, currency = "USD") {
	return {
		currency,
		pub_time: pubTime,
		buying_rate: 708.51,
		cash_buying_rate: 702.72,
		selling_rate: 711.44,
		cash_selling_rate: 711.44,
		middle_rate: 709.5,
	};
}

/** `count` rows, newest first, one minute apart — enough to fill a page. */
function rows(count: number) {
	return Array.from({ length: count }, (_, index) =>
		row(`2026/07/26 10:${String(59 - index).padStart(2, "0")}:00`),
	);
}

describe("queryBocRateHistoryFrom", () => {
	it("issues one statement, and never a count(*)", async () => {
		const { db, executed } = fakeD1(rows(5));
		await queryBocRateHistoryFrom(db, { currency: "usd" });

		expect(executed).toHaveLength(1);
		expect(executed[0]?.sql).not.toMatch(/count\s*\(/i);
	});

	it("asks for one row beyond the page, which is how it knows there is a next one", async () => {
		const { db, executed } = fakeD1(rows(5));
		await queryBocRateHistoryFrom(db, { currency: "USD", limit: 10, page: 3 });

		// LIMIT then OFFSET, after the where-clause bindings.
		expect(executed[0]?.params).toEqual(["USD", 11, 20]);
	});

	it("reports a next page and drops the extra row from the data", async () => {
		const { db } = fakeD1(rows(11));
		const result = await queryBocRateHistoryFrom(db, { currency: "USD", limit: 10 });

		expect(result.data).toHaveLength(10);
		expect(result.pagination).toEqual({ page: 1, pageSize: 10, hasNextPage: true });
	});

	it("reports no next page when the extra row does not come back", async () => {
		const { db } = fakeD1(rows(10));
		const result = await queryBocRateHistoryFrom(db, { currency: "USD", limit: 10 });

		expect(result.data).toHaveLength(10);
		expect(result.pagination.hasNextPage).toBe(false);
	});

	it("reports no next page for an exhausted page", async () => {
		const { db } = fakeD1([]);
		const result = await queryBocRateHistoryFrom(db, { currency: "USD", page: 9 });

		expect(result.data).toEqual([]);
		expect(result.pagination.hasNextPage).toBe(false);
	});

	it("maps a stored row onto the API's camelCase shape", async () => {
		const { db } = fakeD1([row("2026/07/26 10:30:11")]);
		const result = await queryBocRateHistoryFrom(db, { currency: "USD" });

		expect(result.data[0]).toEqual({
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
		await queryBocRateHistoryFrom(db, { currency: "hkd" });

		expect(executed[0]?.sql).toContain("currency = ?");
		expect(executed[0]?.params[0]).toBe("HKD");
	});

	it("binds a start/end range and widens the default page for it", async () => {
		const { db, executed } = fakeD1(rows(1));
		await queryBocRateHistoryFrom(db, { start: "2026-07-01 00:00:00", end: "2026-07-26 00:00:00" });

		expect(executed[0]?.params).toEqual([
			"2026-07-01 00:00:00",
			"2026-07-26 00:00:00",
			201, // the 200-row range default, plus the lookahead row
			0,
		]);
	});

	it("clamps an absurd limit rather than letting a caller page the whole table", async () => {
		const { db, executed } = fakeD1(rows(1));
		await queryBocRateHistoryFrom(db, { currency: "USD", limit: 100_000 });

		expect(executed[0]?.params).toEqual(["USD", 1001, 0]);
	});
});

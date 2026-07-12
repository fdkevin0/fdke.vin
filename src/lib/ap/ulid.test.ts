import { describe, expect, it } from "vitest";
import { decodeUlidTime, ulid } from "@/lib/ap/ulid";

const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]{26}$/;

describe("ulid", () => {
	it("produces a 26-char Crockford base32 string", () => {
		expect(ulid()).toMatch(CROCKFORD);
	});

	it("encodes the supplied timestamp so ids sort chronologically", () => {
		const earlier = ulid(1_000);
		const later = ulid(2_000);
		expect(earlier < later).toBe(true);
	});

	it("round-trips the timestamp via decodeUlidTime", () => {
		const t = 1_700_000_000_000;
		expect(decodeUlidTime(ulid(t))).toBe(t);
	});

	it("keeps ids unique and time-preserving within the same millisecond", () => {
		const t = 1_700_000_000_000;
		const ids = Array.from({ length: 50 }, () => ulid(t));
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) {
			expect(decodeUlidTime(id)).toBe(t);
		}
	});
});

import { describe, expect, it } from "vitest";
import {
	equivalentFocalLength,
	formatDistance,
	formatFocalLength,
	hyperfocalDistance,
} from "@/lib/tools/optics";

describe("hyperfocalDistance", () => {
	it("computes H = f² / (N × c) + f", () => {
		// 35 mm at f/8, full-frame CoC 0.030 mm — the calculator's default case
		const result = hyperfocalDistance(35, 8, 0.03);
		expect(result?.distanceMm).toBeCloseTo(5139.17, 2);
		expect(result?.nearLimitMm).toBeCloseTo(2569.58, 2);
	});

	it("returns null for non-positive or non-finite inputs", () => {
		expect(hyperfocalDistance(0, 8, 0.03)).toBeNull();
		expect(hyperfocalDistance(35, -1, 0.03)).toBeNull();
		expect(hyperfocalDistance(35, 8, Number.NaN)).toBeNull();
	});
});

describe("equivalentFocalLength", () => {
	it("scales by target/source crop factor", () => {
		// 35 mm on APS-C (1.5x) framed like full frame (1.0x)
		expect(equivalentFocalLength(35, 1.5, 1)).toBeCloseTo(23.333, 3);
		expect(equivalentFocalLength(35, 1, 1.5)).toBeCloseTo(52.5, 3);
	});

	it("returns null for non-positive or non-finite inputs", () => {
		expect(equivalentFocalLength(35, 0, 1)).toBeNull();
		expect(equivalentFocalLength(Number.POSITIVE_INFINITY, 1, 1)).toBeNull();
	});
});

describe("formatDistance", () => {
	it("uses metres from 1000 mm and millimetres below", () => {
		expect(formatDistance(5139.58)).toBe("5.14 m");
		expect(formatDistance(999.4)).toBe("999 mm");
	});
});

describe("formatFocalLength", () => {
	it("drops the decimal for whole millimetres", () => {
		expect(formatFocalLength(35)).toBe("35 mm");
		expect(formatFocalLength(52.5)).toBe("52.5 mm");
	});
});

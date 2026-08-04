import { describe, expect, it } from "vitest";
import { getSafeRedirectTarget } from "@/lib/auth-redirect";

const base = new URL("https://fdke.vin/auth?redirect=/dashboard");

describe("getSafeRedirectTarget", () => {
	it("keeps same-origin paths, query included", () => {
		expect(getSafeRedirectTarget("/dashboard/feed", base)).toBe("/dashboard/feed");
		expect(getSafeRedirectTarget("/tools/mail?box=inbox", base)).toBe("/tools/mail?box=inbox");
	});

	it("refuses targets that leave this origin", () => {
		for (const value of [
			"//evil.com",
			"https://evil.com/",
			// Browsers normalise the backslash into a second slash, which the old
			// startsWith("//") check let through.
			"/\\evil.com",
			"/\\/evil.com",
			"\\\\evil.com",
			"javascript:alert(1)",
		]) {
			expect(getSafeRedirectTarget(value, base), value).toBe("/dashboard/");
		}
	});

	it("refuses to bounce back into /auth", () => {
		expect(getSafeRedirectTarget("/auth", base)).toBe("/dashboard/");
		expect(getSafeRedirectTarget("/auth/", base)).toBe("/dashboard/");
		expect(getSafeRedirectTarget("/auth?redirect=/dashboard", base)).toBe("/dashboard/");
	});

	it("falls back when nothing usable was given", () => {
		expect(getSafeRedirectTarget(null, base)).toBe("/dashboard/");
		expect(getSafeRedirectTarget("", base)).toBe("/dashboard/");
	});

	it("drops the fragment rather than reflecting it", () => {
		expect(getSafeRedirectTarget("/dashboard#frag", base)).toBe("/dashboard");
	});
});

import { describe, expect, it } from "vitest";
import { acceptsActivityPub } from "@/lib/ap/accept";

describe("acceptsActivityPub", () => {
	it("returns false for missing or empty headers", () => {
		expect(acceptsActivityPub(null)).toBe(false);
		expect(acceptsActivityPub(undefined)).toBe(false);
		expect(acceptsActivityPub("")).toBe(false);
	});

	it("recognizes application/activity+json", () => {
		expect(acceptsActivityPub("application/activity+json")).toBe(true);
		expect(acceptsActivityPub("application/activity+json, text/html")).toBe(true);
		expect(acceptsActivityPub("text/html, application/activity+json;q=0.9")).toBe(true);
	});

	it("recognizes application/ld+json with the activitystreams profile (quoted)", () => {
		expect(
			acceptsActivityPub('application/ld+json; profile="https://www.w3.org/ns/activitystreams"'),
		).toBe(true);
		expect(
			acceptsActivityPub(
				'application/ld+json; profile="https://www.w3.org/ns/activitystreams", text/html',
			),
		).toBe(true);
	});

	it("recognizes application/ld+json with an unquoted activitystreams profile", () => {
		expect(
			acceptsActivityPub("application/ld+json; profile=https://www.w3.org/ns/activitystreams"),
		).toBe(true);
	});

	it("rejects plain application/ld+json without the activitystreams profile", () => {
		expect(acceptsActivityPub("application/ld+json")).toBe(false);
		expect(acceptsActivityPub('application/ld+json; profile="https://schema.org"')).toBe(false);
	});

	it("rejects ordinary browser Accept headers", () => {
		expect(
			acceptsActivityPub(
				"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
			),
		).toBe(false);
		expect(acceptsActivityPub("*/*")).toBe(false);
	});
});

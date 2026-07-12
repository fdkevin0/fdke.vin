import { describe, expect, it } from "vitest";
import { domainOf } from "@/lib/ap/blocklist";

describe("domainOf", () => {
	it("extracts the lower-cased host from an actor URI", () => {
		expect(domainOf("https://Mastodon.Social/users/alice")).toBe("mastodon.social");
	});

	it("accepts a bare domain by assuming https", () => {
		expect(domainOf("spam.example")).toBe("spam.example");
	});

	it("keeps a port when present", () => {
		expect(domainOf("https://localhost:8080/actor")).toBe("localhost:8080");
	});

	it("returns null for unparseable input", () => {
		expect(domainOf("")).toBeNull();
		expect(domainOf("   ")).toBeNull();
	});
});

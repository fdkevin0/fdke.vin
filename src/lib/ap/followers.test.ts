import { describe, expect, it } from "vitest";
import { dedupeDeliveryInboxes } from "@/lib/ap/followers";

describe("dedupeDeliveryInboxes", () => {
	it("collapses followers sharing an inbox to a single delivery target", () => {
		const inboxes = dedupeDeliveryInboxes([
			{ inboxUrl: "https://m.example/users/a/inbox", sharedInboxUrl: "https://m.example/inbox" },
			{ inboxUrl: "https://m.example/users/b/inbox", sharedInboxUrl: "https://m.example/inbox" },
		]);
		expect(inboxes).toEqual(["https://m.example/inbox"]);
	});

	it("falls back to the personal inbox when there is no shared inbox", () => {
		const inboxes = dedupeDeliveryInboxes([
			{ inboxUrl: "https://tiny.example/users/c/inbox", sharedInboxUrl: null },
		]);
		expect(inboxes).toEqual(["https://tiny.example/users/c/inbox"]);
	});

	it("keeps distinct servers' inboxes separate", () => {
		const inboxes = dedupeDeliveryInboxes([
			{ inboxUrl: "https://a.example/users/x/inbox", sharedInboxUrl: "https://a.example/inbox" },
			{ inboxUrl: "https://b.example/users/y/inbox", sharedInboxUrl: null },
		]);
		expect(inboxes).toHaveLength(2);
		expect(inboxes).toContain("https://a.example/inbox");
		expect(inboxes).toContain("https://b.example/users/y/inbox");
	});
});

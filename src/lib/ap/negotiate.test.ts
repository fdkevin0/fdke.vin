import { describe, expect, it } from "vitest";
import { negotiateNoteActivity } from "@/lib/ap/negotiate";
import type { Note } from "@/lib/ap/types";

const ORIGIN = "https://fdke.vin";

function note(overrides: Partial<Note> = {}): Note {
	return {
		id: "01KM1P8N00SAED8ZJQHD5ZW8D6",
		title: "Attention Residuals",
		content: "Impressive.",
		summary: null,
		publishDate: new Date("2026-03-19T00:00:00.000Z"),
		updatedDate: new Date("2026-03-19T00:00:00.000Z"),
		source: "migration",
		...overrides,
	};
}

describe("negotiateNoteActivity", () => {
	it("returns null for a browser Accept header", async () => {
		const res = await negotiateNoteActivity(note(), {
			accept: "text/html,application/xhtml+xml",
			origin: ORIGIN,
		});
		expect(res).toBeNull();
	});

	it("returns null when no Accept header is present", async () => {
		const res = await negotiateNoteActivity(note(), { accept: null, origin: ORIGIN });
		expect(res).toBeNull();
	});

	it("returns an AS2 Response for an ActivityPub Accept header", async () => {
		const res = await negotiateNoteActivity(note(), {
			accept: "application/activity+json",
			origin: ORIGIN,
		});
		expect(res).not.toBeNull();
		expect(res?.headers.get("Content-Type")).toBe("application/activity+json; charset=utf-8");
		expect(res?.headers.get("Vary")).toBe("Accept");

		const body = (await res?.json()) as Record<string, unknown>;
		expect(body.type).toBe("Note");
		expect(body.id).toBe("https://fdke.vin/notes/01KM1P8N00SAED8ZJQHD5ZW8D6/");
	});
});

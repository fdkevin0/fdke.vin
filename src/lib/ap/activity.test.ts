import { describe, expect, it } from "vitest";
import { activityForNote, deleteActivityForNote } from "@/lib/ap/activity";
import type { Note } from "@/lib/ap/types";

const ORIGIN = "https://fdke.vin";

function note(overrides: Partial<Note> = {}): Note {
	return {
		id: "01KM1P8N00SAED8ZJQHD5ZW8D6",
		title: null,
		content: "Hello fediverse.",
		summary: null,
		publishDate: new Date("2026-03-19T00:00:00.000Z"),
		updatedDate: new Date("2026-03-20T12:00:00.000Z"),
		source: "telegram",
		...overrides,
	};
}

describe("activityForNote", () => {
	it("wraps the note in a Create addressed to Public + followers", async () => {
		const act = await activityForNote("Create", note(), {
			origin: ORIGIN,
			htmlContent: "<p>Hello fediverse.</p>",
		});
		expect(act.type).toBe("Create");
		expect(act.actor).toBe("https://fdke.vin/actor");
		expect(act.to).toBe("as:Public");
		expect(act.cc).toBe("https://fdke.vin/followers");
		const object = act.object as Record<string, unknown>;
		expect(object.type).toBe("Note");
		expect(object.id).toBe("https://fdke.vin/notes/01KM1P8N00SAED8ZJQHD5ZW8D6/");
		expect(object.content).toBe("<p>Hello fediverse.</p>");
	});

	it("derives a stable Create id from the note object", async () => {
		const act = await activityForNote("Create", note(), {
			origin: ORIGIN,
			htmlContent: "<p>hi</p>",
		});
		expect(act.id).toBe("https://fdke.vin/notes/01KM1P8N00SAED8ZJQHD5ZW8D6/#create");
		expect(act.published).toBe("2026-03-19T00:00:00Z");
	});

	it("builds an Update whose id is versioned by the updated timestamp", async () => {
		const act = await activityForNote("Update", note(), {
			origin: ORIGIN,
			htmlContent: "<p>edited</p>",
		});
		expect(act.type).toBe("Update");
		expect(act.id).toBe(
			"https://fdke.vin/notes/01KM1P8N00SAED8ZJQHD5ZW8D6/#updates/2026-03-20T12:00:00.000Z",
		);
	});

	it("carries note attachments through into the wrapped object", async () => {
		const act = await activityForNote("Create", note(), {
			origin: ORIGIN,
			htmlContent: "<p>hi</p>",
			attachments: [{ url: "https://fdke.vin/media/a.jpg", mediaType: "image/jpeg", name: "alt" }],
		});
		const object = act.object as Record<string, unknown>;
		const att = object.attachment as Record<string, unknown>;
		expect(att.type).toBe("Document");
		expect(att.url).toBe("https://fdke.vin/media/a.jpg");
	});
});

describe("deleteActivityForNote", () => {
	it("builds a Delete(Tombstone) addressed to Public + followers from just the id", async () => {
		const act = await deleteActivityForNote("01KM1P8N00SAED8ZJQHD5ZW8D6", { origin: ORIGIN });
		expect(act.type).toBe("Delete");
		expect(act.actor).toBe("https://fdke.vin/actor");
		expect(act.id).toBe("https://fdke.vin/notes/01KM1P8N00SAED8ZJQHD5ZW8D6/#delete");
		expect(act.to).toBe("as:Public");
		expect(act.cc).toBe("https://fdke.vin/followers");
		const object = act.object as Record<string, unknown>;
		expect(object.type).toBe("Tombstone");
		expect(object.id).toBe("https://fdke.vin/notes/01KM1P8N00SAED8ZJQHD5ZW8D6/");
	});
});

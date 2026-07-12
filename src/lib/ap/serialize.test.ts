import { describe, expect, it } from "vitest";
import { type NoteAttachment, serializeNote } from "@/lib/ap/serialize";
import type { Note } from "@/lib/ap/types";

const ORIGIN = "https://fdke.vin";

function note(overrides: Partial<Note> = {}): Note {
	return {
		id: "01KM1P8N00SAED8ZJQHD5ZW8D6",
		title: "Attention Residuals",
		content: "> Residual connections...\n\nImpressive.",
		summary: null,
		publishDate: new Date("2026-03-19T00:00:00.000Z"),
		updatedDate: new Date("2026-03-19T00:00:00.000Z"),
		source: "migration",
		...overrides,
	};
}

function attachment(overrides: Partial<NoteAttachment> = {}): NoteAttachment {
	return {
		url: "https://fdke.vin/media/photo.jpg",
		mediaType: "image/jpeg",
		name: "A photo",
		...overrides,
	};
}

describe("serializeNote", () => {
	it("produces a Note with the canonical AS2 id and type", async () => {
		const out = await serializeNote(note(), { origin: ORIGIN, htmlContent: "<p>hi</p>" });
		expect(out.type).toBe("Note");
		expect(out.id).toBe("https://fdke.vin/notes/01KM1P8N00SAED8ZJQHD5ZW8D6/");
	});

	it("includes the ActivityStreams JSON-LD context", async () => {
		const out = await serializeNote(note(), { origin: ORIGIN, htmlContent: "<p>hi</p>" });
		const ctx = out["@context"];
		expect(Array.isArray(ctx)).toBe(true);
		expect((ctx as unknown[]).some((c) => c === "https://www.w3.org/ns/activitystreams")).toBe(
			true,
		);
	});

	it("attributes the note to the site actor and addresses Public + followers", async () => {
		const out = await serializeNote(note(), { origin: ORIGIN, htmlContent: "<p>hi</p>" });
		expect(out.attributedTo).toBe("https://fdke.vin/actor");
		// Fedify compacts the AS2 Public collection to its `as:` prefixed IRI.
		expect(out.to).toBe("as:Public");
		expect(out.cc).toBe("https://fdke.vin/followers");
	});

	it("honours a custom actor id and followers uri", async () => {
		const out = await serializeNote(note(), {
			origin: ORIGIN,
			htmlContent: "<p>hi</p>",
			actorId: "https://fdke.vin/users/fdkevin",
			followersUri: "https://fdke.vin/users/fdkevin/followers",
		});
		expect(out.attributedTo).toBe("https://fdke.vin/users/fdkevin");
		expect(out.cc).toBe("https://fdke.vin/users/fdkevin/followers");
	});

	it("places rendered HTML in content and raw markdown in source", async () => {
		const out = await serializeNote(note(), {
			origin: ORIGIN,
			htmlContent: "<p>hi <strong>world</strong></p>",
		});
		expect(out.content).toBe("<p>hi <strong>world</strong></p>");
		const source = out.source as Record<string, unknown>;
		expect(source.content).toBe("> Residual connections...\n\nImpressive.");
		expect(source.mediaType).toBe("text/markdown");
	});

	it("includes ISO published/updated timestamps", async () => {
		const out = await serializeNote(note(), { origin: ORIGIN, htmlContent: "<p>hi</p>" });
		expect(out.published).toBe("2026-03-19T00:00:00Z");
		expect(out.updated).toBe("2026-03-19T00:00:00Z");
	});

	it("omits summary when the note has none, and includes it when present", async () => {
		const without = await serializeNote(note(), { origin: ORIGIN, htmlContent: "<p>hi</p>" });
		expect(without.summary).toBeUndefined();
		const withSum = await serializeNote(note({ summary: "TL;DR" }), {
			origin: ORIGIN,
			htmlContent: "<p>hi</p>",
		});
		expect(withSum.summary).toBe("TL;DR");
	});

	it("omits attachment when none are provided", async () => {
		const out = await serializeNote(note(), { origin: ORIGIN, htmlContent: "<p>hi</p>" });
		expect(out.attachment).toBeUndefined();
	});

	it("serializes a media attachment as an AS2 Document", async () => {
		const out = await serializeNote(note(), {
			origin: ORIGIN,
			htmlContent: "<p>hi</p>",
			attachments: [attachment()],
		});
		const att = out.attachment as Record<string, unknown>;
		expect(att.type).toBe("Document");
		expect(att.mediaType).toBe("image/jpeg");
		expect(att.name).toBe("A photo");
		expect(att.url).toBe("https://fdke.vin/media/photo.jpg");
	});

	it("tolerates an origin with a trailing slash", async () => {
		const out = await serializeNote(note(), {
			origin: "https://fdke.vin/",
			htmlContent: "<p>hi</p>",
		});
		expect(out.id).toBe("https://fdke.vin/notes/01KM1P8N00SAED8ZJQHD5ZW8D6/");
		expect(out.attributedTo).toBe("https://fdke.vin/actor");
	});
});

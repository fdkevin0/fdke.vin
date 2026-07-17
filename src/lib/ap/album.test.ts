import { describe, expect, it } from "vitest";
import { ALBUM_DEBOUNCE_MS, decideAlbumFinalization } from "@/lib/ap/album";
import type { PendingAlbumPhoto } from "@/lib/ap/pendingAlbum";

const CHAT_ID = -1001234567890;
const GROUP_ID = "album-1";
const NOW = new Date("2024-03-09T16:00:10.000Z");

function photo(overrides: Partial<PendingAlbumPhoto> = {}): PendingAlbumPhoto {
	return {
		id: "row-1",
		groupId: GROUP_ID,
		chatId: CHAT_ID,
		messageId: 100,
		fileId: "file-1",
		fileUniqueId: "u1",
		mediaType: "image/jpeg",
		width: 1280,
		height: 853,
		content: "",
		publishDate: new Date("2024-03-09T16:00:00.000Z"),
		arrivedAt: new Date("2024-03-09T16:00:00.500Z"),
		...overrides,
	};
}

describe("decideAlbumFinalization", () => {
	it("decides empty for a group with no buffered rows", () => {
		expect(decideAlbumFinalization(CHAT_ID, GROUP_ID, [], NOW)).toEqual({ action: "empty" });
	});

	it("decides wait when the latest arrival is within the debounce window", () => {
		const rows = [photo({ arrivedAt: new Date(NOW.getTime() - 1000) })];
		expect(decideAlbumFinalization(CHAT_ID, GROUP_ID, rows, NOW)).toEqual({ action: "wait" });
	});

	it("decides finalize once the latest arrival is outside the debounce window", () => {
		const rows = [photo({ arrivedAt: new Date(NOW.getTime() - ALBUM_DEBOUNCE_MS) })];
		const decision = decideAlbumFinalization(CHAT_ID, GROUP_ID, rows, NOW);
		expect(decision.action).toBe("finalize");
	});

	it("waits if any row arrived within the window, even if others are older", () => {
		const rows = [
			photo({ id: "a", messageId: 1, arrivedAt: new Date(NOW.getTime() - 5000) }),
			photo({ id: "b", messageId: 2, arrivedAt: new Date(NOW.getTime() - 500) }),
		];
		expect(decideAlbumFinalization(CHAT_ID, GROUP_ID, rows, NOW).action).toBe("wait");
	});

	it("orders photos by Telegram message id, not arrival or array order", () => {
		const rows = [
			photo({
				id: "c",
				messageId: 103,
				fileId: "file-3",
				arrivedAt: new Date(NOW.getTime() - 4000),
			}),
			photo({
				id: "a",
				messageId: 101,
				fileId: "file-1",
				arrivedAt: new Date(NOW.getTime() - 4000),
			}),
			photo({
				id: "b",
				messageId: 102,
				fileId: "file-2",
				arrivedAt: new Date(NOW.getTime() - 4000),
			}),
		];
		const decision = decideAlbumFinalization(CHAT_ID, GROUP_ID, rows, NOW);
		if (decision.action !== "finalize") throw new Error("expected finalize");
		expect(decision.photos.map((p) => p.fileId)).toEqual(["file-1", "file-2", "file-3"]);
		expect(decision.photos.map((p) => p.messageId)).toEqual([101, 102, 103]);
		expect(decision.anchorMessageId).toBe(101);
	});

	it("takes content from the one row carrying a caption", () => {
		const rows = [
			photo({ id: "a", messageId: 1, arrivedAt: new Date(NOW.getTime() - 4000) }),
			photo({
				id: "b",
				messageId: 2,
				arrivedAt: new Date(NOW.getTime() - 4000),
				content: "**bold** caption",
			}),
		];
		const decision = decideAlbumFinalization(CHAT_ID, GROUP_ID, rows, NOW);
		if (decision.action !== "finalize") throw new Error("expected finalize");
		expect(decision.content).toBe("**bold** caption");
	});

	it("produces empty content when no row carries a caption", () => {
		const rows = [photo({ arrivedAt: new Date(NOW.getTime() - 4000) })];
		const decision = decideAlbumFinalization(CHAT_ID, GROUP_ID, rows, NOW);
		if (decision.action !== "finalize") throw new Error("expected finalize");
		expect(decision.content).toBe("");
	});

	it("takes the publish date of the earliest message, not the array order", () => {
		const rows = [
			photo({
				id: "a",
				messageId: 2,
				publishDate: new Date("2024-03-09T16:00:05.000Z"),
				arrivedAt: new Date(NOW.getTime() - 4000),
			}),
			photo({
				id: "b",
				messageId: 1,
				publishDate: new Date("2024-03-09T16:00:00.000Z"),
				arrivedAt: new Date(NOW.getTime() - 4000),
			}),
		];
		const decision = decideAlbumFinalization(CHAT_ID, GROUP_ID, rows, NOW);
		if (decision.action !== "finalize") throw new Error("expected finalize");
		expect(decision.publishDate.toISOString()).toBe("2024-03-09T16:00:00.000Z");
	});

	it("is idempotent: re-deciding an already-finalized (now-empty) group is a no-op", () => {
		const finalized = decideAlbumFinalization(
			CHAT_ID,
			GROUP_ID,
			[photo({ arrivedAt: new Date(NOW.getTime() - 4000) })],
			NOW,
		);
		expect(finalized.action).toBe("finalize");
		// The impure caller deletes the pending rows on finalize; a duplicate or
		// late trigger then sees no rows.
		expect(decideAlbumFinalization(CHAT_ID, GROUP_ID, [], NOW)).toEqual({ action: "empty" });
	});

	it("is idempotent: a duplicate trigger against a still-fresh group waits again", () => {
		const rows = [photo({ arrivedAt: new Date(NOW.getTime() - 1000) })];
		expect(decideAlbumFinalization(CHAT_ID, GROUP_ID, rows, NOW)).toEqual({ action: "wait" });
		expect(decideAlbumFinalization(CHAT_ID, GROUP_ID, rows, NOW)).toEqual({ action: "wait" });
	});
});

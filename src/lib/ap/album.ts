import type { PendingAlbumPhoto } from "@/lib/ap/pendingAlbum";
import type { ParsedPhoto } from "@/lib/ap/telegram";

/**
 * Pure decision logic for finalizing a Pending album (issue AP-11; see
 * CONTEXT.md "Album" / "Pending album" / "Finalization"): given a group's
 * buffered rows and the current time, decide whether to wait for more quiet
 * time or finalize into a Note input. The one new pure, unit-tested seam this
 * feature adds — no I/O. The impure side (downloading photos, inserting the
 * Note, delivering) lives in `./ingest.ts`.
 */

/** Quiet period since a group's latest arrival before it finalizes. */
export const ALBUM_DEBOUNCE_MS = 3_000;

/** One Album photo paired with the Telegram message that authored it. */
export interface AlbumPhoto extends ParsedPhoto {
	/** Links the resulting attachment back to its message, so a later edit of
	 * this specific photo replaces it instead of appending a duplicate. */
	messageId: number;
}

/** The assembled input for the one Note an Album finalizes into. */
export interface AlbumNoteInput {
	chatId: number;
	groupId: string;
	/** Markdown from the one message carrying the caption; `""` if none did. */
	content: string;
	/** The earliest message's publish date, so Note ordering matches the channel. */
	publishDate: Date;
	/** Ordered by Telegram message id (posting order). */
	photos: AlbumPhoto[];
	/** The group's lowest Telegram message id, recorded on the Note for debugging. */
	anchorMessageId: number;
}

/**
 * Outcome of a finalization check: `empty` when the group has no buffered
 * rows (already finalized, or a stale/duplicate trigger — a no-op), `wait`
 * when arrivals are still within the debounce window (a later, fresher check
 * will finalize instead), or `finalize` with the assembled Note input.
 */
export type AlbumFinalizationDecision =
	| { action: "empty" }
	| { action: "wait" }
	| ({ action: "finalize" } & AlbumNoteInput);

/**
 * Decide what a debounce check should do with a group's buffered photos.
 *
 * Idempotent: a duplicate or late-arriving check against a still-fresh group
 * re-decides `wait` (a fresher arrival will trigger its own check); against
 * an already-finalized (now-empty) group it decides `empty`.
 */
export function decideAlbumFinalization(
	chatId: number,
	groupId: string,
	rows: PendingAlbumPhoto[],
	now: Date,
	debounceMs: number = ALBUM_DEBOUNCE_MS,
): AlbumFinalizationDecision {
	if (rows.length === 0) return { action: "empty" };

	const latestArrival = rows.reduce((a, b) => (b.arrivedAt > a.arrivedAt ? b : a)).arrivedAt;
	if (now.getTime() - latestArrival.getTime() < debounceMs) return { action: "wait" };

	const sorted = [...rows].sort((a, b) => a.messageId - b.messageId);
	const earliest = sorted.reduce((a, b) => (b.publishDate < a.publishDate ? b : a));
	const captionRow = sorted.find((row) => row.content !== "");
	const photos: AlbumPhoto[] = sorted.map((row) => ({
		fileId: row.fileId,
		fileUniqueId: row.fileUniqueId,
		mediaType: row.mediaType,
		width: row.width,
		height: row.height,
		messageId: row.messageId,
	}));
	const anchorMessageId = rows.reduce((a, b) => (b.messageId < a.messageId ? b : a)).messageId;

	return {
		action: "finalize",
		chatId,
		groupId,
		content: captionRow?.content ?? "",
		publishDate: earliest.publishDate,
		photos,
		anchorMessageId,
	};
}

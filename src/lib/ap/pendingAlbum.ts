import type { ApEnv } from "@/lib/ap/runtime";

/**
 * D1-backed buffer of not-yet-finalized {@link ./album} groups (issue AP-11,
 * see CONTEXT.md "Pending album"). Each arriving Album photo is written here
 * durably before the webhook responds 200; finalization reads a group's rows,
 * decides wait-vs-finalize (the pure logic in `./album.ts`), and on finalize
 * deletes them. Canonical schema in `scripts/d1/activitypub.sql`.
 */

let ensureSchemaPromise: Promise<void> | null = null;

async function ensurePendingAlbumSchema(env: ApEnv): Promise<void> {
	if (!ensureSchemaPromise) {
		ensureSchemaPromise = (async () => {
			await env.DATABASE.prepare(
				`CREATE TABLE IF NOT EXISTS ap_pending_album_photos (
					id TEXT PRIMARY KEY,
					group_id TEXT NOT NULL,
					chat_id INTEGER NOT NULL,
					message_id INTEGER NOT NULL,
					file_id TEXT NOT NULL,
					file_unique_id TEXT NOT NULL,
					media_type TEXT NOT NULL,
					width INTEGER NOT NULL,
					height INTEGER NOT NULL,
					content TEXT NOT NULL DEFAULT '',
					publish_date TEXT NOT NULL,
					arrived_at TEXT NOT NULL
				)`,
			).run();
			await env.DATABASE.prepare(
				`CREATE UNIQUE INDEX IF NOT EXISTS idx_ap_pending_album_photos_message
				 ON ap_pending_album_photos(chat_id, message_id)`,
			).run();
			await env.DATABASE.prepare(
				`CREATE INDEX IF NOT EXISTS idx_ap_pending_album_photos_group
				 ON ap_pending_album_photos(chat_id, group_id)`,
			).run();
		})();
	}
	return ensureSchemaPromise;
}

interface ApPendingAlbumPhotoRow {
	id: string;
	group_id: string;
	chat_id: number;
	message_id: number;
	file_id: string;
	file_unique_id: string;
	media_type: string;
	width: number;
	height: number;
	content: string;
	publish_date: string;
	arrived_at: string;
}

/** One buffered photo of a not-yet-finalized Album. */
export interface PendingAlbumPhoto {
	id: string;
	groupId: string;
	chatId: number;
	messageId: number;
	fileId: string;
	fileUniqueId: string;
	mediaType: string;
	width: number;
	height: number;
	/** Markdown from this message's caption; `""` if it carried none. */
	content: string;
	publishDate: Date;
	/** Ingest time — the debounce clock. */
	arrivedAt: Date;
}

function mapRow(row: ApPendingAlbumPhotoRow): PendingAlbumPhoto {
	return {
		id: row.id,
		groupId: row.group_id,
		chatId: row.chat_id,
		messageId: row.message_id,
		fileId: row.file_id,
		fileUniqueId: row.file_unique_id,
		mediaType: row.media_type,
		width: row.width,
		height: row.height,
		content: row.content,
		publishDate: new Date(row.publish_date),
		arrivedAt: new Date(row.arrived_at),
	};
}

/** A newly arrived Album photo to buffer. */
export interface InsertPendingAlbumPhotoInput {
	id: string;
	groupId: string;
	chatId: number;
	messageId: number;
	fileId: string;
	fileUniqueId: string;
	mediaType: string;
	width: number;
	height: number;
	content: string;
	publishDate: Date;
	arrivedAt: Date;
}

/**
 * Buffer an Album photo, or refresh it if this `(chat, message)` is already
 * buffered — a redelivery (idempotent no-op update) or a caption edit that
 * arrived before the group finalized (the "same buffer-and-debounce flow" an
 * Album edit takes; see CONTEXT.md "Finalization"). Refreshing `arrivedAt`
 * on an edit extends the debounce window so the corrected caption is what
 * finalizes.
 */
export async function upsertPendingAlbumPhoto(
	env: ApEnv,
	input: InsertPendingAlbumPhotoInput,
): Promise<void> {
	await ensurePendingAlbumSchema(env);
	await env.DATABASE.prepare(
		`INSERT INTO ap_pending_album_photos
		 (id, group_id, chat_id, message_id, file_id, file_unique_id, media_type, width, height, content, publish_date, arrived_at)
		 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
		 ON CONFLICT(chat_id, message_id) DO UPDATE SET
		   file_id = excluded.file_id,
		   file_unique_id = excluded.file_unique_id,
		   media_type = excluded.media_type,
		   width = excluded.width,
		   height = excluded.height,
		   content = excluded.content,
		   arrived_at = excluded.arrived_at`,
	)
		.bind(
			input.id,
			input.groupId,
			input.chatId,
			input.messageId,
			input.fileId,
			input.fileUniqueId,
			input.mediaType,
			input.width,
			input.height,
			input.content,
			input.publishDate.toISOString(),
			input.arrivedAt.toISOString(),
		)
		.run();
}

/** A group's buffered photos, unordered (callers order by `messageId`). */
export async function listPendingAlbumPhotos(
	env: ApEnv,
	chatId: number,
	groupId: string,
): Promise<PendingAlbumPhoto[]> {
	await ensurePendingAlbumSchema(env);
	const result = await env.DATABASE.prepare(
		`SELECT id, group_id, chat_id, message_id, file_id, file_unique_id, media_type, width, height, content, publish_date, arrived_at
		 FROM ap_pending_album_photos WHERE chat_id = ?1 AND group_id = ?2`,
	)
		.bind(chatId, groupId)
		.all<ApPendingAlbumPhotoRow>();
	return (result.results ?? []).map(mapRow);
}

/**
 * Remove specific buffered rows once they've been finalized into a Note.
 * Scoped to the exact row ids a finalize read (rather than the whole group),
 * so a photo that arrives mid-finalize — after the rows were read but before
 * this delete runs — survives to get its own debounce check and finalize
 * separately, instead of being silently swept up (issue AP-11).
 */
export async function deletePendingAlbumPhotosByIds(env: ApEnv, ids: string[]): Promise<void> {
	if (ids.length === 0) return;
	await ensurePendingAlbumSchema(env);
	const placeholders = ids.map((_, i) => `?${i + 1}`).join(", ");
	await env.DATABASE.prepare(`DELETE FROM ap_pending_album_photos WHERE id IN (${placeholders})`)
		.bind(...ids)
		.run();
}

import type { ApEnv } from "@/lib/ap/runtime";
import {
	findNoteIdByTelegramMessage,
	type InsertAttachmentInput,
	insertNote,
	replaceNoteAttachments,
	updateNoteContent,
} from "@/lib/ap/storage";
import type { ChannelUpdateResult, ParsedPhoto } from "@/lib/ap/telegram";
import { ulid } from "@/lib/ap/ulid";

/**
 * Impure side of Telegram ingestion: turn a parsed channel update into D1 Note
 * writes and R2 photo storage. Kept out of {@link ./telegram.ts} (the pure,
 * unit-tested parser) and verified end-to-end instead — it does D1 and R2 I/O
 * and talks to the Telegram Bot API.
 */

/** Prefix under which channel-post media is stored in AP_BUCKET / served from. */
const MEDIA_PATH = "/api/ap/media/";

export type IngestOutcome =
	| { action: "ignored" }
	| { action: "created" | "updated"; noteId: string };

/**
 * Apply a parsed channel update to the Note store: create a new Note for a
 * `channel_post`, or update the corresponding Note for an `edited_channel_post`.
 * A photo on the post is fetched from Telegram, stored to R2, and recorded as a
 * Note attachment.
 */
export async function applyChannelUpdate(
	env: ApEnv,
	result: ChannelUpdateResult,
): Promise<IngestOutcome> {
	if (result.kind === "ignore") return { action: "ignored" };

	// Look up by authoring message first, so the flow is idempotent under
	// Telegram's at-least-once delivery: the webhook returns 500 on failure to
	// force a retry, and a `channel_post` redelivered after its Note was inserted
	// (but before its photo landed) must resolve to an update, not a duplicate
	// INSERT that trips the unique (chat, message) index and wedges the retry.
	// An `edited_channel_post` for a Note we never saw falls through to insert.
	const existingId = await findNoteIdByTelegramMessage(env, result.chatId, result.messageId);
	// Edits bump `updated_at` to now; a fresh post (or a retried one) keeps it at
	// the publish date so re-processing writes identical values.
	const updatedAt =
		result.kind === "update" ? new Date().toISOString() : result.publishDate.toISOString();

	if (existingId) {
		await updateNoteContent(env, existingId, {
			content: result.content,
			summary: null,
			updatedAt,
		});
		await storePhotoAttachment(env, existingId, result.photo);
		return { action: "updated", noteId: existingId };
	}

	const noteId = ulid(result.publishDate.getTime());
	await insertNote(env, {
		id: noteId,
		title: null,
		content: result.content,
		summary: null,
		publishedAt: result.publishDate.toISOString(),
		updatedAt,
		createdAt: new Date().toISOString(),
		source: "telegram",
		telegramChatId: result.chatId,
		telegramMessageId: result.messageId,
	});
	await storePhotoAttachment(env, noteId, result.photo);
	return { action: "created", noteId };
}

async function storePhotoAttachment(
	env: ApEnv,
	noteId: string,
	photo: ParsedPhoto | undefined,
): Promise<void> {
	if (!photo) {
		// An edit that removed the photo should clear the old attachment.
		await replaceNoteAttachments(env, noteId, []);
		return;
	}

	const bytes = await downloadTelegramFile(env.TELEGRAM_BOT_TOKEN, photo.fileId);
	const r2Key = `notes/${noteId}/${photo.fileUniqueId}.jpg`;
	await env.AP_BUCKET.put(r2Key, bytes, {
		httpMetadata: { contentType: photo.mediaType },
	});

	const attachment: InsertAttachmentInput = {
		id: ulid(),
		r2Key,
		url: `${MEDIA_PATH}${r2Key}`,
		mediaType: photo.mediaType,
		name: null,
		width: photo.width,
		height: photo.height,
	};
	await replaceNoteAttachments(env, noteId, [attachment]);
}

/**
 * Download a Telegram file's bytes via the Bot API: resolve its `file_path`
 * with `getFile`, then fetch it from the file endpoint.
 */
async function downloadTelegramFile(token: string, fileId: string): Promise<ArrayBuffer> {
	const meta = await fetch(
		`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
	);
	if (!meta.ok) {
		throw new Error(`Telegram getFile failed: ${meta.status} ${await meta.text()}`);
	}
	const body = (await meta.json()) as { ok: boolean; result?: { file_path?: string } };
	const filePath = body.result?.file_path;
	if (!body.ok || !filePath) {
		throw new Error(`Telegram getFile returned no file_path for ${fileId}`);
	}

	const file = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
	if (!file.ok) {
		throw new Error(`Telegram file download failed: ${file.status}`);
	}
	return file.arrayBuffer();
}

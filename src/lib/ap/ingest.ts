import { z } from "zod";
import { type AlbumNoteInput, decideAlbumFinalization } from "@/lib/ap/album";
import { enqueueAlbumFinalizeCheck, enqueueNoteDelivery } from "@/lib/ap/delivery";
import {
	deletePendingAlbumPhotosByIds,
	listPendingAlbumPhotos,
	upsertPendingAlbumPhoto,
} from "@/lib/ap/pendingAlbum";
import type { ApEnv } from "@/lib/ap/runtime";
import {
	findNoteIdByTelegramMediaGroup,
	findNoteIdByTelegramMessage,
	type InsertAttachmentInput,
	insertNote,
	replaceNoteAttachments,
	updateNoteContent,
	upsertNoteAttachmentByMessage,
} from "@/lib/ap/storage";
import type { ChannelUpdateResult, ParsedPhoto } from "@/lib/ap/telegram";
import type { AlbumFinalizeMessage } from "@/lib/ap/types";
import { ulid } from "@/lib/ap/ulid";

/**
 * Impure side of Telegram ingestion: turn a parsed channel update into D1 Note
 * writes and R2 photo storage. Kept out of {@link ./telegram.ts} (the pure,
 * unit-tested parser) and verified end-to-end instead — it does D1 and R2 I/O
 * and talks to the Telegram Bot API.
 *
 * Album ingestion (issue AP-11) additionally buffers a Telegram Album's
 * messages into a Pending album (`./pendingAlbum.ts`) and finalizes them into
 * one Note via the debounced queue check consumed here as
 * {@link processAlbumFinalizeMessage}, using the pure decision logic in
 * `./album.ts`.
 */

/** Prefix under which channel-post media is stored in AP_BUCKET / served from. */
const MEDIA_PATH = "/api/ap/media/";

export type IngestOutcome =
	| { action: "ignored" }
	| { action: "buffered" }
	| { action: "created" | "updated"; noteId: string };

/**
 * Apply a parsed channel update to the Note store.
 *
 * A post carrying a `media_group_id` (an Album) is routed to the buffer-and-
 * debounce flow ({@link applyAlbumMessage}) rather than published immediately.
 * Everything else keeps the original single-message path: a `channel_post`
 * creates a new Note; an `edited_channel_post` updates the corresponding one.
 * A photo on the post is fetched from Telegram, stored to R2, and recorded as
 * a Note attachment.
 */
export async function applyChannelUpdate(
	env: ApEnv,
	result: ChannelUpdateResult,
): Promise<IngestOutcome> {
	if (result.kind === "ignore") return { action: "ignored" };
	if (result.mediaGroupId) return applyAlbumMessage(env, result.mediaGroupId, result);

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
		await enqueueNoteDelivery(env, { kind: "Update", noteId: existingId });
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
		telegramMediaGroupId: null,
	});
	await storePhotoAttachment(env, noteId, result.photo);
	await enqueueNoteDelivery(env, { kind: "Create", noteId });
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

	const attachment = await downloadAndStorePhoto(env, noteId, photo);
	await replaceNoteAttachments(env, noteId, [attachment]);
}

/** Download a photo from Telegram and store it to R2, without linking it to a Note yet. */
async function downloadAndStorePhoto(
	env: ApEnv,
	noteId: string,
	photo: ParsedPhoto,
): Promise<InsertAttachmentInput> {
	const bytes = await downloadTelegramFile(env.TELEGRAM_BOT_TOKEN, photo.fileId);
	const r2Key = `notes/${noteId}/${photo.fileUniqueId}.jpg`;
	await env.AP_BUCKET.put(r2Key, bytes, {
		httpMetadata: { contentType: photo.mediaType },
	});
	return {
		id: ulid(),
		r2Key,
		url: `${MEDIA_PATH}${r2Key}`,
		mediaType: photo.mediaType,
		name: null,
		width: photo.width,
		height: photo.height,
	};
}

/**
 * Route one Album message: a message for a group whose Note is already
 * finalized is a straggler (or a post-finalize edit) — attached directly with
 * a follow-up Update, no buffering. Otherwise the message is buffered (or, if
 * it re-arrives before finalization, refreshed) and a debounced finalization
 * check is scheduled.
 */
async function applyAlbumMessage(
	env: ApEnv,
	groupId: string,
	message: {
		chatId: number;
		messageId: number;
		content: string;
		publishDate: Date;
		photo?: ParsedPhoto | undefined;
	},
): Promise<IngestOutcome> {
	const existingNoteId = await findNoteIdByTelegramMediaGroup(env, message.chatId, groupId);
	if (existingNoteId) {
		await attachStragglerPhoto(env, existingNoteId, message);
		return { action: "updated", noteId: existingNoteId };
	}

	if (message.photo) {
		await upsertPendingAlbumPhoto(env, {
			id: ulid(),
			groupId,
			chatId: message.chatId,
			messageId: message.messageId,
			fileId: message.photo.fileId,
			fileUniqueId: message.photo.fileUniqueId,
			mediaType: message.photo.mediaType,
			width: message.photo.width,
			height: message.photo.height,
			content: message.content,
			publishDate: message.publishDate,
			arrivedAt: new Date(),
		});
	}
	await enqueueAlbumFinalizeCheck(env, { chatId: message.chatId, groupId });
	return { action: "buffered" };
}

/**
 * Attach a straggler photo, or a post-finalize photo edit, to an already-
 * finalized Album Note, and emit a follow-up `Update` — degraded but lossless
 * (issue AP-11). A never-before-seen message id appends a new attachment; a
 * message id already on the Note (its photo was edited) replaces that
 * attachment in place via {@link upsertNoteAttachmentByMessage}, so editing a
 * photo doesn't leave the old one behind alongside the new.
 */
async function attachStragglerPhoto(
	env: ApEnv,
	noteId: string,
	message: { messageId: number; content: string; photo?: ParsedPhoto | undefined },
): Promise<void> {
	if (message.content) {
		await updateNoteContent(env, noteId, {
			content: message.content,
			summary: null,
			updatedAt: new Date().toISOString(),
		});
	}
	if (message.photo) {
		const attachment = await downloadAndStorePhoto(env, noteId, message.photo);
		await upsertNoteAttachmentByMessage(env, noteId, message.messageId, attachment);
	}
	await enqueueNoteDelivery(env, { kind: "Update", noteId });
}

/**
 * Consume a debounced Album finalization check (issue AP-11): finalize the
 * group into one Note if it is quiet, otherwise no-op (a fresher arrival's own
 * check will finalize instead). See the pure decision logic in `./album.ts`.
 *
 * The pending rows read here are deleted by id, not by group, after
 * finalizing — a photo that arrives mid-finalize (after this read but before
 * the delete) is a distinct row the delete never touches, so it survives to
 * get its own debounce check and finalize (or straggler-attach) separately,
 * rather than being silently swept up.
 */
export async function processAlbumFinalizeMessage(
	env: ApEnv,
	message: AlbumFinalizeMessage,
): Promise<void> {
	const rows = await listPendingAlbumPhotos(env, message.chatId, message.groupId);
	const decision = decideAlbumFinalization(message.chatId, message.groupId, rows, new Date());
	if (decision.action !== "finalize") return;
	await finalizeAlbumGroup(env, decision);
	await deletePendingAlbumPhotosByIds(
		env,
		rows.map((row) => row.id),
	);
}

/**
 * Assemble a finalized Album's Note: reuses an existing Note for the group if
 * one is already there, otherwise inserts a new one. Every photo is upserted
 * through {@link upsertNoteAttachmentByMessage}, keyed by the Telegram message
 * that authored it — safe both for a genuine retry (a redelivered finalize
 * re-attaching photos already on the Note, a no-op) and for a second finalize
 * of the same group (a late batch that raced the first finalize's cleanup),
 * which replaces only the photos whose message was edited and appends any
 * genuinely new one, rather than replacing the full attachment set. Content
 * only replaces when this batch carries a caption, so a captionless late
 * batch doesn't blank an already-set one. Delivers a single Create/Update.
 */
async function finalizeAlbumGroup(env: ApEnv, input: AlbumNoteInput): Promise<IngestOutcome> {
	const existingId = await findNoteIdByTelegramMediaGroup(env, input.chatId, input.groupId);
	const isNew = !existingId;
	const noteId = existingId ?? ulid(input.publishDate.getTime());

	if (isNew) {
		await insertNote(env, {
			id: noteId,
			title: null,
			content: input.content,
			summary: null,
			publishedAt: input.publishDate.toISOString(),
			updatedAt: input.publishDate.toISOString(),
			createdAt: new Date().toISOString(),
			source: "telegram",
			telegramChatId: input.chatId,
			telegramMessageId: input.anchorMessageId,
			telegramMediaGroupId: input.groupId,
		});
	} else if (input.content) {
		await updateNoteContent(env, noteId, {
			content: input.content,
			summary: null,
			updatedAt: new Date().toISOString(),
		});
	}

	const attachments = await Promise.all(
		input.photos.map(async (photo) => ({
			messageId: photo.messageId,
			attachment: await downloadAndStorePhoto(env, noteId, photo),
		})),
	);
	for (const { messageId, attachment } of attachments) {
		await upsertNoteAttachmentByMessage(env, noteId, messageId, attachment);
	}

	await enqueueNoteDelivery(env, { kind: isNew ? "Create" : "Update", noteId });
	return { action: isNew ? "created" : "updated", noteId };
}

/** The subset of Telegram's `getFile` response this pipeline reads. */
const getFileResponseSchema = z.object({
	ok: z.boolean(),
	result: z.object({ file_path: z.string().optional() }).optional(),
});

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
	const body = getFileResponseSchema.safeParse(await meta.json().catch(() => null));
	const filePath = body.success ? body.data.result?.file_path : undefined;
	if (!body.success || !body.data.ok || !filePath) {
		throw new Error(`Telegram getFile returned no file_path for ${fileId}`);
	}

	const file = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
	if (!file.ok) {
		throw new Error(`Telegram file download failed: ${file.status}`);
	}
	return file.arrayBuffer();
}

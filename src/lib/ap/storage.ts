import type { ApEnv } from "@/lib/ap/runtime";
import type {
	ApNoteAttachmentRow,
	ApNoteRow,
	Note,
	NoteAttachment,
	NoteSource,
} from "@/lib/ap/types";

const NOTE_COLUMNS = "id, title, content, summary, published_at, updated_at, created_at, source";
const ATTACHMENT_COLUMNS =
	"id, note_id, r2_key, url, media_type, name, width, height, position, telegram_message_id";

function mapNoteRow(row: ApNoteRow): Note {
	return {
		id: row.id,
		title: row.title,
		content: row.content,
		summary: row.summary,
		publishDate: new Date(row.published_at),
		updatedDate: new Date(row.updated_at),
		source: row.source,
	};
}

/** Insert a Note, or replace it if the id already exists (idempotent migration). */
/** Fetch a single Note by its ULID, or null if none exists. */
export async function getNoteById(env: ApEnv, id: string): Promise<Note | null> {
	const row = await env.DATABASE.prepare(`SELECT ${NOTE_COLUMNS} FROM ap_notes WHERE id = ?1`)
		.bind(id)
		.first<ApNoteRow>();
	return row ? mapNoteRow(row) : null;
}

/** List Notes newest-first (by published date). */
export async function listNotes(env: ApEnv): Promise<Note[]> {
	const result = await env.DATABASE.prepare(
		`SELECT ${NOTE_COLUMNS} FROM ap_notes ORDER BY published_at DESC, id DESC`,
	).all<ApNoteRow>();
	return (result.results ?? []).map(mapNoteRow);
}

/** Total number of Notes, for pagination metadata. */
export async function countNotes(env: ApEnv): Promise<number> {
	const row = await env.DATABASE.prepare("SELECT COUNT(*) AS total FROM ap_notes").first<{
		total: number;
	}>();
	return row?.total ?? 0;
}

/**
 * One page of Notes, newest-first. Mirrors the static `paginate()` shape the
 * listing page used before the D1 switch: a `Page`-like record (without the
 * `Page` type dependency) so on-demand rendering can compute prev/next URLs.
 */
export async function listNotesPage(
	env: ApEnv,
	opts: { limit: number; offset: number },
): Promise<Note[]> {
	const result = await env.DATABASE.prepare(
		`SELECT ${NOTE_COLUMNS} FROM ap_notes
		 ORDER BY published_at DESC, id DESC
		 LIMIT ?1 OFFSET ?2`,
	)
		.bind(opts.limit, opts.offset)
		.all<ApNoteRow>();
	return (result.results ?? []).map(mapNoteRow);
}

/** A new Note authored from a channel post. */
export interface InsertNoteInput {
	id: string;
	title: string | null;
	content: string;
	summary: string | null;
	/** ISO 8601 timestamps. */
	publishedAt: string;
	updatedAt: string;
	createdAt: string;
	source: NoteSource;
	telegramChatId: number | null;
	telegramMessageId: number | null;
	/** The Album's `media_group_id`, for a Note finalized from an Album (issue AP-11). */
	telegramMediaGroupId: string | null;
}

/** Insert a brand-new Note (fails on id conflict — callers pick a fresh ULID). */
export async function insertNote(env: ApEnv, input: InsertNoteInput): Promise<void> {
	await env.DATABASE.prepare(
		`INSERT INTO ap_notes
		 (id, title, content, summary, published_at, updated_at, created_at, source, telegram_chat_id, telegram_message_id, telegram_media_group_id)
		 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
	)
		.bind(
			input.id,
			input.title,
			input.content,
			input.summary,
			input.publishedAt,
			input.updatedAt,
			input.createdAt,
			input.source,
			input.telegramChatId,
			input.telegramMessageId,
			input.telegramMediaGroupId,
		)
		.run();
}

/** Update a Note's content/summary and its `updated_at` (channel-post edits). */
export async function updateNoteContent(
	env: ApEnv,
	id: string,
	fields: { content: string; summary: string | null; updatedAt: string },
): Promise<void> {
	await env.DATABASE.prepare(
		"UPDATE ap_notes SET content = ?2, summary = ?3, updated_at = ?4 WHERE id = ?1",
	)
		.bind(id, fields.content, fields.summary, fields.updatedAt)
		.run();
}

/** Find the Note id a Telegram (chat, message) pair authored, or null. */
export async function findNoteIdByTelegramMessage(
	env: ApEnv,
	chatId: number,
	messageId: number,
): Promise<string | null> {
	const row = await env.DATABASE.prepare(
		"SELECT id FROM ap_notes WHERE telegram_chat_id = ?1 AND telegram_message_id = ?2",
	)
		.bind(chatId, messageId)
		.first<{ id: string }>();
	return row?.id ?? null;
}

/**
 * Find the Note id an Album (chat, media_group_id) pair finalized into, or
 * null. The linkage a straggler photo or a consolidated Album edit resolves
 * against (issue AP-11), mirroring {@link findNoteIdByTelegramMessage} for
 * single-message Notes.
 */
export async function findNoteIdByTelegramMediaGroup(
	env: ApEnv,
	chatId: number,
	groupId: string,
): Promise<string | null> {
	const row = await env.DATABASE.prepare(
		"SELECT id FROM ap_notes WHERE telegram_chat_id = ?1 AND telegram_media_group_id = ?2",
	)
		.bind(chatId, groupId)
		.first<{ id: string }>();
	return row?.id ?? null;
}

/**
 * Delete a Note and its attachment rows (issue AP-8). Returns whether a Note was
 * removed. Federation of the `Delete(Tombstone)` and cleanup of interactions are
 * the caller's responsibility (the dashboard action). Attachments are
 * deleted explicitly rather than relying on the FK cascade, which D1 leaves off.
 */
export async function deleteNote(env: ApEnv, id: string): Promise<boolean> {
	const [, result] = await env.DATABASE.batch([
		env.DATABASE.prepare("DELETE FROM ap_note_attachments WHERE note_id = ?1").bind(id),
		env.DATABASE.prepare("DELETE FROM ap_notes WHERE id = ?1").bind(id),
	]);
	return (result?.meta?.changes ?? 0) > 0;
}

/** An attachment to persist for a Note. */
export interface InsertAttachmentInput {
	id: string;
	r2Key: string;
	url: string;
	mediaType: string;
	name: string | null;
	width: number | null;
	height: number | null;
}

/**
 * Replace all attachments of a Note with the given set (delete-then-insert),
 * so re-processing an edited post is idempotent. Ordered by array position.
 */
export async function replaceNoteAttachments(
	env: ApEnv,
	noteId: string,
	attachments: InsertAttachmentInput[],
): Promise<void> {
	const statements = [
		env.DATABASE.prepare("DELETE FROM ap_note_attachments WHERE note_id = ?1").bind(noteId),
		...attachments.map((a, position) =>
			env.DATABASE.prepare(
				`INSERT INTO ap_note_attachments (${ATTACHMENT_COLUMNS})
				 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL)`,
			).bind(a.id, noteId, a.r2Key, a.url, a.mediaType, a.name, a.width, a.height, position),
		),
	];
	await env.DATABASE.batch(statements);
}

/**
 * Upsert one Album photo attachment, keyed by the Telegram message that
 * authored it (issue AP-11). A never-before-seen message id appends a new
 * attachment (a straggler); a message id already on the Note replaces that
 * attachment's photo in place (editing a photo within an already-finalized
 * Album) rather than appending a duplicate. Idempotent under the unique
 * `(note_id, telegram_message_id)` index — a retried finalize re-upserting
 * the same photo is a no-op change.
 */
export async function upsertNoteAttachmentByMessage(
	env: ApEnv,
	noteId: string,
	telegramMessageId: number,
	attachment: InsertAttachmentInput,
): Promise<void> {
	await env.DATABASE.prepare(
		`INSERT INTO ap_note_attachments (${ATTACHMENT_COLUMNS})
		 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
		   (SELECT COALESCE(MAX(position) + 1, 0) FROM ap_note_attachments WHERE note_id = ?2), ?9)
		 ON CONFLICT(note_id, telegram_message_id) DO UPDATE SET
		   r2_key = excluded.r2_key,
		   url = excluded.url,
		   media_type = excluded.media_type,
		   name = excluded.name,
		   width = excluded.width,
		   height = excluded.height`,
	)
		.bind(
			attachment.id,
			noteId,
			attachment.r2Key,
			attachment.url,
			attachment.mediaType,
			attachment.name,
			attachment.width,
			attachment.height,
			telegramMessageId,
		)
		.run();
}

/** List a Note's attachments in display order. */
export async function listNoteAttachments(env: ApEnv, noteId: string): Promise<NoteAttachment[]> {
	const result = await env.DATABASE.prepare(
		`SELECT ${ATTACHMENT_COLUMNS} FROM ap_note_attachments WHERE note_id = ?1 ORDER BY position ASC`,
	)
		.bind(noteId)
		.all<ApNoteAttachmentRow>();
	return (result.results ?? []).map((row) => ({
		id: row.id,
		url: row.url,
		mediaType: row.media_type,
		name: row.name,
		width: row.width,
		height: row.height,
	}));
}

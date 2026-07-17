import { z } from "zod";

/**
 * Pure parsing of Telegram channel updates into Note inputs.
 *
 * This is the primary unit-tested seam of the Telegram ingestion path (see
 * issue AP-3 and the spec's Testing Decisions): given a webhook `Update` and
 * the allowlist config it decides whether the update authors or edits a Note,
 * and derives that Note's markdown content from the post's text/caption and
 * entities. It performs no I/O — downloading photos, storing to R2 and writing
 * D1 all live in {@link ./ingest.ts}, which is verified end-to-end rather than
 * unit-tested.
 */

/** A Telegram [MessageEntity](https://core.telegram.org/bots/api#messageentity). */
export interface TelegramMessageEntity {
	type: string;
	offset: number;
	length: number;
	/** Present on `text_link` entities. */
	url?: string | undefined;
	/** Present on `pre` entities. */
	language?: string | undefined;
}

/** A Telegram [PhotoSize](https://core.telegram.org/bots/api#photosize). */
export interface TelegramPhotoSize {
	file_id: string;
	file_unique_id: string;
	width: number;
	height: number;
	file_size?: number | undefined;
}

/** The subset of a Telegram [Message](https://core.telegram.org/bots/api#message) we read. */
export interface TelegramMessage {
	message_id: number;
	/** Unix time (seconds) the message was sent. */
	date: number;
	/** Unix time (seconds) the message was last edited. */
	edit_date?: number | undefined;
	chat: { id: number; type: string; title?: string | undefined };
	text?: string | undefined;
	entities?: TelegramMessageEntity[] | undefined;
	caption?: string | undefined;
	caption_entities?: TelegramMessageEntity[] | undefined;
	/** Available photo sizes, smallest to largest. */
	photo?: TelegramPhotoSize[] | undefined;
	/** Shared by every message of an Album (a multi-photo post); absent otherwise. */
	media_group_id?: string | undefined;
}

/** A Telegram [Update](https://core.telegram.org/bots/api#update); only channel fields matter here. */
export interface TelegramUpdate {
	update_id: number;
	channel_post?: TelegramMessage | undefined;
	edited_channel_post?: TelegramMessage | undefined;
	[key: string]: unknown;
}

const telegramMessageEntitySchema = z.looseObject({
	type: z.string(),
	offset: z.number().int(),
	length: z.number().int(),
	url: z.string().optional(),
	language: z.string().optional(),
});

const telegramPhotoSizeSchema = z.looseObject({
	file_id: z.string(),
	file_unique_id: z.string(),
	width: z.number(),
	height: z.number(),
	file_size: z.number().optional(),
});

const telegramMessageSchema = z.looseObject({
	message_id: z.number().int(),
	date: z.number(),
	edit_date: z.number().optional(),
	chat: z.looseObject({ id: z.number(), type: z.string(), title: z.string().optional() }),
	text: z.string().optional(),
	entities: z.array(telegramMessageEntitySchema).optional(),
	caption: z.string().optional(),
	caption_entities: z.array(telegramMessageEntitySchema).optional(),
	photo: z.array(telegramPhotoSizeSchema).optional(),
	media_group_id: z.string().optional(),
});

export const telegramUpdateSchema: z.ZodType<TelegramUpdate> = z.looseObject({
	update_id: z.number().int(),
	channel_post: telegramMessageSchema.optional(),
	edited_channel_post: telegramMessageSchema.optional(),
});

/** Config gating which channel may author Notes. */
export interface ChannelUpdateConfig {
	/** The single allowlisted channel/chat id; every other source is ignored. */
	allowedChatId: number;
}

/** A photo attachment referenced by a channel post, resolved to R2 later. */
export interface ParsedPhoto {
	fileId: string;
	fileUniqueId: string;
	mediaType: string;
	width: number;
	height: number;
}

/** A Note authored or edited from a channel post. */
export interface ParsedNoteInput {
	chatId: number;
	messageId: number;
	/** Markdown derived from the post text/caption and its entities. */
	content: string;
	/** The post's publish date (from `message.date`). */
	publishDate: Date;
	/** The largest attached photo, if any. */
	photo?: ParsedPhoto;
	/**
	 * The Telegram `media_group_id` shared by every message of an Album this
	 * post belongs to. Absent for a single-photo or text-only post, which keeps
	 * the immediate create/update path unchanged.
	 */
	mediaGroupId?: string;
}

/** Outcome of parsing an update: author a Note, edit one, or ignore the update. */
export type ChannelUpdateResult =
	| { kind: "ignore" }
	| ({ kind: "create" } & ParsedNoteInput)
	| ({ kind: "update" } & ParsedNoteInput);

const IGNORE: ChannelUpdateResult = { kind: "ignore" };

/**
 * Decide what a Telegram webhook update means for the Note store.
 *
 * `channel_post` from the allowlisted channel authors a Note (`create`),
 * `edited_channel_post` edits the corresponding Note (`update`). Everything
 * else — other update types, other chats, or a post with neither text nor a
 * photo — is ignored.
 */
export function parseChannelUpdate(
	update: TelegramUpdate,
	config: ChannelUpdateConfig,
): ChannelUpdateResult {
	const kind: "create" | "update" = update.channel_post ? "create" : "update";
	const message = update.channel_post ?? update.edited_channel_post;
	if (!message) return IGNORE;

	if (message.chat?.id !== config.allowedChatId) return IGNORE;

	const photo = pickLargestPhoto(message.photo);
	const rawText = message.text ?? message.caption;
	const entities = message.text ? message.entities : message.caption_entities;

	// A post with neither text nor a photo carries no Note content.
	if (rawText === undefined && !photo) return IGNORE;

	const content = rawText ? entitiesToMarkdown(rawText, entities ?? []) : "";

	const input: ParsedNoteInput = {
		chatId: message.chat.id,
		messageId: message.message_id,
		content,
		publishDate: new Date(message.date * 1000),
	};
	if (photo) input.photo = photo;
	if (message.media_group_id) input.mediaGroupId = message.media_group_id;

	return { kind, ...input };
}

function pickLargestPhoto(photo: TelegramPhotoSize[] | undefined): ParsedPhoto | undefined {
	if (!photo || photo.length === 0) return undefined;
	const largest = photo.reduce((a, b) => (b.width * b.height >= a.width * a.height ? b : a));
	return {
		fileId: largest.file_id,
		fileUniqueId: largest.file_unique_id,
		mediaType: "image/jpeg", // Telegram serves channel photos as JPEG.
		width: largest.width,
		height: largest.height,
	};
}

/**
 * Convert a Telegram text plus its entities into markdown.
 *
 * Telegram entity offsets and lengths are UTF-16 code units, which map directly
 * to JavaScript string indices. Supported entities are wrapped with markdown
 * markers at their boundaries; unsupported entities (mentions, hashtags, plain
 * urls, …) pass through as their literal text. Nesting is handled by emitting
 * closing markers inner-first at each boundary.
 */
export function entitiesToMarkdown(text: string, entities: TelegramMessageEntity[]): string {
	if (entities.length === 0) return text;

	// Outer-first ordering so a container's opening marker precedes an entity it
	// encloses, and its closing marker follows.
	const sorted = [...entities].sort((a, b) => a.offset - b.offset || b.length - a.length);

	const opens = new Map<number, string[]>();
	const closes = new Map<number, string[]>();

	for (const entity of sorted) {
		const markers = markersFor(entity);
		if (!markers) continue;
		const end = entity.offset + entity.length;
		(opens.get(entity.offset) ?? setDefault(opens, entity.offset)).push(markers.open);
		// unshift keeps inner entities (encountered later) closing before outer ones.
		(closes.get(end) ?? setDefault(closes, end)).unshift(markers.close);
	}

	let result = "";
	for (let i = 0; i <= text.length; i++) {
		const closing = closes.get(i);
		if (closing) result += closing.join("");
		const opening = opens.get(i);
		if (opening) result += opening.join("");
		if (i < text.length) result += text[i];
	}
	return result;
}

function setDefault(map: Map<number, string[]>, key: number): string[] {
	const arr: string[] = [];
	map.set(key, arr);
	return arr;
}

/** Markdown open/close markers for a supported entity, or null to pass through. */
function markersFor(entity: TelegramMessageEntity): { open: string; close: string } | null {
	switch (entity.type) {
		case "bold":
			return { open: "**", close: "**" };
		case "italic":
			return { open: "*", close: "*" };
		case "strikethrough":
			return { open: "~~", close: "~~" };
		case "code":
			return { open: "`", close: "`" };
		case "pre":
			return { open: `\`\`\`${entity.language ?? ""}\n`, close: "\n```" };
		case "text_link":
			return entity.url ? { open: "[", close: `](${entity.url})` } : null;
		default:
			return null;
	}
}

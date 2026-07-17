import { describe, expect, it } from "vitest";
import { entitiesToMarkdown, parseChannelUpdate, type TelegramUpdate } from "@/lib/ap/telegram";

const ALLOWED_CHAT_ID = -1001234567890;
const CONFIG = { allowedChatId: ALLOWED_CHAT_ID };

function channelPost(overrides: Record<string, unknown> = {}) {
	return {
		message_id: 42,
		date: 1_710_000_000, // 2024-03-09T16:00:00Z
		chat: { id: ALLOWED_CHAT_ID, type: "channel", title: "fdke.vin notes" },
		text: "Hello from the channel",
		...overrides,
	};
}

describe("parseChannelUpdate", () => {
	it("maps a channel_post to a create input", () => {
		const update: TelegramUpdate = { update_id: 1, channel_post: channelPost() };
		const result = parseChannelUpdate(update, CONFIG);
		expect(result.kind).toBe("create");
		if (result.kind !== "create") throw new Error("expected create");
		expect(result.chatId).toBe(ALLOWED_CHAT_ID);
		expect(result.messageId).toBe(42);
		expect(result.content).toBe("Hello from the channel");
		expect(result.publishDate.toISOString()).toBe("2024-03-09T16:00:00.000Z");
		expect(result.photo).toBeUndefined();
	});

	it("maps an edited_channel_post to an update input", () => {
		const update: TelegramUpdate = {
			update_id: 2,
			edited_channel_post: channelPost({ text: "Edited text", edit_date: 1_710_000_500 }),
		};
		const result = parseChannelUpdate(update, CONFIG);
		expect(result.kind).toBe("update");
		if (result.kind !== "update") throw new Error("expected update");
		expect(result.messageId).toBe(42);
		expect(result.content).toBe("Edited text");
	});

	it("ignores updates from a non-allowlisted chat", () => {
		const update: TelegramUpdate = {
			update_id: 3,
			channel_post: channelPost({ chat: { id: -1009999999999, type: "channel" } }),
		};
		expect(parseChannelUpdate(update, CONFIG).kind).toBe("ignore");
	});

	it("ignores unrelated update types (e.g. a private message)", () => {
		const update = {
			update_id: 4,
			message: channelPost({ chat: { id: ALLOWED_CHAT_ID, type: "private" } }),
		} as unknown as TelegramUpdate;
		expect(parseChannelUpdate(update, CONFIG).kind).toBe("ignore");
	});

	it("ignores a post with neither text nor a photo", () => {
		const update: TelegramUpdate = {
			update_id: 5,
			channel_post: channelPost({ text: undefined }),
		};
		expect(parseChannelUpdate(update, CONFIG).kind).toBe("ignore");
	});

	it("extracts the largest photo size and its caption", () => {
		const update: TelegramUpdate = {
			update_id: 6,
			channel_post: channelPost({
				text: undefined,
				caption: "A sunset",
				photo: [
					{ file_id: "small", file_unique_id: "u1", width: 90, height: 60, file_size: 1000 },
					{ file_id: "large", file_unique_id: "u2", width: 1280, height: 853, file_size: 200000 },
				],
			}),
		};
		const result = parseChannelUpdate(update, CONFIG);
		if (result.kind !== "create") throw new Error("expected create");
		expect(result.content).toBe("A sunset");
		expect(result.photo).toEqual({
			fileId: "large",
			fileUniqueId: "u2",
			mediaType: "image/jpeg",
			width: 1280,
			height: 853,
		});
	});

	it("accepts a photo-only post with empty content", () => {
		const update: TelegramUpdate = {
			update_id: 7,
			channel_post: channelPost({
				text: undefined,
				photo: [{ file_id: "f", file_unique_id: "u", width: 100, height: 100 }],
			}),
		};
		const result = parseChannelUpdate(update, CONFIG);
		if (result.kind !== "create") throw new Error("expected create");
		expect(result.content).toBe("");
		expect(result.photo?.fileId).toBe("f");
	});

	it("surfaces media_group_id on an album message", () => {
		const update: TelegramUpdate = {
			update_id: 9,
			channel_post: channelPost({
				text: undefined,
				caption: "A gallery",
				media_group_id: "12345",
				photo: [{ file_id: "f", file_unique_id: "u", width: 100, height: 100 }],
			}),
		};
		const result = parseChannelUpdate(update, CONFIG);
		if (result.kind !== "create") throw new Error("expected create");
		expect(result.mediaGroupId).toBe("12345");
	});

	it("leaves mediaGroupId undefined for a non-album post", () => {
		const update: TelegramUpdate = { update_id: 10, channel_post: channelPost() };
		const result = parseChannelUpdate(update, CONFIG);
		if (result.kind !== "create") throw new Error("expected create");
		expect(result.mediaGroupId).toBeUndefined();
	});

	it("converts entity formatting in the text to markdown content", () => {
		const update: TelegramUpdate = {
			update_id: 8,
			channel_post: channelPost({
				text: "bold and a link",
				entities: [
					{ type: "bold", offset: 0, length: 4 },
					{ type: "text_link", offset: 11, length: 4, url: "https://fdke.vin" },
				],
			}),
		};
		const result = parseChannelUpdate(update, CONFIG);
		if (result.kind !== "create") throw new Error("expected create");
		expect(result.content).toBe("**bold** and a [link](https://fdke.vin)");
	});
});

describe("entitiesToMarkdown", () => {
	it("returns plain text when there are no entities", () => {
		expect(entitiesToMarkdown("just text", [])).toBe("just text");
	});

	it("wraps bold, italic, strikethrough and inline code", () => {
		const text = "b i s c";
		const md = entitiesToMarkdown(text, [
			{ type: "bold", offset: 0, length: 1 },
			{ type: "italic", offset: 2, length: 1 },
			{ type: "strikethrough", offset: 4, length: 1 },
			{ type: "code", offset: 6, length: 1 },
		]);
		expect(md).toBe("**b** *i* ~~s~~ `c`");
	});

	it("renders text_link as a markdown link", () => {
		expect(
			entitiesToMarkdown("see docs", [
				{ type: "text_link", offset: 4, length: 4, url: "https://example.com" },
			]),
		).toBe("see [docs](https://example.com)");
	});

	it("renders a pre block as a fenced code block", () => {
		expect(
			entitiesToMarkdown("code", [{ type: "pre", offset: 0, length: 4, language: "ts" }]),
		).toBe("```ts\ncode\n```");
	});

	it("nests entities correctly (bold containing italic)", () => {
		const md = entitiesToMarkdown("abcd", [
			{ type: "bold", offset: 0, length: 4 },
			{ type: "italic", offset: 1, length: 2 },
		]);
		expect(md).toBe("**a*bc*d**");
	});

	it("passes through unsupported entity types as plain text", () => {
		expect(entitiesToMarkdown("@someone", [{ type: "mention", offset: 0, length: 8 }])).toBe(
			"@someone",
		);
	});
});

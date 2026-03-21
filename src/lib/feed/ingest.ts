import { getErrorMessage } from "@/lib/api/http";
import type { FeedEnv } from "@/lib/feed/runtime";
import { createR2Key, getDayUtc } from "@/lib/feed/runtime";
import {
	queueAiMessages,
	recordFeedFetchFailure,
	recordFeedFetchSuccess,
	upsertFeedEntry,
} from "@/lib/feed/storage";
import type { FeedAiMessage, FeedFetchMessage, ParsedFeedEntry } from "@/lib/feed/types";

const USER_AGENT = "fdke.vin feed bot/1.0 (+https://fdke.vin)";

export async function processFeedFetchMessage(
	env: FeedEnv,
	message: FeedFetchMessage,
): Promise<void> {
	const startedAt = Date.now();
	let ok = false;
	let errorMessage: string | null = null;

	try {
		const response = await fetch(message.feedUrl, {
			headers: {
				"user-agent": USER_AGENT,
				accept:
					"application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
			},
		});

		if (!response.ok) {
			throw new Error(`Feed request failed with ${response.status}`);
		}

		const xml = await response.text();
		const rawFeedKey = createR2Key(`rss/raw/${message.feedId}`, "latest.xml");
		await env.RSS_BUCKET.put(rawFeedKey, xml, {
			httpMetadata: { contentType: response.headers.get("content-type") || "application/xml" },
		});

		const entries = parseFeedEntries(xml).slice(0, 30);
		const aiMessages: FeedAiMessage[] = [];

		for (const entry of entries) {
			const content = await resolveEntryContent(entry, message.fetchMarkdown);
			const contentKey = content
				? createR2Key(
						`rss/items/${getDayUtc()}`,
						`${await digestForKey(message.feedId, entry.id)}.md`,
					)
				: null;

			if (contentKey && content) {
				await env.RSS_BUCKET.put(contentKey, content, {
					httpMetadata: { contentType: "text/markdown; charset=utf-8" },
				});
			}

			const saved = await upsertFeedEntry(env, {
				feedId: message.feedId,
				rawFeedKey,
				contentKey,
				entry: {
					...entry,
					content: content || entry.content,
				},
			});

			if (saved.contentKey && (content || entry.content).trim().length > 160) {
				aiMessages.push({
					itemId: saved.itemId,
					contentKey: saved.contentKey,
					title: entry.title,
					url: entry.url,
				});
			}
		}

		await queueAiMessages(env, aiMessages);
		await recordFeedFetchSuccess(env, message.feedId);
		ok = true;
	} catch (error) {
		errorMessage = getErrorMessage(error, "Feed fetch failed");
		await recordFeedFetchFailure(env, message.feedId, errorMessage);
		throw error;
	} finally {
		await notifyCoordinator(env, {
			runId: message.runId,
			feedId: message.feedId,
			ok,
			error: errorMessage,
			durationMs: Date.now() - startedAt,
		});
	}
}

async function notifyCoordinator(
	env: FeedEnv,
	payload: { runId: string; feedId: string; ok: boolean; error: string | null; durationMs: number },
): Promise<void> {
	const stub = env.FEED_COORDINATOR.get(env.FEED_COORDINATOR.idFromName("global-feed-pool"));
	await stub.fetch("https://feed-coordinator.internal/runs/complete", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
}

function parseFeedEntries(xml: string): ParsedFeedEntry[] {
	const document = new DOMParser().parseFromString(xml, "application/xml");
	if (document.querySelector("parsererror")) {
		throw new Error("Unable to parse RSS or Atom XML");
	}

	const rootName = document.documentElement.localName.toLowerCase();
	if (rootName === "feed") {
		return Array.from(document.getElementsByTagNameNS("*", "entry")).map(parseAtomEntry);
	}

	const items = Array.from(document.getElementsByTagNameNS("*", "item"));
	if (items.length > 0) {
		return items.map(parseRssItem);
	}

	throw new Error("Feed does not contain supported item nodes");
}

function parseRssItem(item: Element): ParsedFeedEntry {
	const title = findText(item, ["title"]) || "Untitled item";
	const link = findText(item, ["link"]) || findAttribute(item, "link", "href") || "";
	const guid = findText(item, ["guid"]) || link || title;
	const published = normalizeDate(findText(item, ["pubDate", "published", "updated", "date"]));
	const author = findText(item, ["creator", "author"]);
	const rawContent =
		findText(item, ["encoded", "content", "description", "summary"]) ||
		findCdata(item, ["encoded", "content", "description", "summary"]) ||
		"";

	return {
		id: guid,
		title,
		url: link,
		publishedAt: published,
		author,
		content: normalizeMarkdown(stripMarkup(rawContent)),
		excerpt: truncate(stripMarkup(rawContent), 280),
	};
}

function parseAtomEntry(entry: Element): ParsedFeedEntry {
	const title = findText(entry, ["title"]) || "Untitled item";
	const link =
		findLinkHref(entry, "alternate") || findLinkHref(entry, null) || findText(entry, ["id"]) || "";
	const guid = findText(entry, ["id"]) || link || title;
	const published = normalizeDate(findText(entry, ["published", "updated"]));
	const author = findNestedText(entry, "author", ["name"]) || findText(entry, ["author"]);
	const rawContent =
		findText(entry, ["content", "summary"]) || findCdata(entry, ["content", "summary"]) || "";

	return {
		id: guid,
		title,
		url: link,
		publishedAt: published,
		author,
		content: normalizeMarkdown(stripMarkup(rawContent)),
		excerpt: truncate(stripMarkup(rawContent), 280),
	};
}

async function resolveEntryContent(
	entry: ParsedFeedEntry,
	fetchMarkdown: boolean,
): Promise<string | null> {
	if (fetchMarkdown && entry.url) {
		const fetched = await fetchRemoteMarkdown(entry.url);
		if (fetched) {
			return fetched;
		}
	}

	return entry.content || null;
}

async function fetchRemoteMarkdown(url: string): Promise<string | null> {
	try {
		const response = await fetch(url, {
			headers: {
				"user-agent": USER_AGENT,
				accept: "text/markdown, text/plain, text/html, application/xhtml+xml;q=0.9, */*;q=0.8",
			},
		});
		if (!response.ok) {
			return null;
		}

		const contentType = response.headers.get("content-type") || "";
		const body = await response.text();
		if (!body.trim()) {
			return null;
		}

		if (
			contentType.includes("markdown") ||
			contentType.includes("text/plain") ||
			/\.(md|markdown|mdx)(\?|$)/i.test(url)
		) {
			return normalizeMarkdown(body);
		}

		if (contentType.includes("html") || body.includes("<html") || body.includes("<article")) {
			return normalizeMarkdown(stripMarkup(body));
		}

		return normalizeMarkdown(body);
	} catch {
		return null;
	}
}

function stripMarkup(input: string): string {
	if (!input.trim()) {
		return "";
	}

	if (!input.includes("<")) {
		return decodeEntities(input);
	}

	const document = new DOMParser().parseFromString(input, "text/html");
	const blocks = Array.from(
		document.body.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, blockquote, pre"),
	);
	if (blocks.length > 0) {
		return decodeEntities(
			blocks
				.map((node) => node.textContent?.trim() || "")
				.filter(Boolean)
				.join("\n\n"),
		);
	}

	return decodeEntities(document.body.textContent || "");
}

function decodeEntities(value: string): string {
	return value
		.replaceAll("&nbsp;", " ")
		.replaceAll("&amp;", "&")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&#39;", "'");
}

function normalizeMarkdown(value: string): string {
	return value
		.replace(/\r/g, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function findText(parent: Element, localNames: string[]): string | null {
	for (const localName of localNames) {
		const nodes = Array.from(parent.getElementsByTagNameNS("*", localName));
		const value = nodes[0]?.textContent?.trim();
		if (value) {
			return value;
		}
	}

	return null;
}

function findNestedText(
	parent: Element,
	containerName: string,
	childNames: string[],
): string | null {
	const container = Array.from(parent.getElementsByTagNameNS("*", containerName))[0];
	if (!container) {
		return null;
	}
	return findText(container, childNames);
}

function findCdata(parent: Element, localNames: string[]): string | null {
	for (const localName of localNames) {
		const node = Array.from(parent.getElementsByTagNameNS("*", localName))[0];
		const value = node?.textContent?.trim();
		if (value) {
			return value;
		}
	}
	return null;
}

function findAttribute(parent: Element, localName: string, attribute: string): string | null {
	const node = Array.from(parent.getElementsByTagNameNS("*", localName))[0];
	const value = node?.getAttribute(attribute)?.trim();
	return value || null;
}

function findLinkHref(parent: Element, rel: string | null): string | null {
	const links = Array.from(parent.getElementsByTagNameNS("*", "link"));
	const match = links.find((link) => {
		if (rel === null) {
			return Boolean(link.getAttribute("href"));
		}
		return link.getAttribute("rel") === rel && Boolean(link.getAttribute("href"));
	});
	return match?.getAttribute("href")?.trim() || null;
}

function normalizeDate(value: string | null): string | null {
	if (!value) {
		return null;
	}
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function truncate(value: string, length: number): string | null {
	const normalized = value.trim();
	if (!normalized) {
		return null;
	}
	return normalized.length > length ? `${normalized.slice(0, length - 1)}…` : normalized;
}

async function digestForKey(feedId: string, entryId: string): Promise<string> {
	const input = `${feedId}:${entryId}`;
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

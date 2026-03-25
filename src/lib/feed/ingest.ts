import { getErrorMessage } from "@/lib/api/http";
import { extractFeedDocument, FEED_USER_AGENT } from "@/lib/feed/extractor";
import type { FeedEnv } from "@/lib/feed/runtime";
import {
	queueAiMessages,
	recordFeedFetchFailure,
	recordFeedFetchSuccess,
	upsertFeedEntry,
} from "@/lib/feed/storage";
import type { FeedAiMessage, FeedFetchMessage, ParsedFeedEntry } from "@/lib/feed/types";

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
				"user-agent": FEED_USER_AGENT,
				accept:
					"application/rss+xml, application/atom+xml, application/feed+json, application/json, application/xml, text/xml;q=0.9, */*;q=0.8",
			},
		});

		if (!response.ok) {
			throw new Error(`Feed request failed with ${response.status}`);
		}

		const rawFeed = await response.text();
		const entries = parseFeedEntries(rawFeed, {
			contentType: response.headers.get("content-type"),
			baseUrl: message.feedUrl,
		}).slice(0, 30);
		const aiMessages: FeedAiMessage[] = [];

		for (const entry of entries) {
			const saved = await upsertFeedEntry(env, {
				feedId: message.feedId,
				aiTranslationEnabled: message.aiTranslationEnabled,
				entry,
			});

			if (saved.shouldQueueAi) {
				aiMessages.push({
					itemId: saved.itemId,
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

function parseFeedEntries(
	input: string,
	options: { contentType?: string | null; baseUrl?: string },
): ParsedFeedEntry[] {
	const feed = extractFeedDocument(input, options);
	const entries = feed.entries ?? [];

	if (entries.length === 0) {
		throw new Error("Feed does not contain supported item nodes");
	}

	return entries.map((entry, index) => {
		const title = entry.title?.trim() || "Untitled item";
		const link = entry.link?.trim() || "";
		const guid = entry.id?.trim() || link || `${title}-${index}`;
		const summary = normalizeSummary(entry.summary?.trim() || "");

		return {
			id: guid,
			title,
			url: link,
			publishedAt: normalizeDate(entry.published || null),
			author: entry.author ?? null,
			summary: summary || null,
		};
	});
}

function normalizeSummary(value: string): string {
	return value
		.replace(/\r/g, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function normalizeDate(value: string | null): string | null {
	if (!value) {
		return null;
	}
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

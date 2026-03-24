import { sha256 } from "@/lib/api/tokens/crypto";
import type { CloudflareAccessUser } from "@/lib/cloudflare-access";
import type { FeedEnv } from "@/lib/feed/runtime";
import type {
	FeedAiMessage,
	FeedItemSummary,
	FeedReadingItem,
	FeedRunState,
	FeedSource,
	FeedSourceInput,
	ParsedFeedEntry,
} from "@/lib/feed/types";

interface FeedSourceRow {
	id: string;
	title: string;
	feed_url: string;
	site_url: string | null;
	is_active: number;
	last_fetched_at: string | null;
	last_error: string | null;
	created_at: string;
	updated_at: string;
	created_by_email: string;
	updated_by_email: string;
}

interface FeedItemRow {
	id: string;
	feed_id: string;
	feed_title: string;
	title: string;
	title_en: string | null;
	url: string;
	published_at: string | null;
	visible_until: string | null;
	click_count: number;
	source_language: string | null;
	description: string | null;
	description_en: string | null;
	ai_status: string;
	created_at: string;
	updated_at: string;
}

interface FeedReadingRow {
	item_id: string;
	feed_title: string;
	title: string;
	title_en: string | null;
	url: string;
	published_at: string | null;
	visible_until: string | null;
	click_count: number;
	source_language: string | null;
	description_en: string | null;
	description: string | null;
}

export async function listFeedSources(env: FeedEnv): Promise<FeedSource[]> {
	const result = await env.DATABASE.prepare(
		`SELECT id, title, feed_url, site_url, is_active, last_fetched_at, last_error,
		 created_at, updated_at, created_by_email, updated_by_email
		 FROM rss_feeds
		 ORDER BY updated_at DESC`,
	).all<FeedSourceRow>();

	return (result.results ?? []).map(mapFeedSourceRow);
}

export async function listActiveFeedSources(env: FeedEnv): Promise<FeedSource[]> {
	const result = await env.DATABASE.prepare(
		`SELECT id, title, feed_url, site_url, is_active, last_fetched_at, last_error,
		 created_at, updated_at, created_by_email, updated_by_email
		 FROM rss_feeds
		 WHERE is_active = 1
		 ORDER BY updated_at DESC`,
	).all<FeedSourceRow>();

	return (result.results ?? []).map(mapFeedSourceRow);
}

export async function createFeedSource(
	env: FeedEnv,
	input: FeedSourceInput,
	user: CloudflareAccessUser,
): Promise<FeedSource> {
	const now = new Date().toISOString();
	const id = crypto.randomUUID();

	await env.DATABASE.prepare(
		`INSERT INTO rss_feeds (
		 id, title, feed_url, site_url, is_active, last_fetched_at, last_error,
		 created_at, updated_at, created_by_email, updated_by_email
		) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)`,
	)
		.bind(
			id,
			input.title,
			input.feedUrl,
			input.siteUrl,
			input.isActive ? 1 : 0,
			now,
			now,
			user.email,
			user.email,
		)
		.run();

	return {
		id,
		...input,
		lastFetchedAt: null,
		lastError: null,
		createdAt: now,
		updatedAt: now,
		createdByEmail: user.email,
		updatedByEmail: user.email,
	};
}

export async function updateFeedSource(
	env: FeedEnv,
	id: string,
	input: FeedSourceInput,
	user: CloudflareAccessUser,
): Promise<FeedSource | null> {
	const existing = await getFeedSourceById(env, id);
	if (!existing) {
		return null;
	}

	const now = new Date().toISOString();
	await env.DATABASE.prepare(
		`UPDATE rss_feeds
		 SET title = ?, feed_url = ?, site_url = ?, is_active = ?, updated_at = ?, updated_by_email = ?
		 WHERE id = ?`,
	)
		.bind(
			input.title,
			input.feedUrl,
			input.siteUrl,
			input.isActive ? 1 : 0,
			now,
			user.email,
			id,
		)
		.run();

	return {
		...existing,
		...input,
		updatedAt: now,
		updatedByEmail: user.email,
	};
}

export async function deleteFeedSource(env: FeedEnv, id: string): Promise<boolean> {
	const existing = await getFeedSourceById(env, id);
	if (!existing) {
		return false;
	}

	await env.DATABASE.prepare("DELETE FROM rss_feeds WHERE id = ?").bind(id).run();
	return true;
}

export async function getFeedSourceById(env: FeedEnv, id: string): Promise<FeedSource | null> {
	const row = await env.DATABASE.prepare(
		`SELECT id, title, feed_url, site_url, is_active, last_fetched_at, last_error,
		 created_at, updated_at, created_by_email, updated_by_email
		 FROM rss_feeds WHERE id = ?`,
	)
		.bind(id)
		.first<FeedSourceRow>();

	return row ? mapFeedSourceRow(row) : null;
}

export async function listRecentFeedItems(env: FeedEnv, limit = 50): Promise<FeedItemSummary[]> {
	const result = await env.DATABASE.prepare(
		`SELECT items.id, items.feed_id, feeds.title AS feed_title, items.title, items.title_en, items.url, items.published_at,
		 items.visible_until, items.click_count,
		 items.source_language, items.description, items.description_en, items.ai_status, items.created_at, items.updated_at
		 FROM rss_feed_items AS items
		 JOIN rss_feeds AS feeds ON feeds.id = items.feed_id
		 ORDER BY COALESCE(items.published_at, items.created_at) DESC
		 LIMIT ?`,
	)
		.bind(limit)
		.all<FeedItemRow>();

	return (result.results ?? []).map(mapFeedItemRow);
}

export async function countFailedFeedItemsForAiRetry(env: FeedEnv): Promise<number> {
	const row = await env.DATABASE.prepare(
		`SELECT COUNT(*) AS total
		 FROM rss_feed_items
		 WHERE ai_status = 'failed' AND description IS NOT NULL AND TRIM(description) != ''`,
	).first<{ total: number }>();

	return Number(row?.total ?? 0);
}

export async function retryFailedFeedItemsAi(env: FeedEnv): Promise<number> {
	const result = await env.DATABASE.prepare(
		`SELECT id
		 FROM rss_feed_items
		 WHERE ai_status = 'failed' AND description IS NOT NULL AND TRIM(description) != ''`,
	).all<{ id: string }>();

	const items = result.results ?? [];
	if (items.length === 0) {
		return 0;
	}

	const now = new Date().toISOString();
	const statements = items.map((item) =>
		env.DATABASE.prepare(
			`UPDATE rss_feed_items
			 SET ai_status = 'pending', updated_at = ?
			 WHERE id = ? AND ai_status = 'failed'`,
		).bind(now, item.id),
	);
	await env.DATABASE.batch(statements);

	await queueAiMessages(
		env,
		items.map((item) => ({
			itemId: item.id,
		})),
	);

	return items.length;
}

export async function listVisibleFeedItems(env: FeedEnv): Promise<FeedReadingItem[]> {
	const result = await env.DATABASE.prepare(
		`SELECT items.id AS item_id, feeds.title AS feed_title, items.title, items.title_en, items.url, items.published_at,
		 items.visible_until, items.click_count, items.source_language, items.description_en, items.description
		 FROM rss_feed_items AS items
		 JOIN rss_feeds AS feeds ON feeds.id = items.feed_id
		 WHERE datetime(COALESCE(items.visible_until, datetime(items.created_at, '+24 hours'))) > datetime('now')
		 ORDER BY COALESCE(items.published_at, items.created_at) DESC`,
	)
		.all<FeedReadingRow>();

	return (result.results ?? []).map((row) => ({
		itemId: row.item_id,
		feedTitle: row.feed_title,
		title: row.title,
		titleEn: row.title_en,
		url: row.url,
		publishedAt: row.published_at,
		visibleUntil: row.visible_until,
		clickCount: Number(row.click_count ?? 0),
		sourceLanguage: row.source_language,
		descriptionEn: row.description_en,
		description: row.description,
	}));
}

export async function extendFeedItemVisibility(
	env: FeedEnv,
	itemId: string,
	visibleUntil: string,
): Promise<number | null> {
	const result = await env.DATABASE.prepare(
		`UPDATE rss_feed_items
		 SET visible_until = ?, click_count = COALESCE(click_count, 0) + 1, updated_at = ?
		 WHERE id = ?`,
	)
		.bind(visibleUntil, new Date().toISOString(), itemId)
		.run();

	if (!result.meta.changes) {
		return null;
	}

	const row = await env.DATABASE.prepare("SELECT click_count FROM rss_feed_items WHERE id = ?")
		.bind(itemId)
		.first<{ click_count: number }>();

	return Number(row?.click_count ?? 0);
}

export async function createIngestRun(
	env: FeedEnv,
	options: { dayUtc: string; trigger: string; feedCount: number; triggeredByEmail: string | null },
): Promise<string> {
	const id = crypto.randomUUID();
	const startedAt = new Date().toISOString();
	await env.DATABASE.prepare(
		`INSERT INTO rss_ingest_runs (
		 id, day_utc, trigger, status, feed_count, success_count, failure_count, triggered_by_email,
		 started_at, completed_at, updated_at
		) VALUES (?, ?, ?, 'running', ?, 0, 0, ?, ?, NULL, ?)`,
	)
		.bind(
			id,
			options.dayUtc,
			options.trigger,
			options.feedCount,
			options.triggeredByEmail,
			startedAt,
			startedAt,
		)
		.run();
	return id;
}

export async function completeIngestRun(env: FeedEnv, state: FeedRunState): Promise<void> {
	const completedAt = new Date().toISOString();
	await env.DATABASE.prepare(
		`UPDATE rss_ingest_runs
		 SET status = 'completed', success_count = ?, failure_count = ?, completed_at = ?, updated_at = ?
		 WHERE id = ?`,
	)
		.bind(state.successCount, state.failureCount, completedAt, completedAt, state.runId)
		.run();
}

export async function recordFeedFetchSuccess(env: FeedEnv, feedId: string): Promise<void> {
	const now = new Date().toISOString();
	await env.DATABASE.prepare(
		"UPDATE rss_feeds SET last_fetched_at = ?, last_error = NULL, updated_at = ? WHERE id = ?",
	)
		.bind(now, now, feedId)
		.run();
}

export async function recordFeedFetchFailure(
	env: FeedEnv,
	feedId: string,
	error: string,
): Promise<void> {
	const now = new Date().toISOString();
	await env.DATABASE.prepare("UPDATE rss_feeds SET last_error = ?, updated_at = ? WHERE id = ?")
		.bind(error.slice(0, 500), now, feedId)
		.run();
}

export async function upsertFeedEntry(
	env: FeedEnv,
	options: {
		feedId: string;
		entry: ParsedFeedEntry;
	},
): Promise<{ itemId: string; shouldQueueAi: boolean }> {
	const now = new Date().toISOString();
	const guidHash = await sha256(`${options.feedId}:${options.entry.id}`);
	const itemId = guidHash;
	const description = options.entry.content.trim() || null;
	const hasDescription = Boolean(description);

	await env.DATABASE.prepare(
		`INSERT INTO rss_feed_items (
		 id, feed_id, guid_hash, title, title_en, url, author, published_at, excerpt,
		 source_language, description, description_en, ai_status, visible_until, click_count,
		 created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
		 title = excluded.title,
		 url = excluded.url,
		 author = excluded.author,
		 published_at = excluded.published_at,
		 excerpt = excluded.excerpt,
		 source_language = CASE
			WHEN rss_feed_items.title != excluded.title
				OR COALESCE(rss_feed_items.description, '') != COALESCE(excluded.description, '')
			THEN NULL
			ELSE rss_feed_items.source_language
		 END,
		 description = excluded.description,
		 title_en = CASE
			WHEN rss_feed_items.title != excluded.title
				OR COALESCE(rss_feed_items.description, '') != COALESCE(excluded.description, '')
			THEN NULL
			ELSE rss_feed_items.title_en
		 END,
		 description_en = CASE
			WHEN rss_feed_items.title != excluded.title
				OR COALESCE(rss_feed_items.description, '') != COALESCE(excluded.description, '')
			THEN NULL
			ELSE rss_feed_items.description_en
		 END,
		 visible_until = COALESCE(rss_feed_items.visible_until, excluded.visible_until),
		 updated_at = excluded.updated_at,
		 ai_status = CASE
			WHEN excluded.description IS NULL OR TRIM(excluded.description) = '' THEN 'skipped'
			WHEN rss_feed_items.title != excluded.title
				OR COALESCE(rss_feed_items.description, '') != COALESCE(excluded.description, '')
			THEN 'pending'
			WHEN rss_feed_items.description_en IS NOT NULL THEN rss_feed_items.ai_status
			ELSE 'pending'
		 END`,
	)
		.bind(
			itemId,
			options.feedId,
			guidHash,
			options.entry.title,
			null,
			options.entry.url,
			options.entry.author,
			options.entry.publishedAt,
			options.entry.excerpt,
			description,
			hasDescription ? "pending" : "skipped",
			new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
			0,
			now,
			now,
		)
		.run();

	const row = await env.DATABASE.prepare(
		"SELECT ai_status FROM rss_feed_items WHERE id = ?",
	).bind(itemId).first<{ ai_status: string }>();

	return { itemId, shouldQueueAi: row?.ai_status === "pending" };
}

export async function getFeedItemForAi(
	env: FeedEnv,
	itemId: string,
): Promise<{ itemId: string; title: string; url: string; description: string | null } | null> {
	const row = await env.DATABASE.prepare(
		`SELECT id, title, url, description
		 FROM rss_feed_items
		 WHERE id = ?`,
	)
		.bind(itemId)
		.first<{ id: string; title: string; url: string; description: string | null }>();

	return row
		? {
				itemId: row.id,
				title: row.title,
				url: row.url,
				description: row.description,
			}
		: null;
}

export async function markFeedItemAiProcessing(env: FeedEnv, itemId: string): Promise<void> {
	await env.DATABASE.prepare(
		"UPDATE rss_feed_items SET ai_status = 'processing', updated_at = ? WHERE id = ?",
	)
		.bind(new Date().toISOString(), itemId)
		.run();
}

export async function markFeedItemAiFailed(
	env: FeedEnv,
	itemId: string,
): Promise<void> {
	await env.DATABASE.prepare(
		"UPDATE rss_feed_items SET ai_status = 'failed', updated_at = ? WHERE id = ?",
	)
		.bind(new Date().toISOString(), itemId)
		.run();
}

export async function recordFeedItemAiResult(
	env: FeedEnv,
	options: {
		itemId: string;
		sourceLanguage: string | null;
		titleEn: string | null;
		descriptionEn: string;
	},
): Promise<void> {
	const now = new Date().toISOString();
	await env.DATABASE.prepare(
		`UPDATE rss_feed_items
		 SET source_language = ?, title_en = ?, description_en = ?, ai_status = 'complete', updated_at = ?
		 WHERE id = ?`,
	)
		.bind(
			options.sourceLanguage,
			options.titleEn,
			options.descriptionEn,
			now,
			options.itemId,
		)
		.run();
}

export async function queueAiMessages(env: FeedEnv, messages: FeedAiMessage[]): Promise<void> {
	if (messages.length === 0) {
		return;
	}

	const batches: FeedAiMessage[][] = [];
	for (let index = 0; index < messages.length; index += 100) {
		batches.push(messages.slice(index, index + 100));
	}

	for (const batch of batches) {
		await env.RSS_AI_QUEUE.sendBatch(batch.map((message) => ({ body: message })));
	}
}

function mapFeedSourceRow(row: FeedSourceRow): FeedSource {
	return {
		id: row.id,
		title: row.title,
		feedUrl: row.feed_url,
		siteUrl: row.site_url,
		isActive: Boolean(row.is_active),
		lastFetchedAt: row.last_fetched_at,
		lastError: row.last_error,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		createdByEmail: row.created_by_email,
		updatedByEmail: row.updated_by_email,
	};
}

function mapFeedItemRow(row: FeedItemRow): FeedItemSummary {
	return {
		id: row.id,
		feedId: row.feed_id,
		feedTitle: row.feed_title,
		title: row.title,
		titleEn: row.title_en,
		url: row.url,
		publishedAt: row.published_at,
		visibleUntil: row.visible_until,
		clickCount: Number(row.click_count ?? 0),
		sourceLanguage: row.source_language,
		description: row.description,
		descriptionEn: row.description_en,
		aiStatus: row.ai_status,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

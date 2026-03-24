import { sha256 } from "@/lib/api/tokens/crypto";
import type { CloudflareAccessUser } from "@/lib/cloudflare-access";
import type { FeedEnv } from "@/lib/feed/runtime";
import { getDayUtc } from "@/lib/feed/runtime";
import type {
	FeedAiMessage,
	FeedItemSummary,
	FeedRecommendation,
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
	source_language: string | null;
	description: string | null;
	description_en: string | null;
	ai_status: string;
	created_at: string;
	updated_at: string;
	content_markdown_r2_key?: string | null;
}

interface RecommendationRow {
	day_utc: string;
	rank: number;
	item_id: string;
	feed_title: string;
	title: string;
	title_en: string | null;
	url: string;
	published_at: string | null;
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
		 items.source_language, items.description, items.description_en, items.ai_status, items.created_at, items.updated_at,
		 items.content_markdown_r2_key
		 FROM rss_feed_items AS items
		 JOIN rss_feeds AS feeds ON feeds.id = items.feed_id
		 ORDER BY COALESCE(items.published_at, items.created_at) DESC
		 LIMIT ?`,
	)
		.bind(limit)
		.all<FeedItemRow>();

	return (result.results ?? []).map(mapFeedItemRow);
}

export async function listTodayRecommendations(
	env: FeedEnv,
	dayUtc = getDayUtc(),
): Promise<FeedRecommendation[]> {
	const result = await env.DATABASE.prepare(
		`SELECT recommendations.day_utc, recommendations.rank, recommendations.item_id,
		 feeds.title AS feed_title, items.title, items.title_en, items.url, items.published_at, items.source_language, items.description_en, items.description
		 FROM rss_item_recommendations_daily AS recommendations
		 JOIN rss_feed_items AS items ON items.id = recommendations.item_id
		 JOIN rss_feeds AS feeds ON feeds.id = items.feed_id
		 WHERE recommendations.day_utc = ?
		 ORDER BY recommendations.rank ASC`,
	)
		.bind(dayUtc)
		.all<RecommendationRow>();

	return (result.results ?? []).map((row) => ({
		dayUtc: row.day_utc,
		rank: row.rank,
		itemId: row.item_id,
		feedTitle: row.feed_title,
		title: row.title,
		titleEn: row.title_en,
		url: row.url,
		publishedAt: row.published_at,
		sourceLanguage: row.source_language,
		descriptionEn: row.description_en,
		description: row.description,
	}));
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
		rawFeedKey: string;
		contentKey: string | null;
		entry: ParsedFeedEntry;
	},
): Promise<{ itemId: string; contentKey: string | null }> {
	const now = new Date().toISOString();
	const guidHash = await sha256(`${options.feedId}:${options.entry.id}`);
	const itemId = guidHash;

	await env.DATABASE.prepare(
		`INSERT INTO rss_feed_items (
		 id, feed_id, guid_hash, title, title_en, url, author, published_at, excerpt,
		 raw_feed_r2_key, content_markdown_r2_key, source_language, description, description_en, ai_status,
		 created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
		 title = excluded.title,
		 title_en = COALESCE(excluded.title_en, rss_feed_items.title_en),
		 url = excluded.url,
		 author = excluded.author,
		 published_at = excluded.published_at,
		 excerpt = excluded.excerpt,
		 raw_feed_r2_key = excluded.raw_feed_r2_key,
		 content_markdown_r2_key = COALESCE(excluded.content_markdown_r2_key, rss_feed_items.content_markdown_r2_key),
		 updated_at = excluded.updated_at,
		 ai_status = CASE
			WHEN rss_feed_items.description_en IS NOT NULL THEN rss_feed_items.ai_status
			WHEN excluded.content_markdown_r2_key IS NOT NULL THEN 'pending'
			ELSE rss_feed_items.ai_status
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
			options.rawFeedKey,
			options.contentKey,
			options.contentKey ? "pending" : "skipped",
			now,
			now,
		)
		.run();

	return { itemId, contentKey: options.contentKey };
}

export async function getFeedItemForAi(
	env: FeedEnv,
	itemId: string,
): Promise<{ itemId: string; contentKey: string; title: string; url: string } | null> {
	const row = await env.DATABASE.prepare(
		`SELECT id, title, url, content_markdown_r2_key
		 FROM rss_feed_items
		 WHERE id = ?`,
	)
		.bind(itemId)
		.first<{ id: string; title: string; url: string; content_markdown_r2_key: string | null }>();

	if (!row?.content_markdown_r2_key) {
		return null;
	}

	return {
		itemId: row.id,
		contentKey: row.content_markdown_r2_key,
		title: row.title,
		url: row.url,
	};
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
	error: string,
): Promise<void> {
	const now = new Date().toISOString();
	await env.DATABASE.prepare(
		`UPDATE rss_feed_items
		 SET ai_status = 'failed', description = ?, description_en = ?, updated_at = ?
		 WHERE id = ?`,
	)
		.bind(error.slice(0, 500), null, now, itemId)
		.run();
}

export async function recordFeedItemAiResult(
	env: FeedEnv,
	options: {
		itemId: string;
		sourceLanguage: string | null;
		titleEn: string | null;
		description: string;
		descriptionEn: string;
		aiResponseKey: string | null;
	},
): Promise<void> {
	const now = new Date().toISOString();
	await env.DATABASE.prepare(
		`UPDATE rss_feed_items
		 SET source_language = ?, title_en = ?, description = ?, description_en = ?, ai_status = 'complete', ai_response_r2_key = ?, updated_at = ?
		 WHERE id = ?`,
	)
		.bind(
			options.sourceLanguage,
			options.titleEn,
			options.description,
			options.descriptionEn,
			options.aiResponseKey,
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

export async function refreshDailyRecommendations(
	env: FeedEnv,
	dayUtc = getDayUtc(),
): Promise<number> {
	await env.DATABASE.prepare("DELETE FROM rss_item_recommendations_daily WHERE day_utc = ?")
		.bind(dayUtc)
		.run();

	await env.DATABASE.prepare(
		`INSERT INTO rss_item_recommendations_daily (id, day_utc, item_id, rank, created_at)
		 SELECT hex(randomblob(16)), ?, picked.id,
		 ROW_NUMBER() OVER (ORDER BY picked.random_order), ?
		 FROM (
			SELECT id, random() AS random_order
			FROM rss_feed_items
			WHERE published_at >= datetime('now', '-30 days')
			ORDER BY random()
			LIMIT 10
		 ) AS picked`,
	)
		.bind(dayUtc, new Date().toISOString())
		.run();

	const countRow = await env.DATABASE.prepare(
		"SELECT COUNT(*) AS count FROM rss_item_recommendations_daily WHERE day_utc = ?",
	)
		.bind(dayUtc)
		.first<{ count: number }>();

	return Number(countRow?.count ?? 0);
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
		sourceLanguage: row.source_language,
		description: row.description,
		descriptionEn: row.description_en,
		aiStatus: row.ai_status,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

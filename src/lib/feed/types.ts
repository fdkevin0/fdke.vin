export const FEED_COORDINATOR_NAME = "global-feed-pool";
export const RSS_FETCH_QUEUE_NAME = "rss-fetch-queue";
export const RSS_AI_QUEUE_NAME = "rss-ai-queue";
export const FEED_SUMMARY_MODEL = "@cf/meta/llama-3.1-8b-instruct";

export interface FeedSource {
	id: string;
	title: string;
	feedUrl: string;
	siteUrl: string | null;
	isActive: boolean;
	fetchMarkdown: boolean;
	lastFetchedAt: string | null;
	lastError: string | null;
	createdAt: string;
	updatedAt: string;
	createdByEmail: string;
	updatedByEmail: string;
}

export interface FeedItemSummary {
	id: string;
	feedId: string;
	feedTitle: string;
	title: string;
	url: string;
	publishedAt: string | null;
	sourceLanguage: string | null;
	summary: string | null;
	summaryEn: string | null;
	aiStatus: string;
	createdAt: string;
	updatedAt: string;
}

export interface FeedRecommendation {
	dayUtc: string;
	rank: number;
	itemId: string;
	feedTitle: string;
	title: string;
	url: string;
	publishedAt: string | null;
	summaryEn: string | null;
	summary: string | null;
}

export interface FeedFetchMessage {
	runId: string;
	dayUtc: string;
	feedId: string;
	feedUrl: string;
	fetchMarkdown: boolean;
	feedTitle: string;
}

export interface FeedAiMessage {
	itemId: string;
	contentKey: string;
	title: string;
	url: string;
}

export interface FeedRunState {
	runId: string;
	dayUtc: string;
	total: number;
	pending: number;
	successCount: number;
	failureCount: number;
	trigger: "cron" | "manual" | "alarm";
	startedAt: string;
	triggeredByEmail: string | null;
}

export interface ParsedFeedEntry {
	id: string;
	title: string;
	url: string;
	publishedAt: string | null;
	author: string | null;
	content: string;
	excerpt: string | null;
}

export interface FeedSourceInput {
	title: string;
	feedUrl: string;
	siteUrl: string | null;
	isActive: boolean;
	fetchMarkdown: boolean;
}

export interface AiSummaryResult {
	language: string | null;
	summary: string;
	summaryEn: string;
	rawResponse: string;
}

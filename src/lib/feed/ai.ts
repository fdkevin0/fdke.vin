import type { FeedEnv } from "@/lib/feed/runtime";
import {
	getFeedItemForAi,
	markFeedItemAiFailed,
	markFeedItemAiProcessing,
	recordFeedItemAiResult,
} from "@/lib/feed/storage";
import type { AiTranslationResult } from "@/lib/feed/types";
import { FEED_TRANSLATION_MODEL } from "@/lib/feed/types";

export async function processAiMessage(env: FeedEnv, itemId: string): Promise<void> {
	if (!env.AI) {
		console.error("[feed.ai] AI binding is not configured", { itemId });
		await markFeedItemAiFailed(env, itemId);
		return;
	}

	const item = await getFeedItemForAi(env, itemId);
	if (!item) {
		console.error("[feed.ai] feed item not found for AI processing", { itemId });
		return;
	}

	await markFeedItemAiProcessing(env, itemId);

	if (!item.summary) {
		console.error("[feed.ai] feed item summary is missing", {
			itemId,
			title: item.title,
			url: item.url,
		});
		await markFeedItemAiFailed(env, itemId);
		return;
	}

	try {
		const result = await translateContent(
			env,
			item.title,
			item.url,
			item.summary.slice(0, 4000),
		);
		await recordFeedItemAiResult(env, {
			itemId,
			sourceLanguage: result.language,
			titleEn: result.titleEn,
			summaryEn: result.summaryEn,
		});
	} catch (error) {
		console.error("[feed.ai] AI processing failed", {
			itemId,
			title: item.title,
			url: item.url,
			error: error instanceof Error ? error.message : "Unknown error",
		});
		await markFeedItemAiFailed(env, itemId);
	}
}

async function translateContent(
	env: FeedEnv,
	title: string,
	url: string,
	content: string,
): Promise<AiTranslationResult> {
	const translationPrompt = [
		"You translate RSS item titles and summaries for a bilingual RSS dashboard.",
		"Return strict JSON only with this exact structure:",
		'{"language":"<ISO-639-1 code or null if unknown>","title_en":"<English translation of title>","summary_en":"<English translation of summary>"}',
		"If the source language is English, use the original title and summary as the English fields.",
		"Keep translations natural and concise.",
		`Title: ${title}`,
		`URL: ${url}`,
		"RSS summary:",
		content,
	].join("\n\n");

	const request = {
		prompt: translationPrompt,
	};
	console.log("[feed.ai] AI request", {
		model: FEED_TRANSLATION_MODEL,
		title,
		url,
		request,
	});

	const response = (await env.AI.run(FEED_TRANSLATION_MODEL as keyof AiModels, request)) as {
		response?: string;
		result?: { response?: string };
	};
	console.log("[feed.ai] AI response", {
		model: FEED_TRANSLATION_MODEL,
		title,
		url,
		response,
	});
	const rawResponse =
		response?.response || response?.result?.response || JSON.stringify(response ?? {});
	const parsed = parseJsonObject(rawResponse);

	const language =
		typeof parsed.language === "string" ? parsed.language.trim().toLowerCase() : null;
	const titleEn = typeof parsed.title_en === "string" ? parsed.title_en.trim() : title;
	const summaryEn = typeof parsed.summary_en === "string" ? parsed.summary_en.trim() : content;

	if (!titleEn || !summaryEn) {
		throw new Error("AI response did not include required translation fields");
	}

	return {
		language,
		titleEn,
		summaryEn,
	};
}

function parseJsonObject(raw: string): Record<string, unknown> {
	const trimmed = raw.trim();
	try {
		return JSON.parse(trimmed) as Record<string, unknown>;
	} catch {}

	const match = trimmed.match(/\{[\s\S]*\}/);
	if (!match) {
		throw new Error("AI response was not valid JSON");
	}

	return JSON.parse(match[0]) as Record<string, unknown>;
}

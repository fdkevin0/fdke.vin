import type { FeedEnv } from "@/lib/feed/runtime";
import { createR2Key } from "@/lib/feed/runtime";
import {
	getFeedItemForAi,
	markFeedItemAiFailed,
	markFeedItemAiProcessing,
	recordFeedItemAiResult,
} from "@/lib/feed/storage";
import type { AiSummaryResult } from "@/lib/feed/types";
import { FEED_SUMMARY_MODEL } from "@/lib/feed/types";

export async function processAiMessage(env: FeedEnv, itemId: string): Promise<void> {
	if (!env.AI) {
		await markFeedItemAiFailed(env, itemId, "Workers AI binding is not configured");
		return;
	}

	const item = await getFeedItemForAi(env, itemId);
	if (!item) {
		return;
	}

	await markFeedItemAiProcessing(env, itemId);

	const object = await env.RSS_BUCKET.get(item.contentKey);
	if (!object) {
		await markFeedItemAiFailed(env, itemId, "Item content not found in R2");
		return;
	}

	const content = (await object.text()).trim();
	if (!content) {
		await markFeedItemAiFailed(env, itemId, "Item content is empty");
		return;
	}

	try {
		const result = await summarizeAndTranslate(env, item.title, item.url, content.slice(0, 12000));
		const responseKey = createR2Key("rss/ai", `${itemId}.json`);
		await env.RSS_BUCKET.put(responseKey, result.rawResponse, {
			httpMetadata: { contentType: "application/json; charset=utf-8" },
		});
		await recordFeedItemAiResult(env, {
			itemId,
			sourceLanguage: result.language,
			summary: result.summary,
			summaryEn: result.summaryEn,
			aiResponseKey: responseKey,
		});
	} catch (error) {
		await markFeedItemAiFailed(
			env,
			itemId,
			error instanceof Error ? error.message : "AI processing failed",
		);
	}
}

async function summarizeAndTranslate(
	env: FeedEnv,
	title: string,
	url: string,
	content: string,
): Promise<AiSummaryResult> {
	const summaryPrompt = [
		"You summarize web articles for a shared RSS dashboard.",
		"Return strict JSON only.",
		'{"language":"<ISO-639-1 or null>","summary":"<concise summary in the source language>","summary_en":"<natural English translation of the summary>"}',
		"Keep each summary under 120 words.",
		`Title: ${title}`,
		`URL: ${url}`,
		"Article:",
		content,
	].join("\n\n");

	const response = (await env.AI.run(FEED_SUMMARY_MODEL as keyof AiModels, {
		prompt: summaryPrompt,
	})) as {
		response?: string;
		result?: { response?: string };
	};
	const rawResponse =
		response?.response ||
		response?.result?.response ||
		JSON.stringify(response ?? { error: "empty AI response" });
	const parsed = parseJsonObject(rawResponse);

	const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
	const summaryEn = typeof parsed.summary_en === "string" ? parsed.summary_en.trim() : "";
	const language =
		typeof parsed.language === "string" ? parsed.language.trim().toLowerCase() : null;

	if (!summary || !summaryEn) {
		throw new Error("AI response did not include summary fields");
	}

	return {
		language,
		summary,
		summaryEn,
		rawResponse: JSON.stringify({ rawResponse, parsed }, null, 2),
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

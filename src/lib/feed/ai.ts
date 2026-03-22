import type { FeedEnv } from "@/lib/feed/runtime";
import { createR2Key } from "@/lib/feed/runtime";
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
		const result = await translateContent(env, item.title, item.url, content.slice(0, 12000));
		const responseKey = createR2Key("rss/ai", `${itemId}.json`);
		await env.RSS_BUCKET.put(responseKey, result.rawResponse, {
			httpMetadata: { contentType: "application/json; charset=utf-8" },
		});
		await recordFeedItemAiResult(env, {
			itemId,
			sourceLanguage: result.language,
			titleEn: result.titleEn,
			description: result.descriptionOriginal,
			descriptionEn: result.descriptionEn,
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

async function translateContent(
	env: FeedEnv,
	title: string,
	url: string,
	content: string,
): Promise<AiTranslationResult> {
	const translationPrompt = [
		"You translate web article titles and descriptions for a bilingual RSS dashboard.",
		"Return strict JSON only with this exact structure:",
		'{"language":"<ISO-639-1 code or null if unknown>","title_en":"<English translation of title>","description_original":"<original description text>","description_en":"<English translation of description>"}',
		"If the source language is English, use the original title and description for both original and English fields.",
		"Keep translations natural and concise.",
		`Title: ${title}`,
		`URL: ${url}`,
		"Article content:",
		content,
	].join("\n\n");

	const response = (await env.AI.run(FEED_TRANSLATION_MODEL as keyof AiModels, {
		prompt: translationPrompt,
	})) as {
		response?: string;
		result?: { response?: string };
	};
	const rawResponse =
		response?.response ||
		response?.result?.response ||
		JSON.stringify(response ?? { error: "empty AI response" });
	const parsed = parseJsonObject(rawResponse);

	const language =
		typeof parsed.language === "string" ? parsed.language.trim().toLowerCase() : null;
	const titleEn = typeof parsed.title_en === "string" ? parsed.title_en.trim() : title;
	const descriptionOriginal =
		typeof parsed.description_original === "string" ? parsed.description_original.trim() : content;
	const descriptionEn =
		typeof parsed.description_en === "string" ? parsed.description_en.trim() : descriptionOriginal;

	if (!titleEn || !descriptionEn) {
		throw new Error("AI response did not include required translation fields");
	}

	return {
		language,
		titleEn,
		descriptionOriginal,
		descriptionEn,
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

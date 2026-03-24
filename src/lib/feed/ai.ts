import type { FeedEnv } from "@/lib/feed/runtime";
import {
	getFeedItemForAi,
	markFeedItemAiFailed,
	markFeedItemAiProcessing,
	recordFeedItemAiResult,
} from "@/lib/feed/storage";
import type { AiTranslationResult } from "@/lib/feed/types";
import { FEED_TRANSLATION_MODEL } from "@/lib/feed/types";

const FEED_TRANSLATION_RESPONSE_SCHEMA = {
	type: "object",
	properties: {
		language: {
			type: "string",
			description:
				"Source language as a lowercase ISO-639-1 code. Return an empty string if unknown.",
		},
		title_en: {
			type: "string",
			description: "English translation of the RSS item title.",
		},
		summary_en: {
			type: "string",
			description: "English translation of the RSS item summary.",
		},
	},
	required: ["language", "title_en", "summary_en"],
	additionalProperties: false,
} as const;

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
	const request = {
		messages: [
			{
				role: "system",
				content:
					"You translate RSS item titles and summaries for a bilingual RSS dashboard. Detect the original language, translate into concise natural English, and preserve meaning. If the source language is English, keep the original title and summary. Return only fields that satisfy the provided JSON schema. For language, return a lowercase ISO-639-1 code, or an empty string if unknown.",
			},
			{
				role: "user",
				content: [
					`Title: ${title}`,
					`URL: ${url}`,
					"RSS summary:",
					content,
				].join("\n\n"),
			},
		],
		response_format: {
			type: "json_schema",
			json_schema: FEED_TRANSLATION_RESPONSE_SCHEMA,
		},
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
	const parsed = parseAiTranslationResponse(rawResponse);

	const normalizedLanguage = parsed.language.trim().toLowerCase();
	const language = normalizedLanguage || null;
	const titleEn = parsed.title_en.trim() || title;
	const summaryEn = parsed.summary_en.trim() || content;

	if (!titleEn || !summaryEn) {
		throw new Error("AI response did not include required translation fields");
	}

	return {
		language,
		titleEn,
		summaryEn,
	};
}

function parseAiTranslationResponse(raw: string): {
	language: string;
	title_en: string;
	summary_en: string;
} {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw.trim());
	} catch {
		throw new Error("AI response was not valid JSON");
	}

	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("AI response was not a JSON object");
	}

	const candidate = parsed as Record<string, unknown>;
	const language = typeof candidate.language === "string" ? candidate.language : undefined;
	const titleEn = candidate.title_en;
	const summaryEn = candidate.summary_en;

	if (language === undefined) {
		throw new Error("AI response did not include a valid language field");
	}
	if (typeof titleEn !== "string" || typeof summaryEn !== "string") {
		throw new Error("AI response did not include required translation fields");
	}

	return {
		language,
		title_en: titleEn,
		summary_en: summaryEn,
	};
}

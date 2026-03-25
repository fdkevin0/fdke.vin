import { jsonError } from "@/lib/api/http";
import type { FeedSourceCreateInput, FeedSourceInput } from "@/lib/feed/types";

interface RawFeedSourceInput {
	title?: unknown;
	feedUrl?: unknown;
	siteUrl?: unknown;
	isActive?: unknown;
	aiTranslationEnabled?: unknown;
}

export async function readCreateFeedSourceInput(
	request: Request,
): Promise<FeedSourceCreateInput | Response> {
	const body = (await request.json()) as RawFeedSourceInput;
	const feedUrl = normalizeUrl(body.feedUrl);
	const isActive = body.isActive === undefined ? true : Boolean(body.isActive);
	const aiTranslationEnabled =
		body.aiTranslationEnabled === undefined ? true : Boolean(body.aiTranslationEnabled);

	if (!feedUrl) {
		return jsonError(400, "A valid feedUrl is required");
	}

	return {
		feedUrl,
		isActive,
		aiTranslationEnabled,
	};
}

export async function readFeedSourceInput(request: Request): Promise<FeedSourceInput | Response> {
	const body = (await request.json()) as RawFeedSourceInput;
	const title = typeof body.title === "string" ? body.title.trim() : "";
	const feedUrl = normalizeUrl(body.feedUrl);
	const siteUrl = normalizeOptionalUrl(body.siteUrl);
	const isActive = body.isActive === undefined ? true : Boolean(body.isActive);
	const aiTranslationEnabled =
		body.aiTranslationEnabled === undefined ? true : Boolean(body.aiTranslationEnabled);

	if (!title) {
		return jsonError(400, "Feed title is required");
	}

	if (!feedUrl) {
		return jsonError(400, "A valid feedUrl is required");
	}

	if (body.siteUrl !== undefined && body.siteUrl !== null && body.siteUrl !== "" && !siteUrl) {
		return jsonError(400, "siteUrl must be a valid http or https URL");
	}

	return {
		title,
		feedUrl,
		siteUrl,
		isActive,
		aiTranslationEnabled,
	};
}

function normalizeUrl(value: unknown): string | null {
	if (typeof value !== "string" || !value.trim()) {
		return null;
	}

	try {
		const url = new URL(value.trim());
		if (!["http:", "https:"].includes(url.protocol)) {
			return null;
		}
		return url.toString();
	} catch {
		return null;
	}
}

function normalizeOptionalUrl(value: unknown): string | null {
	if (value === undefined || value === null || value === "") {
		return null;
	}

	return normalizeUrl(value);
}

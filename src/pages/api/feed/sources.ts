export const prerender = false;

import type { APIRoute } from "astro";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";
import { requireAccessUser } from "@/lib/api/tokens/request";
import { resolveFeedSourceMetadata } from "@/lib/feed/extractor";
import { readCreateFeedSourceInput } from "@/lib/feed/request";
import { getDayUtc, getFeedEnv } from "@/lib/feed/runtime";
import { createFeedSource, listFeedSources } from "@/lib/feed/storage";

export const GET: APIRoute = async ({ locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) {
		return user;
	}

	try {
		const env = await getFeedEnv();
		const feeds = await listFeedSources(env);
		return jsonNoStore({ feeds });
	} catch (error) {
		logApiError("feed.sources.list", error, { user: user.email });
		return jsonError(500, getErrorMessage(error, "Failed to list feed sources"));
	}
};

export const POST: APIRoute = async ({ request, locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) {
		return user;
	}

	try {
		const input = await readCreateFeedSourceInput(request);
		if (input instanceof Response) {
			return input;
		}

		const metadata = await resolveFeedSourceMetadata(input.feedUrl);
		const env = await getFeedEnv();
		const feed = await createFeedSource(
			env,
			{
				title: metadata.title,
				feedUrl: input.feedUrl,
				siteUrl: metadata.siteUrl,
				isActive: input.isActive,
			},
			user,
		);
		if (feed.isActive) {
			await env.RSS_FETCH_QUEUE.send({
				runId: crypto.randomUUID(),
				dayUtc: getDayUtc(),
				feedId: feed.id,
				feedUrl: feed.feedUrl,
				feedTitle: feed.title,
			});
		}
		return jsonNoStore({ feed }, { status: 201 });
	} catch (error) {
		const message = getErrorMessage(error, "Failed to create feed source");
		if (
			message.includes("Feed did not provide a title") ||
			message.includes("Feed request failed")
		) {
			return jsonError(400, message);
		}
		if (message.includes("UNIQUE constraint failed") || message.includes("rss_feeds.feed_url")) {
			return jsonError(409, "Feed source already exists");
		}
		logApiError("feed.sources.create", error, { user: user.email });
		return jsonError(500, message);
	}
};

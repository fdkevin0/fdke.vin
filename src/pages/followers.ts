export const prerender = false;

import { OrderedCollection } from "@fedify/fedify/vocab";
import type { APIRoute } from "astro";
import { followersUri } from "@/lib/ap/config";
import { countFollowers, listFollowerIds } from "@/lib/ap/followers";
import { activityJson } from "@/lib/ap/response";
import { getApEnv } from "@/lib/ap/runtime";
import { getErrorMessage, logApiError } from "@/lib/api/http";

/**
 * The actor's followers collection (issue AP-4/AP-5): an `OrderedCollection` of
 * follower actor ids. Some servers fetch this to confirm a follow persisted.
 */
export const GET: APIRoute = async ({ url }) => {
	try {
		const env = await getApEnv();
		const [total, ids] = await Promise.all([countFollowers(env), listFollowerIds(env)]);
		const collection = new OrderedCollection({
			id: followersUri(url.origin),
			totalItems: total,
			items: ids.map((id) => new URL(id)),
		});
		return activityJson(await collection.toJsonLd());
	} catch (error) {
		logApiError("ap.followers", error);
		return new Response(getErrorMessage(error, "Followers are not available"), { status: 500 });
	}
};

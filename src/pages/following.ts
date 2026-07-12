export const prerender = false;

import { OrderedCollection } from "@fedify/fedify/vocab";
import type { APIRoute } from "astro";
import { followingUri } from "@/lib/ap/config";
import { activityJson } from "@/lib/ap/response";
import { getErrorMessage, logApiError } from "@/lib/api/http";

/**
 * The actor's following collection (issue AP-4): the accounts the actor
 * follows. The site is a broadcast-only actor — it never follows anyone — so
 * this is always empty, but it is served (rather than 404) so the URI the actor
 * document advertises resolves for servers that dereference it.
 */
export const GET: APIRoute = async ({ url }) => {
	try {
		const collection = new OrderedCollection({
			id: followingUri(url.origin),
			totalItems: 0,
			items: [],
		});
		return activityJson(await collection.toJsonLd());
	} catch (error) {
		logApiError("ap.following", error);
		return new Response(getErrorMessage(error, "Following is not available"), { status: 500 });
	}
};

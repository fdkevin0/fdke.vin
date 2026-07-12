export const prerender = false;

import type { APIRoute } from "astro";
import { buildActor } from "@/lib/ap/actor";
import { loadActorKeyPair } from "@/lib/ap/keys";
import { activityJson } from "@/lib/ap/response";
import { getApEnv } from "@/lib/ap/runtime";
import { getErrorMessage, logApiError } from "@/lib/api/http";

/**
 * The site's ActivityPub actor document (issue AP-4).
 *
 * Served as `application/activity+json` at the fixed `/actor` id WebFinger
 * points to. Exposes the actor's inbox/outbox/followers and the RSA `publicKey`
 * remote servers use to verify its signed requests.
 */
export const GET: APIRoute = async ({ url }) => {
	try {
		const env = await getApEnv();
		const { publicKey } = await loadActorKeyPair(env);
		const doc = await buildActor({ origin: url.origin, publicKey });
		return activityJson(doc);
	} catch (error) {
		logApiError("ap.actor", error);
		return new Response(getErrorMessage(error, "Actor is not available"), { status: 500 });
	}
};

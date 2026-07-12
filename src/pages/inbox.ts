export const prerender = false;

import type { APIRoute } from "astro";
import { z } from "zod";
import { type InboundActivity, processInboxActivity } from "@/lib/ap/inbox";
import { getApEnv } from "@/lib/ap/runtime";
import { verifySignature } from "@/lib/ap/signature";
import { getErrorMessage, logApiError, readJson } from "@/lib/api/http";

const referenceableSchema = z.union([
	z.string(),
	z.looseObject({ id: z.string().optional(), type: z.string().optional() }),
	z.null(),
]);

const inboundActivitySchema: z.ZodType<InboundActivity> = z.looseObject({
	id: z.string().optional(),
	type: z.string().optional(),
	actor: referenceableSchema.optional(),
	object: referenceableSchema.optional(),
});

/**
 * The actor's ActivityPub inbox (issue AP-5).
 *
 * Every inbound request must carry a valid HTTP Signature — unsigned or forged
 * requests are rejected before any processing. A verified `Follow` stores the
 * follower and delivers a signed `Accept`; an `Undo(Follow)` removes it. Other
 * activities are acknowledged and ignored (a 202 stops remote servers retrying).
 */
export const POST: APIRoute = async ({ request, url }) => {
	// Verify the signature first, against a clone so the original request's body
	// stream is left intact for the JSON parse below — no reliance on Fedify's
	// internal cloning.
	let verifiedKey: Awaited<ReturnType<typeof verifySignature>>;
	try {
		// `clone()` widens to Cloudflare's Request subtype; verifySignature wants
		// the DOM Request, and only reads standard fields.
		verifiedKey = await verifySignature(request.clone() as Request);
	} catch (error) {
		logApiError("ap.inbox", error);
		verifiedKey = null;
	}
	if (!verifiedKey) {
		return new Response("Invalid HTTP Signature", { status: 401 });
	}

	const activity = await readJson(request, inboundActivitySchema);
	if (activity instanceof Response) return activity;

	try {
		const env = await getApEnv();
		const outcome = await processInboxActivity(env, { activity, origin: url.origin });
		return new Response(JSON.stringify(outcome), {
			status: 202,
			headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
		});
	} catch (error) {
		logApiError("ap.inbox", error, { activity_type: activity.type });
		// A 500 lets the sender retry transient failures (remote fetch, D1 blips).
		return new Response(getErrorMessage(error, "Failed to process activity"), { status: 500 });
	}
};

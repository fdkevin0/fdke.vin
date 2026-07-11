export const prerender = false;

import type { APIRoute } from "astro";
import { getErrorMessage, jsonError, logApiError } from "@/lib/api/http";
import { requireCloudflareEnv } from "@/lib/cloudflare-runtime";

/** The streaming R2 object members used to serve media (see cast note below). */
interface R2StoredObject {
	body: ReadableStream;
	httpEtag: string;
	writeHttpMetadata(headers: Headers): void;
}

/**
 * Serve a Note media attachment stored in R2 (AP_BUCKET). The `[...key]` path
 * is the R2 object key written by the Telegram ingest pipeline, e.g.
 * `notes/{noteId}/{fileUniqueId}.jpg`. Objects are immutable (keyed by the
 * photo's unique id) so they cache aggressively.
 */
export const GET: APIRoute = async ({ params }) => {
	const key = params.key?.trim();
	if (!key) {
		return jsonError(400, "Media key is required");
	}

	try {
		const env = await requireCloudflareEnv("AP_BUCKET");
		// The repo's ambient R2 types narrow `.get()` to a minimal `{ text() }`
		// shape (existing bucket code only ever reads `.text()`); the runtime
		// object is a full R2ObjectBody, so read the streaming members through a
		// local interface.
		const object = (await env.AP_BUCKET.get(key)) as R2StoredObject | null;
		if (!object) {
			return jsonError(404, "Media not found");
		}

		const headers = new Headers();
		object.writeHttpMetadata(headers);
		headers.set("ETag", object.httpEtag);
		headers.set("Cache-Control", "public, max-age=31536000, immutable");
		if (!headers.has("Content-Type")) {
			headers.set("Content-Type", "application/octet-stream");
		}
		return new Response(object.body, { headers });
	} catch (error) {
		logApiError("ap.media", error, { key });
		return jsonError(500, getErrorMessage(error, "Failed to fetch media"));
	}
};

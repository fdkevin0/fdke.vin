import type { ApEnv } from "@/lib/ap/runtime";

/**
 * Proxy a remote actor's avatar through R2 (issue AP-7) so reply/like/announce
 * threads never hotlink a remote host (which would leak every reader's IP to it
 * and break when the remote image moves). The image is fetched once, stored in
 * AP_BUCKET under a content-addressed key, and served from `/api/ap/media/...`
 * like Note photo attachments. Re-proxying the same URL reuses the stored object.
 *
 * Best-effort: any failure returns `null`, and the thread renders with a
 * fallback avatar rather than failing ingestion.
 */

/** Prefix media is served from (mirrors the Telegram ingest pipeline). */
const MEDIA_PATH = "/api/ap/media/";

/** The R2 members used here (the repo's ambient R2 type is narrowed elsewhere). */
interface AvatarBucket {
	head(key: string): Promise<unknown | null>;
	put(
		key: string,
		value: ArrayBuffer,
		options?: { httpMetadata?: { contentType?: string } },
	): Promise<unknown>;
}

const EXT_BY_TYPE: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/jpg": "jpg",
	"image/png": "png",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/avif": "avif",
};

async function sha256Hex(input: string): Promise<string> {
	const bytes = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Store `sourceUrl` in R2 (if not already stored) and return its served
 * `/api/ap/media/...` URL, or `null` on any failure or non-image response.
 */
export async function proxyRemoteImage(
	env: ApEnv,
	sourceUrl: string | null | undefined,
): Promise<string | null> {
	if (!sourceUrl) return null;
	let parsed: URL;
	try {
		parsed = new URL(sourceUrl);
	} catch {
		return null;
	}
	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

	const bucket = env.AP_BUCKET as unknown as AvatarBucket;
	const hash = await sha256Hex(sourceUrl);

	try {
		// Fetch first so the key carries the right extension; skip the write if the
		// hash-keyed object already exists (content-addressed, so it's immutable).
		const res = await fetch(sourceUrl, { redirect: "follow" });
		if (!res.ok) return null;
		const contentType = (res.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
		if (!contentType.startsWith("image/")) return null;
		const ext = EXT_BY_TYPE[contentType] ?? "bin";
		const key = `avatars/${hash}.${ext}`;

		const existing = await bucket.head(key).catch(() => null);
		if (!existing) {
			const bytes = await res.arrayBuffer();
			await bucket.put(key, bytes, { httpMetadata: { contentType } });
		}
		return `${MEDIA_PATH}${key}`;
	} catch {
		return null;
	}
}

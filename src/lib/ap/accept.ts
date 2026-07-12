/**
 * Content-negotiation for ActivityPub note URLs.
 *
 * A Fediverse server fetching `application/activity+json` (or
 * `application/ld+json` with the ActivityStreams profile) gets the AS2 object;
 * everyone else gets the SSR HTML page. Kept pure so it can be unit-tested
 * input→output without an actual Request.
 */

const ACTIVITY_JSON = "application/activity+json";
const LD_JSON = "application/ld+json";

/** True if the `Accept` header indicates an ActivityPub / AS2 client. */
export function acceptsActivityPub(accept: string | null | undefined): boolean {
	if (!accept) return false;

	// Fast path: an exact `application/activity+json` media type anywhere.
	for (const part of accept.split(",")) {
		const media = part.split(";")[0]?.trim().toLowerCase();
		if (media === ACTIVITY_JSON) return true;
		if (media === LD_JSON) {
			const params = part.slice(media.length).toLowerCase();
			if (/profile\s*=\s*["'][^"']*activitystreams/.test(params)) return true;
			if (/profile\s*=\s*'[^']*activitystreams'/.test(part)) return true;
			// Unquoted profile parameter.
			if (/profile\s*=\s*https:\/\/www\.w3\.org\/ns\/activitystreams/.test(params)) return true;
		}
	}
	return false;
}

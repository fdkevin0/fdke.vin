/**
 * Shared HTTP helpers for the ActivityPub surface: JSON responses with the AS2
 * / JRD content types Fediverse servers expect, and a `Vary: Accept` so shared
 * caches don't hand an AS2 body to a browser (or vice versa).
 */

/** An AS2 activity/object/collection response (`application/activity+json`). */
export function activityJson(body: unknown, init?: ResponseInit): Response {
	return new Response(JSON.stringify(body, null, 2), {
		...init,
		headers: {
			"Content-Type": "application/activity+json; charset=utf-8",
			Vary: "Accept",
			...(init?.headers ?? {}),
		},
	});
}

/** A WebFinger JRD response (`application/jrd+json`). */
export function jrdJson(body: unknown, init?: ResponseInit): Response {
	return new Response(JSON.stringify(body, null, 2), {
		...init,
		headers: {
			"Content-Type": "application/jrd+json; charset=utf-8",
			"Access-Control-Allow-Origin": "*",
			...(init?.headers ?? {}),
		},
	});
}

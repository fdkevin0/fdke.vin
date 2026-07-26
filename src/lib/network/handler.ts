import { type Connection, readConnection } from "@/lib/network/connection";
import { lookupIpProfile } from "@/lib/network/profile";
import { RadarError, RadarUnconfiguredError } from "@/lib/network/radar";
import {
	negotiateFormat,
	renderConnectionLine,
	renderConnectionTable,
	renderHostnameText,
	renderProfileLine,
	renderProfileTable,
	USAGE,
	wantsDetail,
} from "@/lib/network/render";
import { resolveHostname } from "@/lib/network/resolve";
import { type LookupTarget, parseLookupTarget } from "@/lib/network/target";

/** The hostname this handler owns. Must match the `custom_domain` route in `wrangler.jsonc`. */
export const LOOKUP_HOST = "ip.fdke.vin";

/** Where a browser is sent, since the lookup host serves no HTML of its own. */
export const TOOL_PAGE_URL = "https://fdke.vin/tools/network";

/**
 * `/json` is reserved rather than resolved. It parses as a hostname, and a
 * caller typing it has ifconfig.co muscle memory, not a domain called "json".
 */
const JSON_ALIAS_PATH = "json";

/** An address's origin AS changes on a timescale of days, not minutes. */
const PROFILE_MAX_AGE_SECONDS = 86_400;

/** Cap the addresses profiled for one hostname so a large round-robin set cannot fan out. */
const MAX_HOSTNAME_ADDRESSES = 4;

const TEXT_HEADERS = { "Content-Type": "text/plain; charset=utf-8" };

/**
 * Lookups are readable from anywhere. The data is public, the endpoint is
 * unauthenticated and carries no cookies, and the tool page on the apex is
 * itself a cross-origin caller. A simple GET with no custom headers triggers no
 * preflight, so this one header is the whole CORS story.
 */
const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

export interface LookupHostContext {
	token: string | undefined;
	fetchImpl?: typeof fetch | undefined;
	/** Omitted in tests; supplied as `caches.default` in the Worker. */
	cache?: Cache | undefined;
	waitUntil?: ((promise: Promise<unknown>) => void) | undefined;
}

export function isLookupHost(hostname: string): boolean {
	return hostname === LOOKUP_HOST;
}

/**
 * Serve one request to the lookup host.
 *
 * This runs ahead of Astro so the endpoint does not pay for the site's request
 * pipeline — auth, i18n, page routing — none of which it uses. See
 * `docs/adr/0006`.
 */
export async function handleLookupHostRequest(
	request: Request,
	context: LookupHostContext,
): Promise<Response> {
	if (request.method !== "GET" && request.method !== "HEAD") {
		return new Response("Method not allowed\n", {
			status: 405,
			headers: { ...TEXT_HEADERS, Allow: "GET, HEAD" },
		});
	}

	const url = new URL(request.url);
	const segments = url.pathname.split("/").filter(Boolean);

	if (segments[0] === "robots.txt") {
		// A lookup endpoint has nothing worth indexing and every URL is distinct.
		return new Response("User-agent: *\nDisallow: /\n", { headers: TEXT_HEADERS });
	}

	if (segments.length > 1) return usageResponse();

	const format = negotiateFormat(url, request.headers);
	const detail = wantsDetail(url);
	const segment = segments[0];

	if (segment === undefined || segment === JSON_ALIAS_PATH) {
		if (format === "html") return Response.redirect(TOOL_PAGE_URL, 302);
		const asJson = format === "json" || segment === JSON_ALIAS_PATH;
		return connectionResponse(readConnection(request), asJson, detail);
	}

	const target = parseLookupTarget(segment);
	if (!target) return usageResponse();

	if (format === "html") {
		const page = new URL(TOOL_PAGE_URL);
		page.searchParams.set("q", target.kind === "ip" ? target.ip : target.hostname);
		return Response.redirect(page.toString(), 302);
	}

	return lookupResponse(request, url, target, format === "json", detail, context);
}

function connectionResponse(connection: Connection, asJson: boolean, detail: boolean): Response {
	// A Connection describes the caller, so it is never cached or stored.
	const headers = { ...TEXT_HEADERS, "Cache-Control": "no-store" };

	if (asJson) {
		return new Response(`${JSON.stringify(connection, null, 2)}\n`, {
			headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
		});
	}

	return new Response(
		detail ? renderConnectionTable(connection) : renderConnectionLine(connection),
		{
			headers,
		},
	);
}

async function lookupResponse(
	request: Request,
	url: URL,
	target: LookupTarget,
	asJson: boolean,
	detail: boolean,
	context: LookupHostContext,
): Promise<Response> {
	const cacheKey = buildCacheKey(url, target, asJson, detail);
	const cached = await context.cache?.match(cacheKey);
	if (cached) return cached;

	let response: Response;
	try {
		response =
			target.kind === "ip"
				? await ipLookupResponse(target.ip, asJson, detail, context)
				: await hostnameLookupResponse(target.hostname, asJson, detail, context);
	} catch (error) {
		return radarErrorResponse(error, asJson);
	}

	if (context.cache && request.method === "GET") {
		const store = context.cache.put(cacheKey, response.clone());
		if (context.waitUntil) context.waitUntil(store);
		else await store;
	}

	return response;
}

async function ipLookupResponse(
	ip: string,
	asJson: boolean,
	detail: boolean,
	context: LookupHostContext,
): Promise<Response> {
	const profile = await lookupIpProfile(ip, {
		token: context.token,
		fetchImpl: context.fetchImpl,
		detail,
	});

	const body = asJson
		? `${JSON.stringify(profile, null, 2)}\n`
		: detail
			? renderProfileTable(profile)
			: renderProfileLine(profile);

	return cacheableResponse(body, asJson);
}

async function hostnameLookupResponse(
	hostname: string,
	asJson: boolean,
	detail: boolean,
	context: LookupHostContext,
): Promise<Response> {
	const addresses = (await resolveHostname(hostname, { fetchImpl: context.fetchImpl })).slice(
		0,
		MAX_HOSTNAME_ADDRESSES,
	);

	const profiles = await Promise.all(
		addresses.map((address) =>
			lookupIpProfile(address, {
				token: context.token,
				fetchImpl: context.fetchImpl,
				detail,
			}),
		),
	);

	if (asJson) {
		return cacheableResponse(
			`${JSON.stringify({ hostname, addresses, profiles }, null, 2)}\n`,
			true,
		);
	}

	return cacheableResponse(renderHostnameText(hostname, profiles, detail), false);
}

function cacheableResponse(body: string, asJson: boolean): Response {
	return new Response(body, {
		headers: {
			"Content-Type": asJson ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
			"Cache-Control": `public, max-age=${PROFILE_MAX_AGE_SECONDS}`,
			...CORS_HEADERS,
		},
	});
}

/**
 * The cache key is rebuilt from the parsed target rather than reused from the
 * request, so `/1.1.1.1`, `/1.1.1.1/` and `/01.1.1.1` share one entry and
 * unrelated query strings cannot multiply it.
 */
function buildCacheKey(url: URL, target: LookupTarget, asJson: boolean, detail: boolean): Request {
	const key = new URL(url.origin);
	key.pathname = `/${target.kind === "ip" ? target.ip : target.hostname}`;
	if (asJson) key.searchParams.set("format", "json");
	if (detail) key.searchParams.set("detail", "1");
	return new Request(key.toString(), { method: "GET" });
}

/**
 * Radar failures are reported as themselves, never retried and never masked as
 * a successful empty answer — a `429` or a `422` ("query above max cost") is
 * information the caller needs, and retrying either spends the undocumented
 * budget faster. See `docs/cloudflare-radar-api.md` §5.
 */
function radarErrorResponse(error: unknown, asJson: boolean): Response {
	const radarError = error instanceof RadarError ? error : new RadarError("Lookup failed", 502);

	const message =
		radarError instanceof RadarUnconfiguredError
			? "Address lookups are unavailable: Radar is not configured. `curl ip.fdke.vin` still works."
			: radarError.message;

	const headers: Record<string, string> = {
		"Content-Type": asJson ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
		"Cache-Control": "no-store",
		...CORS_HEADERS,
	};
	if (radarError.status === 429) headers["Retry-After"] = "60";

	return new Response(
		asJson ? `${JSON.stringify({ error: message }, null, 2)}\n` : `${message}\n`,
		{ status: radarError.status, headers },
	);
}

function usageResponse(): Response {
	return new Response(USAGE, {
		status: 400,
		headers: { ...TEXT_HEADERS, "Cache-Control": "no-store" },
	});
}

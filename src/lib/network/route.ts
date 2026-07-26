import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { getErrorMessage, json, jsonError, logApiError } from "@/lib/api/http";
import { cacheHeaders, withEdgeCache } from "@/lib/network/cache";
import { RadarError, type RadarOptions } from "@/lib/network/radar";

/**
 * The HTTP boundary for the Radar dataset groups.
 *
 * This is the one module under `src/lib/network/` that touches the Workers
 * runtime; everything else takes its dependencies as arguments and runs in the
 * plain node test run. The group readers in `datasets.ts` are where the logic
 * worth testing lives.
 */

const COUNTRY_CODE = /^[A-Z]{2}$/;

/**
 * The reader's country, for datasets that can be filtered by one.
 *
 * An unrecognised value is dropped rather than rejected — the global figures
 * are still worth returning, and this is a page decoration, not a query.
 */
export function readCountryParam(url: URL): string | null {
	const requested = url.searchParams.get("cc")?.toUpperCase();
	return requested && COUNTRY_CODE.test(requested) ? requested : null;
}

/**
 * Build the route for one Radar dataset group.
 *
 * Every group behaves identically at this layer — read once, cache the whole
 * group under one entry, and surface a Radar failure as itself rather than
 * retrying it (`docs/cloudflare-radar-api.md` §5). Only the reader, the name
 * and the lifetime differ, so those are the arguments.
 */
export function radarGroupRoute<T>(
	name: string,
	maxAgeSeconds: number,
	read: (options: RadarOptions, url: URL) => Promise<T>,
): APIRoute {
	return async ({ request, url }) => {
		try {
			return await withEdgeCache(request, async () => {
				const snapshot = await read({ token: env.RADAR_API_TOKEN }, url);
				return json(snapshot, { headers: cacheHeaders(maxAgeSeconds) });
			});
		} catch (error) {
			logApiError(`network.${name}`, error);
			if (error instanceof RadarError) return jsonError(error.status, error.message);
			return jsonError(500, getErrorMessage(error, `Failed to load ${name} data`));
		}
	};
}

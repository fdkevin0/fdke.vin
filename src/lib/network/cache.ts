/**
 * The Workers shared edge cache.
 *
 * `caches.default` exists at runtime, but `astro check` resolves the global
 * against the DOM `CacheStorage`, which declares only `open()`. The cast names
 * what the runtime provides; it returns null off-Workers so the helper below
 * degrades to a plain call in a node test run.
 */
function edgeCache(): Cache | null {
	const storage = caches as unknown as { default?: Cache };
	return storage.default ?? null;
}

/**
 * Serve a Radar-backed group from the edge cache, computing it only on a miss.
 *
 * The whole group shares one entry, so a hit costs zero Radar calls for every
 * panel it feeds — which is the point, given Radar publishes no rate limit to
 * budget against (`docs/cloudflare-radar-api.md` §5).
 *
 * A failed group is returned uncached, so a transient 429 does not get pinned
 * in front of the endpoint for the rest of the TTL.
 *
 * The lifetime comes from the `Cache-Control` the produced response carries —
 * see {@link cacheHeaders} — which is what the Cache API reads, so it is not
 * also passed here where the two could drift apart.
 */
export async function withEdgeCache(
	request: Request,
	produce: () => Promise<Response>,
): Promise<Response> {
	const cache = edgeCache();
	if (!cache || request.method !== "GET") return produce();

	const cached = await cache.match(request);
	if (cached) return cached;

	const response = await produce();
	if (response.ok) await cache.put(request, response.clone());

	return response;
}

/** Cache-Control for a group response, matched to how fast the dataset moves. */
export function cacheHeaders(maxAgeSeconds: number): Record<string, string> {
	return { "Cache-Control": `public, max-age=${maxAgeSeconds}` };
}

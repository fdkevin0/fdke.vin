export async function getCloudflareEnv<TEnv>(): Promise<TEnv> {
	const runtime = await import("cloudflare:workers");
	return runtime.env as TEnv;
}

/**
 * Keeps a promise alive past the response.
 *
 * A bare floating promise can be cancelled once a Worker returns its response,
 * which silently drops writes that are not on the critical path. `waitUntil`
 * is the runtime's contract for "finish this before tearing the request down".
 */
export async function runInBackground(promise: Promise<unknown>): Promise<void> {
	const runtime = await import("cloudflare:workers");
	runtime.waitUntil(promise);
}

/** Returns the runtime env after asserting the named bindings are configured. */
export async function requireCloudflareEnv<K extends keyof Env>(...bindings: K[]): Promise<Env> {
	const env = await getCloudflareEnv<Env>();
	const missing = bindings.filter((binding) => env[binding] == null);
	if (missing.length > 0) {
		throw new Error(`Missing Cloudflare binding(s): ${missing.join(", ")}`);
	}
	return env;
}

export async function getCloudflareEnv<TEnv>(): Promise<TEnv> {
	const runtime = await import("cloudflare:workers");
	return runtime.env as TEnv;
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

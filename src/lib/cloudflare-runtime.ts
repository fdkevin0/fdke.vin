export async function getCloudflareEnv<TEnv>(): Promise<TEnv> {
	const runtime = await import("cloudflare:workers");
	return runtime.env as TEnv;
}

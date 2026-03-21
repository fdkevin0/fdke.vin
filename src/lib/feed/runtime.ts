import { getCloudflareEnv } from "@/lib/cloudflare-runtime";
export type FeedEnv = Env;

export async function getFeedEnv(): Promise<FeedEnv> {
	const env = await getCloudflareEnv<Partial<FeedEnv>>();
	if (!env.DATABASE) {
		throw new Error("D1 DATABASE binding is not configured");
	}
	if (!env.RSS_BUCKET) {
		throw new Error("R2 RSS_BUCKET binding is not configured");
	}
	if (!env.RSS_FETCH_QUEUE) {
		throw new Error("RSS_FETCH_QUEUE binding is not configured");
	}
	if (!env.RSS_AI_QUEUE) {
		throw new Error("RSS_AI_QUEUE binding is not configured");
	}
	if (!env.FEED_COORDINATOR) {
		throw new Error("FEED_COORDINATOR binding is not configured");
	}

	return env as FeedEnv;
}

export function getDayUtc(value = new Date()): string {
	return value.toISOString().slice(0, 10);
}

export function createR2Key(prefix: string, suffix: string): string {
	return `${prefix.replace(/\/+$/g, "")}/${suffix.replace(/^\/+/, "")}`;
}

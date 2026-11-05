import { requireCloudflareEnv } from "@/lib/cloudflare-runtime";
export type FeedEnv = Env;

export async function getFeedEnv(): Promise<FeedEnv> {
	return requireCloudflareEnv("DATABASE", "RSS_FETCH_QUEUE", "RSS_AI_QUEUE", "FEED_COORDINATOR");
}

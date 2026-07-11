import { requireCloudflareEnv } from "@/lib/cloudflare-runtime";

export type ApEnv = Env;

/** Runtime env for the ActivityPub subsystem, asserting its bindings exist. */
export async function getApEnv(): Promise<ApEnv> {
	return requireCloudflareEnv("DATABASE");
}

/**
 * Runtime env for Telegram ingestion, additionally asserting the R2 bucket and
 * bot token used to fetch and store channel-post photos.
 */
export async function getApIngestEnv(): Promise<ApEnv> {
	return requireCloudflareEnv("DATABASE", "AP_BUCKET", "TELEGRAM_BOT_TOKEN");
}

import { requireCloudflareEnv } from "@/lib/cloudflare-runtime";

export type ApEnv = Env;

/** Runtime env for the ActivityPub subsystem, asserting its bindings exist. */
export async function getApEnv(): Promise<ApEnv> {
	return requireCloudflareEnv("DATABASE");
}

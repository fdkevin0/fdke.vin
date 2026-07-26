export const prerender = false;

import { fetchHealth } from "@/lib/network/datasets";
import { radarGroupRoute } from "@/lib/network/route";

/** Outages are the one group where being an hour stale would be misleading. */
const MAX_AGE_SECONDS = 900;

export const GET = radarGroupRoute("health", MAX_AGE_SECONDS, (options) => fetchHealth(options));

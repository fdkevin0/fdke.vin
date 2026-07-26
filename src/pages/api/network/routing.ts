export const prerender = false;

import { fetchRouting } from "@/lib/network/datasets";
import { radarGroupRoute } from "@/lib/network/route";

/** Hijacks and leaks are detected continuously but read fine at quarter-hour resolution. */
const MAX_AGE_SECONDS = 900;

export const GET = radarGroupRoute("routing", MAX_AGE_SECONDS, (options) => fetchRouting(options));

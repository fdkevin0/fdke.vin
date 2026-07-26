export const prerender = false;

import { fetchRankings } from "@/lib/network/datasets";
import { radarGroupRoute, readCountryParam } from "@/lib/network/route";

/** Radar recomputes domain rankings daily; an hour is well inside that. */
const MAX_AGE_SECONDS = 3600;

export const GET = radarGroupRoute("rankings", MAX_AGE_SECONDS, (options, url) =>
	fetchRankings(readCountryParam(url), options),
);

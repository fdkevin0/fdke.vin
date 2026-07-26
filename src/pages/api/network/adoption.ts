export const prerender = false;

import { fetchAdoption } from "@/lib/network/datasets";
import { radarGroupRoute, readCountryParam } from "@/lib/network/route";

/** Adoption shares move slowly; an hour is well inside their resolution. */
const MAX_AGE_SECONDS = 3600;

export const GET = radarGroupRoute("adoption", MAX_AGE_SECONDS, (options, url) =>
	fetchAdoption(readCountryParam(url), options),
);

import { type RadarOptions, radarGet } from "@/lib/network/radar";
import { ipVersion } from "@/lib/network/target";

/**
 * What Radar knows about an address, whether or not it ever connected here.
 *
 * Country-granular by nature: Radar's own glossary states its IP geolocation
 * comes from a third-party database at country resolution, and
 * `/radar/entities/ip` returns no city, region or coordinates
 * (`docs/cloudflare-radar-api.md` §3.1). Do not add city fields here by
 * chaining `/radar/geolocations` — it is keyed by GeoNames id, which
 * `entities/ip` does not return, so there is no IP→city path through Radar.
 */
export interface IpProfile {
	ip: string;
	ipVersion: 4 | 6;
	country: string | null;
	countryName: string | null;
	asn: number | null;
	asnName: string | null;
	asnOrgName: string | null;
	asnCountry: string | null;
	/** Present only when the caller asked for detail; costs a second Radar call. */
	detail: IpProfileDetail | null;
}

export interface IpProfileDetail {
	/** The RIR the AS is registered with, e.g. `RIPE`. */
	registry: string | null;
	website: string | null;
	estimatedUsers: number | null;
	confidenceLevel: number | null;
	relatedAsns: { asn: number; name: string | null }[];
}

interface RadarIpResult {
	ip?: {
		ip?: string;
		ipVersion?: string;
		location?: string;
		locationName?: string;
		asn?: number;
		asnName?: string;
		asnOrgName?: string;
		asnLocation?: string;
	};
}

interface RadarAsnResult {
	asn?: {
		asn?: number;
		confidenceLevel?: number;
		country?: string;
		countryName?: string;
		name?: string;
		orgName?: string;
		source?: string;
		website?: string;
		related?: { asn?: number; name?: string }[];
		estimatedUsers?: { estimatedUsers?: number };
	};
}

export interface LookupIpProfileOptions extends RadarOptions {
	/** Adds the registry/website/estimated-users call. */
	detail?: boolean | undefined;
}

/**
 * Build an IP profile for one address.
 *
 * The plain form is a single Radar call, because this runs on a public,
 * unauthenticated endpoint anyone can point a loop at and Radar's budget is
 * undocumented. Detail is opt-in and costs one more call; both are issued
 * together rather than in sequence since neither depends on the other —
 * `/radar/entities/asns/ip` takes the address directly.
 */
export async function lookupIpProfile(
	ip: string,
	options: LookupIpProfileOptions,
): Promise<IpProfile> {
	const radarOptions: RadarOptions = { token: options.token, fetchImpl: options.fetchImpl };

	const [entity, asnEntity] = await Promise.all([
		radarGet<RadarIpResult>("/entities/ip", { ip }, radarOptions),
		options.detail
			? radarGet<RadarAsnResult>("/entities/asns/ip", { ip }, radarOptions)
			: Promise.resolve(null),
	]);

	const source = entity.ip ?? {};
	const asn = asnEntity?.asn;

	return {
		ip: source.ip ?? ip,
		ipVersion: ipVersion(source.ip ?? ip),
		country: source.location ?? null,
		countryName: source.locationName ?? null,
		asn: source.asn ?? null,
		asnName: source.asnName ?? null,
		asnOrgName: source.asnOrgName ?? null,
		asnCountry: source.asnLocation ?? null,
		detail: asn
			? {
					registry: asn.source ?? null,
					website: asn.website ?? null,
					estimatedUsers: asn.estimatedUsers?.estimatedUsers ?? null,
					confidenceLevel: asn.confidenceLevel ?? null,
					relatedAsns: (asn.related ?? [])
						.filter((entry): entry is { asn: number; name?: string } => entry.asn !== undefined)
						.map((entry) => ({ asn: entry.asn, name: entry.name ?? null })),
				}
			: null,
	};
}

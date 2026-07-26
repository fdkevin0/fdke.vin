import { ipVersion } from "@/lib/network/target";

/**
 * What the Cloudflare edge observed about one live request.
 *
 * Every field comes off the request itself — `request.cf` plus the
 * `CF-Connecting-IP` header — so reading a Connection costs no upstream call
 * and no token. That is why the lookup host answers `curl ip.fdke.vin` even
 * when Radar is unreachable or unconfigured.
 *
 * A Connection exists only for the duration of the request that produced it:
 * colo, TLS version and RTT are properties of a connection, not of an address,
 * and there is no way to ask for them about an address that never connected.
 * See `docs/adr/0006`.
 */
export interface Connection {
	ip: string;
	ipVersion: 4 | 6 | null;
	colo: string | null;
	httpProtocol: string | null;
	tlsVersion: string | null;
	tlsCipher: string | null;
	clientTcpRttMs: number | null;
	asn: number | null;
	asOrganization: string | null;
	country: string | null;
	continent: string | null;
	city: string | null;
	region: string | null;
	postalCode: string | null;
	latitude: string | null;
	longitude: string | null;
	timezone: string | null;
	isEUCountry: boolean;
}

/**
 * The subset of `request.cf` a Connection reads. Declared structurally rather
 * than as `IncomingRequestCfProperties` so the reader is callable from tests
 * with a plain object, no Workers runtime required.
 */
export interface ConnectionSource {
	colo?: string | undefined;
	httpProtocol?: string | undefined;
	tlsVersion?: string | undefined;
	tlsCipher?: string | undefined;
	clientTcpRtt?: number | undefined;
	asn?: number | undefined;
	asOrganization?: string | undefined;
	country?: string | undefined;
	continent?: string | undefined;
	city?: string | undefined;
	region?: string | undefined;
	postalCode?: string | undefined;
	latitude?: string | undefined;
	longitude?: string | undefined;
	timezone?: string | undefined;
	isEUCountry?: string | undefined;
}

/**
 * `country` is `"T1"` for requests arriving over Tor, which is not an ISO
 * country and should not be shown as one or passed to Radar as a location.
 */
const TOR_COUNTRY = "T1";

export function readConnection(request: Request): Connection {
	return buildConnection(
		request.headers.get("CF-Connecting-IP") ?? "",
		(request.cf ?? {}) as ConnectionSource,
	);
}

/**
 * The mapping half, split from {@link readConnection} so it is reachable
 * without a Workers runtime — `request.cf` is only populated by the edge.
 */
export function buildConnection(ip: string, cf: ConnectionSource): Connection {
	const country = cf.country && cf.country !== TOR_COUNTRY ? cf.country : null;

	return {
		ip,
		ipVersion: ip ? ipVersion(ip) : null,
		colo: cf.colo ?? null,
		httpProtocol: cf.httpProtocol ?? null,
		tlsVersion: cf.tlsVersion ?? null,
		tlsCipher: cf.tlsCipher ?? null,
		clientTcpRttMs: cf.clientTcpRtt ?? null,
		asn: cf.asn ?? null,
		asOrganization: cf.asOrganization ?? null,
		country,
		continent: cf.continent ?? null,
		city: cf.city ?? null,
		region: cf.region ?? null,
		postalCode: cf.postalCode ?? null,
		latitude: cf.latitude ?? null,
		longitude: cf.longitude ?? null,
		timezone: cf.timezone ?? null,
		isEUCountry: cf.isEUCountry === "1",
	};
}

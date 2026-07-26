import { type RadarOptions, radarGet } from "@/lib/network/radar";

/**
 * The Radar aggregate datasets, read as groups.
 *
 * Each group is one API route and one cache entry, so a cache hit costs zero
 * Radar calls for the whole group rather than one per panel.
 *
 * Response shapes here follow `docs/cloudflare-radar-api.md` §2–§3.6: every
 * `/summary/*` endpoint returns `result.summary_0` as a dimension→percentage
 * map, `/top/*` returns a ranked array, and the annotation endpoints return
 * dated event lists. Parsing is deliberately lenient — a dimension key that
 * Radar renames should drop one row, not fail the group.
 */

/** A week smooths the weekday/weekend swing without going stale. */
const DEFAULT_DATE_RANGE = "7d";

interface SummaryResult {
	summary_0?: Record<string, string | number>;
}

/** One adoption measure, as a share of traffic, read for a country and for the world. */
export interface AdoptionMetric {
	key: string;
	label: string;
	/** Percentage in the reader's own country, or null when the edge gave no country. */
	local: number | null;
	global: number | null;
}

export interface AdoptionSnapshot {
	country: string | null;
	dateRange: string;
	metrics: AdoptionMetric[];
}

/**
 * The summary dimensions worth a row, and which key of each `summary_0` map is
 * the interesting one. Radar returns every key of a dimension; a bar chart of
 * "IPv4 vs IPv6" is two numbers that always sum to 100, so only one is shown.
 */
const ADOPTION_METRICS: { key: string; label: string; path: string; pick: string }[] = [
	{ key: "ipv6", label: "IPv6", path: "/http/summary/ip_version", pick: "IPv6" },
	{ key: "http3", label: "HTTP/3", path: "/http/summary/http_version", pick: "HTTPv3" },
	{ key: "tls13", label: "TLS 1.3", path: "/http/summary/tls_version", pick: "TLS 1.3" },
	{ key: "mobile", label: "Mobile", path: "/http/summary/device_type", pick: "mobile" },
	{ key: "bots", label: "Automated traffic", path: "/http/summary/bot_class", pick: "bot" },
];

/**
 * Radar spells some `summary_0` keys differently across dimensions, and has
 * changed them before. Each metric accepts a few spellings and takes the first
 * that appears rather than pinning one.
 */
const KEY_ALIASES: Record<string, string[]> = {
	IPv6: ["IPv6", "ipv6"],
	HTTPv3: ["HTTPv3", "http3", "HTTP/3"],
	"TLS 1.3": ["TLS 1.3", "TLSv1_3", "TLSv1.3"],
	mobile: ["mobile", "MOBILE"],
	bot: ["bot", "LIKELY_AUTOMATED", "likelyAutomated"],
};

function pickShare(
	summary: Record<string, string | number> | undefined,
	pick: string,
): number | null {
	if (!summary) return null;

	for (const alias of KEY_ALIASES[pick] ?? [pick]) {
		const raw = summary[alias];
		if (raw === undefined) continue;
		const value = typeof raw === "number" ? raw : Number.parseFloat(raw);
		if (Number.isFinite(value)) return value;
	}

	return null;
}

/**
 * Adoption shares for the reader's country alongside the global figure.
 *
 * Each metric costs two calls rather than one multi-series call: Radar's
 * comparison syntax is positional across parallel arrays, which can express
 * two *filtered* series but not one filtered and one unfiltered.
 */
export async function fetchAdoption(
	country: string | null,
	options: RadarOptions,
): Promise<AdoptionSnapshot> {
	const metrics = await Promise.all(
		ADOPTION_METRICS.map(async (metric) => {
			const [local, global] = await Promise.all([
				country
					? radarGet<SummaryResult>(
							metric.path,
							{ location: country, dateRange: DEFAULT_DATE_RANGE },
							options,
						).catch(() => null)
					: Promise.resolve(null),
				radarGet<SummaryResult>(metric.path, { dateRange: DEFAULT_DATE_RANGE }, options).catch(
					() => null,
				),
			]);

			return {
				key: metric.key,
				label: metric.label,
				local: pickShare(local?.summary_0, metric.pick),
				global: pickShare(global?.summary_0, metric.pick),
			};
		}),
	);

	return { country, dateRange: DEFAULT_DATE_RANGE, metrics };
}

export interface OutageEvent {
	/** Whether a human corroborated it. Verified outages and traffic anomalies are never merged. */
	verified: boolean;
	scope: string | null;
	cause: string | null;
	locations: string[];
	asns: string[];
	startDate: string | null;
	endDate: string | null;
	linkedUrl: string | null;
}

export interface HealthSnapshot {
	outages: OutageEvent[];
	anomalies: OutageEvent[];
}

interface AnnotationsResult {
	annotations?: {
		outage?: { outageCause?: string; outageType?: string };
		locationsDetails?: { name?: string }[];
		asnsDetails?: { asn?: number; name?: string }[];
		startDate?: string;
		endDate?: string;
		scope?: string;
		linkedUrl?: string;
	}[];
}

interface TrafficAnomaliesResult {
	trafficAnomalies?: {
		type?: string;
		status?: string;
		locationDetails?: { name?: string };
		asnDetails?: { asn?: number; name?: string };
		startDate?: string;
		endDate?: string;
	}[];
}

const HEALTH_LIMIT = 8;

/**
 * Current Internet health, as two separate lists.
 *
 * Radar's glossary draws a hard line between a *verified outage* — manually
 * corroborated — and a *traffic anomaly*, which is an algorithmically observed
 * drop nobody has confirmed. Presenting them as one list would assert something
 * Radar does not.
 */
export async function fetchHealth(options: RadarOptions): Promise<HealthSnapshot> {
	const [outagesResult, anomaliesResult] = await Promise.all([
		radarGet<AnnotationsResult>("/annotations/outages", { limit: HEALTH_LIMIT }, options).catch(
			() => null,
		),
		radarGet<TrafficAnomaliesResult>(
			"/traffic_anomalies",
			{ limit: HEALTH_LIMIT, status: "VERIFIED" },
			options,
		).catch(() => null),
	]);

	const outages: OutageEvent[] = (outagesResult?.annotations ?? []).map((annotation) => ({
		verified: true,
		scope: annotation.scope ?? annotation.outage?.outageType ?? null,
		cause: annotation.outage?.outageCause ?? null,
		locations: (annotation.locationsDetails ?? [])
			.map((location) => location.name)
			.filter((name): name is string => Boolean(name)),
		asns: (annotation.asnsDetails ?? [])
			.map((entry) => (entry.asn ? `AS${entry.asn}${entry.name ? ` ${entry.name}` : ""}` : null))
			.filter((label): label is string => Boolean(label)),
		startDate: annotation.startDate ?? null,
		endDate: annotation.endDate ?? null,
		linkedUrl: annotation.linkedUrl ?? null,
	}));

	const anomalies: OutageEvent[] = (anomaliesResult?.trafficAnomalies ?? []).map((anomaly) => ({
		verified: false,
		scope: anomaly.type ?? null,
		cause: null,
		locations: anomaly.locationDetails?.name ? [anomaly.locationDetails.name] : [],
		asns: anomaly.asnDetails?.asn
			? [
					`AS${anomaly.asnDetails.asn}${anomaly.asnDetails.name ? ` ${anomaly.asnDetails.name}` : ""}`,
				]
			: [],
		startDate: anomaly.startDate ?? null,
		endDate: anomaly.endDate ?? null,
		linkedUrl: null,
	}));

	return { outages, anomalies };
}

/** A routing event Radar detected: an origin hijack or a route leak. */
export interface RoutingEvent {
	kind: "hijack" | "leak";
	prefix: string | null;
	/** Radar's own confidence wording for hijacks; leaks carry none. */
	confidence: string | null;
	detectedOrigin: string | null;
	expectedOrigin: string | null;
	startDate: string | null;
}

export interface RoutingSnapshot {
	events: RoutingEvent[];
}

interface HijacksResult {
	asn_info?: unknown;
	events?: {
		hijacker_asn?: number;
		victim_asns?: number[];
		prefixes?: string[];
		confidence_score?: number;
		starttime?: string;
		tags?: { name?: string }[];
	}[];
}

interface LeaksResult {
	events?: {
		leaker_asn?: number;
		origin_asn?: number;
		leaked_prefixes?: { prefix?: string }[];
		starttime?: string;
	}[];
}

const ROUTING_LIMIT = 6;

/**
 * Recently detected hijacks and leaks.
 *
 * Radar scores hijack confidence numerically; it is reported as its own wording
 * rather than a bare number so the page does not imply more precision than the
 * dataset has. Both calls tolerate failure independently — a leak feed being
 * down should not hide hijacks.
 */
export async function fetchRouting(options: RadarOptions): Promise<RoutingSnapshot> {
	const [hijacks, leaks] = await Promise.all([
		radarGet<HijacksResult>("/bgp/hijacks/events", { perPage: ROUTING_LIMIT }, options).catch(
			() => null,
		),
		radarGet<LeaksResult>("/bgp/leaks/events", { perPage: ROUTING_LIMIT }, options).catch(
			() => null,
		),
	]);

	const hijackEvents: RoutingEvent[] = (hijacks?.events ?? []).map((event) => ({
		kind: "hijack" as const,
		prefix: event.prefixes?.[0] ?? null,
		confidence: describeConfidence(event.confidence_score),
		detectedOrigin: event.hijacker_asn ? `AS${event.hijacker_asn}` : null,
		expectedOrigin: event.victim_asns?.[0] ? `AS${event.victim_asns[0]}` : null,
		startDate: event.starttime ?? null,
	}));

	const leakEvents: RoutingEvent[] = (leaks?.events ?? []).map((event) => ({
		kind: "leak" as const,
		prefix: event.leaked_prefixes?.[0]?.prefix ?? null,
		confidence: null,
		detectedOrigin: event.leaker_asn ? `AS${event.leaker_asn}` : null,
		expectedOrigin: event.origin_asn ? `AS${event.origin_asn}` : null,
		startDate: event.starttime ?? null,
	}));

	return { events: [...hijackEvents, ...leakEvents] };
}

function describeConfidence(score: number | undefined): string | null {
	if (score === undefined) return null;
	if (score >= 80) return "high";
	if (score >= 40) return "medium";
	return "low";
}

export interface RankedDomain {
	rank: number;
	domain: string;
}

export interface AttackShare {
	label: string;
	percentage: number;
}

export interface RankingsSnapshot {
	country: string | null;
	popular: RankedDomain[];
	trending: RankedDomain[];
	ddosLayer3: AttackShare[];
	ddosLayer7: AttackShare[];
}

interface RankingResult {
	top_0?: { rank?: number; domain?: string }[];
}

const RANKING_LIMIT = 10;
const ATTACK_LIMIT = 5;

/**
 * Domain rankings and attack shares.
 *
 * Popular domains are asked for in the reader's own country when the edge gave
 * one, since a global top-10 is the same ten names for everybody; trending and
 * the attack breakdowns stay global.
 */
export async function fetchRankings(
	country: string | null,
	options: RadarOptions,
): Promise<RankingsSnapshot> {
	const [popular, trending, layer3, layer7] = await Promise.all([
		radarGet<RankingResult>(
			"/ranking/top",
			{ limit: RANKING_LIMIT, rankingType: "POPULAR", location: country ?? undefined },
			options,
		).catch(() => null),
		radarGet<RankingResult>(
			"/ranking/top",
			{ limit: RANKING_LIMIT, rankingType: "TRENDING_RISE" },
			options,
		).catch(() => null),
		radarGet<SummaryResult>(
			"/attacks/layer3/summary/protocol",
			{ dateRange: DEFAULT_DATE_RANGE },
			options,
		).catch(() => null),
		radarGet<SummaryResult>(
			"/attacks/layer7/summary/mitigation_product",
			{ dateRange: DEFAULT_DATE_RANGE },
			options,
		).catch(() => null),
	]);

	return {
		country,
		popular: readRanking(popular),
		trending: readRanking(trending),
		ddosLayer3: readShares(layer3?.summary_0),
		ddosLayer7: readShares(layer7?.summary_0),
	};
}

function readRanking(result: RankingResult | null): RankedDomain[] {
	return (result?.top_0 ?? [])
		.map((entry, index) => ({ rank: entry.rank ?? index + 1, domain: entry.domain ?? "" }))
		.filter((entry) => entry.domain);
}

/** A `summary_0` map turned into the largest few shares, biggest first. */
function readShares(summary: Record<string, string | number> | undefined): AttackShare[] {
	if (!summary) return [];

	return Object.entries(summary)
		.map(([label, raw]) => ({
			label,
			percentage: typeof raw === "number" ? raw : Number.parseFloat(raw),
		}))
		.filter((share) => Number.isFinite(share.percentage))
		.sort((a, b) => b.percentage - a.percentage)
		.slice(0, ATTACK_LIMIT);
}

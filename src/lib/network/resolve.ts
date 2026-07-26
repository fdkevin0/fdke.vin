/**
 * Cloudflare's DoH endpoint, in its JSON flavour.
 *
 * Radar cannot do this: its DNS datasets are aggregated, anonymized trends
 * over 1.1.1.1 traffic, not a resolver — there is no Radar endpoint that
 * answers "what does this name resolve to". See `docs/cloudflare-radar-api.md`
 * §7.2. Resolution therefore goes straight to 1.1.1.1, which needs no token
 * and spends no Radar budget.
 */
const DOH_URL = "https://1.1.1.1/dns-query";

/** A and AAAA, so a hostname lookup reports both families in one answer. */
const RECORD_TYPES = ["A", "AAAA"] as const;

interface DohAnswer {
	name?: string;
	type?: number;
	data?: string;
}

interface DohResponse {
	Status?: number;
	Answer?: DohAnswer[];
}

/** DNS RR type numbers for the records we ask for. */
const RECORD_TYPE_NUMBERS: Record<(typeof RECORD_TYPES)[number], number> = {
	A: 1,
	AAAA: 28,
};

export interface ResolveOptions {
	fetchImpl?: typeof fetch | undefined;
}

/**
 * Resolve a hostname to its A and AAAA addresses.
 *
 * Returns an empty array when the name exists but has no address records, and
 * when it does not exist at all — the caller reports both as "nothing to
 * profile", which is the same answer from the user's side.
 */
export async function resolveHostname(
	hostname: string,
	options: ResolveOptions = {},
): Promise<string[]> {
	const doFetch = options.fetchImpl ?? fetch;

	const answers = await Promise.all(
		RECORD_TYPES.map(async (type) => {
			const url = new URL(DOH_URL);
			url.searchParams.set("name", hostname);
			url.searchParams.set("type", type);

			const response = await doFetch(url.toString(), {
				headers: { Accept: "application/dns-json" },
			});
			if (!response.ok) return [];

			const body = (await response.json().catch(() => null)) as DohResponse | null;
			return (body?.Answer ?? [])
				.filter((answer) => answer.type === RECORD_TYPE_NUMBERS[type])
				.map((answer) => answer.data)
				.filter((data): data is string => typeof data === "string");
		}),
	);

	return [...new Set(answers.flat())];
}

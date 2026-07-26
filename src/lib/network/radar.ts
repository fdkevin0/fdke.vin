export const RADAR_BASE_URL = "https://api.cloudflare.com/client/v4/radar";

/**
 * Radar's documented error codes, mapped to the status we surface. Radar
 * publishes no numeric rate limit or concurrency figure — `1015` is the only
 * signal there is — so these are passed through to the caller rather than
 * retried. Retrying a `1015` or a `2002` just spends the budget faster.
 *
 * See `docs/cloudflare-radar-api.md` §2 and §5.
 */
const ERROR_CODE_STATUS: Record<number, number> = {
	2000: 500,
	2001: 400,
	2002: 422,
	1015: 429,
	7003: 404,
};

export class RadarError extends Error {
	readonly status: number;
	readonly code: number | null;

	constructor(message: string, status: number, code: number | null = null) {
		super(message);
		this.name = "RadarError";
		this.status = status;
		this.code = code;
	}

	/** True when the failure is Radar refusing load rather than rejecting input. */
	get isThrottled(): boolean {
		return this.status === 429 || this.status === 422;
	}
}

/** Thrown when no Radar token is configured, so Radar-backed data is simply absent. */
export class RadarUnconfiguredError extends RadarError {
	constructor() {
		super("Radar is not configured", 503);
		this.name = "RadarUnconfiguredError";
	}
}

interface RadarEnvelope<T> {
	success: boolean;
	errors?: { code?: number; message?: string }[];
	result?: T;
}

export interface RadarOptions {
	token: string | undefined;
	/** Injected so callers are testable without a Workers runtime or a token. */
	fetchImpl?: typeof fetch | undefined;
}

/**
 * One GET against the Radar dataset API, unwrapped from the Cloudflare v4
 * envelope.
 *
 * `params` values that are `undefined` are dropped, so an optional filter such
 * as a visitor's country can be passed straight through without the caller
 * branching on whether the edge knew it.
 */
export async function radarGet<T>(
	path: string,
	params: Record<string, string | number | undefined>,
	options: RadarOptions,
): Promise<T> {
	if (!options.token) throw new RadarUnconfiguredError();

	const url = new URL(`${RADAR_BASE_URL}${path}`);
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined) url.searchParams.set(key, String(value));
	}

	const doFetch = options.fetchImpl ?? fetch;
	const response = await doFetch(url.toString(), {
		headers: {
			Authorization: `Bearer ${options.token}`,
			Accept: "application/json",
		},
	});

	const envelope = (await response.json().catch(() => null)) as RadarEnvelope<T> | null;
	const firstError = envelope?.errors?.[0];

	if (!response.ok || !envelope?.success) {
		const code = firstError?.code ?? null;
		const status = response.ok ? (code ? (ERROR_CODE_STATUS[code] ?? 502) : 502) : response.status;
		throw new RadarError(firstError?.message ?? `Radar request failed (${status})`, status, code);
	}

	if (envelope.result === undefined) {
		throw new RadarError("Radar returned an empty result", 502);
	}

	return envelope.result;
}

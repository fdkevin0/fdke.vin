/**
 * What the path segment on the lookup host names.
 *
 * The host answers about one address, so the segment is either an address
 * already or a hostname that has to be resolved into addresses first.
 */
export type LookupTarget = { kind: "ip"; ip: string } | { kind: "hostname"; hostname: string };

/**
 * Dotted-quad only. Deliberately not delegated to the URL parser: that parser
 * accepts and silently rewrites shorthand forms — `http://1.1/` normalizes to
 * `1.0.0.1` — which would turn a typo into a confident answer about the wrong
 * address.
 */
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** One DNS label: alphanumeric with interior hyphens, up to 63 characters. */
const HOSTNAME_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const MAX_HOSTNAME_LENGTH = 253;

export function parseIpv4(value: string): string | null {
	const match = IPV4.exec(value);
	if (!match) return null;

	const octets = match.slice(1, 5).map(Number);
	if (octets.some((octet) => octet > 255)) return null;
	// Reject `01.1.1.1` and friends, which some resolvers read as octal.
	if (match.slice(1, 5).some((part) => part.length > 1 && part.startsWith("0"))) return null;

	return octets.join(".");
}

/**
 * IPv6 validation is delegated to the URL parser's bracketed-literal form,
 * which implements the RFC 4291 grammar (including `::` elision and embedded
 * IPv4 tails) and hands back the canonical lowercase compressed spelling. A
 * hand-rolled regex for this gets the edge cases wrong.
 */
export function parseIpv6(value: string): string | null {
	if (!value.includes(":")) return null;

	try {
		const { hostname } = new URL(`http://[${value}]/`);
		return hostname.startsWith("[") ? hostname.slice(1, -1) : null;
	} catch {
		return null;
	}
}

export function parseIp(value: string): string | null {
	return parseIpv4(value) ?? parseIpv6(value);
}

export function ipVersion(ip: string): 4 | 6 {
	return ip.includes(":") ? 6 : 4;
}

/**
 * A hostname we are willing to resolve. Requires a dot so that a bare word —
 * a mistyped flag, say — fails here with a usage message rather than becoming
 * a DNS query for a single-label name.
 */
export function parseHostname(value: string): string | null {
	const hostname = value.toLowerCase().replace(/\.$/, "");
	if (hostname.length === 0 || hostname.length > MAX_HOSTNAME_LENGTH) return null;

	const labels = hostname.split(".");
	if (labels.length < 2) return null;
	if (!labels.every((label) => HOSTNAME_LABEL.test(label))) return null;
	// An all-numeric final label means this was meant to be an address and is
	// malformed, not a hostname that happens to look numeric.
	if (/^\d+$/.test(labels[labels.length - 1] ?? "")) return null;

	return hostname;
}

/** Parse one path segment, e.g. `1.1.1.1` or `github.com`. */
export function parseLookupTarget(segment: string): LookupTarget | null {
	const value = decodeURIComponent(segment).trim();
	if (!value) return null;

	const ip = parseIp(value);
	if (ip) return { kind: "ip", ip };

	const hostname = parseHostname(value);
	if (hostname) return { kind: "hostname", hostname };

	return null;
}

import type { Connection } from "@/lib/network/connection";
import type { IpProfile } from "@/lib/network/profile";

export type ResponseFormat = "text" | "json" | "html";

/**
 * Pick a representation from the request alone.
 *
 * Negotiation is driven by `Accept`, not by sniffing `User-Agent`: browsers
 * send `text/html`, `curl` sends `*​/*`, and anything scripted that wants JSON
 * can say so. `?format=` overrides, because a browser address bar cannot set
 * headers.
 */
export function negotiateFormat(url: URL, headers: Headers): ResponseFormat {
	const requested = url.searchParams.get("format")?.toLowerCase();
	if (requested === "json" || requested === "text" || requested === "html") return requested;

	const accept = headers.get("Accept") ?? "";
	if (accept.includes("text/html")) return "html";
	if (accept.includes("application/json")) return "json";

	return "text";
}

export function wantsDetail(url: URL): boolean {
	const value = url.searchParams.get("detail");
	return value !== null && value !== "0" && value !== "false";
}

/**
 * The bare-address form: one line, no label, no trailing whitespace beyond the
 * newline, so `IP=$(curl -s ip.fdke.vin)` yields exactly the address.
 */
export function renderConnectionLine(connection: Connection): string {
	return `${connection.ip}\n`;
}

export function renderConnectionTable(connection: Connection): string {
	const location = [connection.city, connection.region, connection.country]
		.filter(Boolean)
		.join(", ");

	return formatTable([
		["IP", connection.ip],
		["Version", connection.ipVersion ? `IPv${connection.ipVersion}` : null],
		["Location", location || null],
		["Timezone", connection.timezone],
		["ASN", formatAsn(connection.asn, connection.asOrganization)],
		["Colo", connection.colo],
		["Protocol", connection.httpProtocol],
		["TLS", connection.tlsVersion],
		["RTT", connection.clientTcpRttMs === null ? null : `${connection.clientTcpRttMs} ms`],
	]);
}

/** The compact lookup form: address, AS, country, on one line. */
export function renderProfileLine(profile: IpProfile): string {
	const parts = [
		profile.ip,
		profile.asn === null ? null : `AS${profile.asn}`,
		profile.asnName,
		profile.country,
	].filter((part): part is string => Boolean(part));

	return `${parts.join("  ")}\n`;
}

export function renderProfileTable(profile: IpProfile): string {
	const rows: [string, string | null][] = [
		["IP", profile.ip],
		["Version", `IPv${profile.ipVersion}`],
		["Location", formatCountry(profile.country, profile.countryName)],
		["ASN", formatAsn(profile.asn, profile.asnName)],
		["Org", profile.asnOrgName],
	];

	if (profile.detail) {
		rows.push(
			["Registry", profile.detail.registry],
			["Website", profile.detail.website],
			[
				"Est. users",
				profile.detail.estimatedUsers === null
					? null
					: profile.detail.estimatedUsers.toLocaleString("en-US"),
			],
			[
				"Related",
				profile.detail.relatedAsns.length === 0
					? null
					: profile.detail.relatedAsns.map((entry) => `AS${entry.asn}`).join(", "),
			],
		);
	}

	return formatTable(rows);
}

/**
 * A hostname answer leads with the resolution, because that is the part the
 * caller cannot get anywhere else in one command, then profiles each address.
 */
export function renderHostnameText(
	hostname: string,
	profiles: IpProfile[],
	detail: boolean,
): string {
	if (profiles.length === 0) return `${hostname} → no A or AAAA records\n`;

	const addresses = profiles.map((profile) => profile.ip);
	const indent = " ".repeat(hostname.length + 3);
	const header = addresses
		.map((address, index) => (index === 0 ? `${hostname} → ${address}` : `${indent}${address}`))
		.join("\n");

	const bodies = profiles
		.map((profile) => (detail ? renderProfileTable(profile) : renderProfileSummaryLine(profile)))
		.join("\n");

	return `${header}\n${bodies}`;
}

function renderProfileSummaryLine(profile: IpProfile): string {
	const parts = [
		profile.asn === null ? null : `AS${profile.asn}`,
		profile.asnName,
		profile.country,
	].filter((part): part is string => Boolean(part));

	return parts.length === 0 ? "  (no Radar data)\n" : `  ${parts.join("  ")}\n`;
}

export const USAGE = `ip.fdke.vin — what the internet sees

  curl ip.fdke.vin                 your address
  curl ip.fdke.vin/json            your connection, as JSON
  curl ip.fdke.vin?detail=1        your connection, in full
  curl ip.fdke.vin/1.1.1.1         look up an address
  curl ip.fdke.vin/github.com      resolve, then look up
  curl ip.fdke.vin/1.1.1.1?detail=1

Add ?format=json to any of the above.
`;

function formatAsn(asn: number | null, name: string | null): string | null {
	if (asn === null) return name;
	return name ? `AS${asn} ${name}` : `AS${asn}`;
}

function formatCountry(code: string | null, name: string | null): string | null {
	if (!code) return name;
	return name ? `${code} ${name}` : code;
}

/** Left-aligned label column, sized to the widest label present. */
function formatTable(rows: [string, string | null][]): string {
	const present = rows.filter((row): row is [string, string] => row[1] !== null && row[1] !== "");
	if (present.length === 0) return "";

	const width = Math.max(...present.map(([label]) => label.length));
	return `${present.map(([label, value]) => `${label.padEnd(width)}  ${value}`).join("\n")}\n`;
}

import { describe, expect, it } from "vitest";
import { buildConnection } from "@/lib/network/connection";
import type { IpProfile } from "@/lib/network/profile";
import {
	negotiateFormat,
	renderConnectionLine,
	renderConnectionTable,
	renderHostnameText,
	renderProfileLine,
	renderProfileTable,
	wantsDetail,
} from "@/lib/network/render";

const connection = buildConnection("203.0.113.45", {
	colo: "LHR",
	httpProtocol: "HTTP/3",
	tlsVersion: "TLSv1.3",
	clientTcpRtt: 12,
	asn: 786,
	asOrganization: "Jisc Services Limited",
	country: "GB",
	city: "Glasgow",
	region: "Scotland",
});

const profile: IpProfile = {
	ip: "1.1.1.1",
	ipVersion: 4,
	country: "AU",
	countryName: "Australia",
	asn: 13335,
	asnName: "CLOUDFLARENET",
	asnOrgName: "Cloudflare, Inc.",
	asnCountry: "US",
	detail: null,
};

describe("negotiateFormat", () => {
	const accept = (value: string) => new Headers({ Accept: value });

	it("defaults to text for curl, which sends */*", () => {
		expect(negotiateFormat(new URL("https://ip.fdke.vin/"), accept("*/*"))).toBe("text");
	});

	it("gives a browser html without sniffing User-Agent", () => {
		expect(
			negotiateFormat(
				new URL("https://ip.fdke.vin/"),
				accept("text/html,application/xhtml+xml,*/*;q=0.8"),
			),
		).toBe("html");
	});

	it("honours an explicit Accept of json", () => {
		expect(negotiateFormat(new URL("https://ip.fdke.vin/"), accept("application/json"))).toBe(
			"json",
		);
	});

	it("lets ?format override the header, since an address bar cannot set one", () => {
		expect(negotiateFormat(new URL("https://ip.fdke.vin/?format=json"), accept("text/html"))).toBe(
			"json",
		);
	});
});

describe("wantsDetail", () => {
	it("treats a bare flag as on and 0/false as off", () => {
		expect(wantsDetail(new URL("https://ip.fdke.vin/?detail"))).toBe(true);
		expect(wantsDetail(new URL("https://ip.fdke.vin/?detail=1"))).toBe(true);
		expect(wantsDetail(new URL("https://ip.fdke.vin/?detail=0"))).toBe(false);
		expect(wantsDetail(new URL("https://ip.fdke.vin/"))).toBe(false);
	});
});

describe("renderConnectionLine", () => {
	it("emits the address and nothing else", () => {
		// `IP=$(curl -s ip.fdke.vin)` has to yield exactly the address, so this
		// must stay a single trailing newline with no label and no padding.
		expect(renderConnectionLine(connection)).toBe("203.0.113.45\n");
	});
});

describe("renderConnectionTable", () => {
	it("aligns labels and joins the geo fields into one location", () => {
		expect(renderConnectionTable(connection)).toBe(
			[
				"IP        203.0.113.45",
				"Version   IPv4",
				"Location  Glasgow, Scotland, GB",
				"ASN       AS786 Jisc Services Limited",
				"Colo      LHR",
				"Protocol  HTTP/3",
				"TLS       TLSv1.3",
				"RTT       12 ms",
				"",
			].join("\n"),
		);
	});

	it("omits rows the edge did not supply rather than printing blanks", () => {
		// A missing field means the edge had nothing to say, which is different
		// from a field whose value is empty — so the row is absent, not blank.
		const sparse = buildConnection("203.0.113.45", { colo: "LHR" });
		expect(renderConnectionTable(sparse)).toBe(
			["IP       203.0.113.45", "Version  IPv4", "Colo     LHR", ""].join("\n"),
		);
	});

	it("does not report a Tor exit's T1 pseudo-country as a location", () => {
		const tor = buildConnection("203.0.113.45", { country: "T1", colo: "LHR" });
		expect(renderConnectionTable(tor)).not.toContain("T1");
	});
});

describe("renderProfileLine", () => {
	it("puts address, AS and country on one line", () => {
		expect(renderProfileLine(profile)).toBe("1.1.1.1  AS13335  CLOUDFLARENET  AU\n");
	});

	it("drops absent fields instead of leaving gaps", () => {
		expect(renderProfileLine({ ...profile, asn: null, asnName: null })).toBe("1.1.1.1  AU\n");
	});
});

describe("renderProfileTable", () => {
	it("adds the detail rows only when detail was fetched", () => {
		const detailed = renderProfileTable({
			...profile,
			detail: {
				registry: "APNIC",
				website: "cloudflare.com",
				estimatedUsers: 1_240_000,
				confidenceLevel: 5,
				relatedAsns: [{ asn: 209242, name: "CLOUDFLARE-SPECTRUM" }],
			},
		});

		expect(detailed).toContain("Registry    APNIC");
		expect(detailed).toContain("Est. users  1,240,000");
		expect(detailed).toContain("Related     AS209242");
		expect(renderProfileTable(profile)).not.toContain("Registry");
	});
});

describe("renderHostnameText", () => {
	it("leads with the resolution, then profiles each address", () => {
		const output = renderHostnameText(
			"github.com",
			[{ ...profile, ip: "140.82.121.4", asn: 36459, asnName: "GITHUB", country: "US" }],
			false,
		);

		expect(output).toBe("github.com → 140.82.121.4\n  AS36459  GITHUB  US\n");
	});

	it("indents continuation addresses under the first", () => {
		const output = renderHostnameText(
			"example.com",
			[
				{ ...profile, ip: "93.184.216.34" },
				{ ...profile, ip: "2606:2800::1" },
			],
			false,
		);

		expect(output.split("\n")[1]).toBe("              2606:2800::1");
	});

	it("says so plainly when a name has no address records", () => {
		expect(renderHostnameText("no-records.example", [], false)).toBe(
			"no-records.example → no A or AAAA records\n",
		);
	});
});

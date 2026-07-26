import { describe, expect, it } from "vitest";
import { handleLookupHostRequest, TOOL_PAGE_URL } from "@/lib/network/handler";

const CLIENT_IP = "203.0.113.45";

const RADAR_IP_RESULT = {
	success: true,
	result: {
		ip: {
			ip: "1.1.1.1",
			ipVersion: "IPv4",
			location: "AU",
			locationName: "Australia",
			asn: 13335,
			asnName: "CLOUDFLARENET",
			asnOrgName: "Cloudflare, Inc.",
			asnLocation: "US",
		},
	},
};

const RADAR_ASN_RESULT = {
	success: true,
	result: {
		asn: {
			asn: 13335,
			source: "APNIC",
			website: "cloudflare.com",
			estimatedUsers: { estimatedUsers: 1_240_000 },
			related: [{ asn: 209242, name: "CLOUDFLARE-SPECTRUM" }],
		},
	},
};

/** Records every outbound URL so tests can assert how much upstream a route costs. */
function trackedFetch(handler: (url: string) => Response): {
	fetchImpl: typeof fetch;
	urls: string[];
} {
	const urls: string[] = [];
	const fetchImpl = (async (input: RequestInfo | URL) => {
		const url = typeof input === "string" ? input : input.toString();
		urls.push(url);
		return handler(url);
	}) as typeof fetch;

	return { fetchImpl, urls };
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function radarFetch() {
	return trackedFetch((url) => {
		if (url.includes("/entities/asns/ip")) return jsonResponse(RADAR_ASN_RESULT);
		if (url.includes("/entities/ip")) return jsonResponse(RADAR_IP_RESULT);
		if (url.includes("1.1.1.1/dns-query")) {
			const type = new URL(url).searchParams.get("type");
			return jsonResponse({
				Status: 0,
				Answer:
					type === "A" ? [{ type: 1, data: "1.1.1.1" }] : [{ type: 28, data: "2606:4700::1111" }],
			});
		}
		return jsonResponse({ success: false, errors: [{ code: 7003, message: "Not found" }] }, 404);
	});
}

function get(path: string, headers: Record<string, string> = {}): Request {
	return new Request(`https://ip.fdke.vin${path}`, {
		headers: { "CF-Connecting-IP": CLIENT_IP, Accept: "*/*", ...headers },
	});
}

describe("the caller's own connection", () => {
	it("answers a bare curl with the address alone", async () => {
		const response = await handleLookupHostRequest(get("/"), { token: "t" });

		expect(response.status).toBe(200);
		expect(await response.text()).toBe(`${CLIENT_IP}\n`);
		expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
	});

	it("never caches a Connection, which describes one caller", async () => {
		const response = await handleLookupHostRequest(get("/"), { token: "t" });
		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});

	it("costs no upstream call, so it works with no Radar token", async () => {
		const { fetchImpl, urls } = radarFetch();
		const response = await handleLookupHostRequest(get("/"), { token: undefined, fetchImpl });

		expect(response.status).toBe(200);
		expect(await response.text()).toBe(`${CLIENT_IP}\n`);
		expect(urls).toEqual([]);
	});

	it("serves JSON at the reserved /json alias", async () => {
		const response = await handleLookupHostRequest(get("/json"), { token: "t" });

		expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
		expect(JSON.parse(await response.text())).toMatchObject({ ip: CLIENT_IP, ipVersion: 4 });
	});

	it("sends a browser to the tool page instead of serving it plain text", async () => {
		const response = await handleLookupHostRequest(get("/", { Accept: "text/html" }), {
			token: "t",
		});

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe(TOOL_PAGE_URL);
	});
});

describe("address lookup", () => {
	it("spends exactly one Radar call without ?detail", async () => {
		const { fetchImpl, urls } = radarFetch();
		const response = await handleLookupHostRequest(get("/1.1.1.1"), { token: "t", fetchImpl });

		expect(await response.text()).toBe("1.1.1.1  AS13335  CLOUDFLARENET  AU\n");
		expect(urls).toHaveLength(1);
		expect(urls[0]).toContain("/radar/entities/ip?ip=1.1.1.1");
	});

	it("spends a second call only when detail is asked for", async () => {
		const { fetchImpl, urls } = radarFetch();
		const response = await handleLookupHostRequest(get("/1.1.1.1?detail=1"), {
			token: "t",
			fetchImpl,
		});

		const body = await response.text();
		expect(body).toContain("Registry    APNIC");
		expect(body).toContain("Est. users  1,240,000");
		expect(urls).toHaveLength(2);
	});

	it("sends the token as a bearer credential", async () => {
		const requests: Request[] = [];
		const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
			requests.push(new Request(input.toString(), init));
			return jsonResponse(RADAR_IP_RESULT);
		}) as typeof fetch;

		await handleLookupHostRequest(get("/1.1.1.1"), { token: "secret", fetchImpl });
		expect(requests[0]?.headers.get("Authorization")).toBe("Bearer secret");
	});

	it("marks a profile cacheable for a day", async () => {
		const { fetchImpl } = radarFetch();
		const response = await handleLookupHostRequest(get("/1.1.1.1"), { token: "t", fetchImpl });
		expect(response.headers.get("Cache-Control")).toBe("public, max-age=86400");
	});
});

describe("hostname lookup", () => {
	it("resolves over DoH, then profiles each address", async () => {
		const { fetchImpl, urls } = radarFetch();
		const response = await handleLookupHostRequest(get("/one.one.one.one"), {
			token: "t",
			fetchImpl,
		});

		const body = await response.text();
		expect(body).toContain("one.one.one.one → 1.1.1.1");
		expect(body).toContain("AS13335  CLOUDFLARENET  AU");
		// A and AAAA are asked for together, then one profile call per address.
		expect(urls.filter((url) => url.includes("dns-query"))).toHaveLength(2);
	});

	it("reports a name with no address records without calling Radar", async () => {
		const { fetchImpl, urls } = trackedFetch(() => jsonResponse({ Status: 0, Answer: [] }));
		const response = await handleLookupHostRequest(get("/nothing.example"), {
			token: "t",
			fetchImpl,
		});

		expect(await response.text()).toBe("nothing.example → no A or AAAA records\n");
		expect(urls.every((url) => url.includes("dns-query"))).toBe(true);
	});
});

describe("failure modes", () => {
	it("explains that lookups need a token, and that the bare form does not", async () => {
		const response = await handleLookupHostRequest(get("/1.1.1.1"), { token: undefined });

		expect(response.status).toBe(503);
		expect(await response.text()).toContain("curl ip.fdke.vin` still works");
	});

	it("passes a Radar 429 through with Retry-After rather than retrying it", async () => {
		// Radar publishes no numeric rate limit, so spending the budget faster on
		// a retry is strictly worse than telling the caller to wait.
		const { fetchImpl, urls } = trackedFetch(() =>
			jsonResponse({ success: false, errors: [{ code: 1015, message: "Too many requests" }] }, 429),
		);
		const response = await handleLookupHostRequest(get("/1.1.1.1"), { token: "t", fetchImpl });

		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("60");
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(urls).toHaveLength(1);
	});

	it("maps a query-cost rejection to 422", async () => {
		const { fetchImpl } = trackedFetch(() =>
			jsonResponse(
				{ success: false, errors: [{ code: 2002, message: "Query is above max cost" }] },
				422,
			),
		);
		const response = await handleLookupHostRequest(get("/1.1.1.1"), { token: "t", fetchImpl });
		expect(response.status).toBe(422);
	});

	it("answers unparseable input with usage rather than a guess", async () => {
		const response = await handleLookupHostRequest(get("/not%20a%20host"), { token: "t" });

		expect(response.status).toBe(400);
		expect(await response.text()).toContain("curl ip.fdke.vin/1.1.1.1");
	});

	it("rejects a multi-segment path", async () => {
		const response = await handleLookupHostRequest(get("/1.1.1.1/extra"), { token: "t" });
		expect(response.status).toBe(400);
	});

	it("refuses writes", async () => {
		const request = new Request("https://ip.fdke.vin/", { method: "POST" });
		const response = await handleLookupHostRequest(request, { token: "t" });

		expect(response.status).toBe(405);
		expect(response.headers.get("Allow")).toBe("GET, HEAD");
	});

	it("keeps itself out of search indexes", async () => {
		const response = await handleLookupHostRequest(get("/robots.txt"), { token: "t" });
		expect(await response.text()).toBe("User-agent: *\nDisallow: /\n");
	});
});

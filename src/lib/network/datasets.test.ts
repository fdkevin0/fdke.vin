import { describe, expect, it } from "vitest";
import { fetchAdoption, fetchHealth, fetchRankings, fetchRouting } from "@/lib/network/datasets";

function stubFetch(handler: (url: string) => unknown): {
	fetchImpl: typeof fetch;
	urls: string[];
} {
	const urls: string[] = [];
	const fetchImpl = (async (input: RequestInfo | URL) => {
		const url = input.toString();
		urls.push(url);
		return new Response(JSON.stringify(handler(url)), {
			headers: { "Content-Type": "application/json" },
		});
	}) as typeof fetch;

	return { fetchImpl, urls };
}

const summary = (values: Record<string, string>) => ({
	success: true,
	result: { summary_0: values },
});

describe("fetchAdoption", () => {
	it("reads each metric for the country and for the world", async () => {
		const { fetchImpl, urls } = stubFetch((url) =>
			url.includes("ip_version")
				? summary({ IPv4: "58.0", IPv6: url.includes("location=GB") ? "42.0" : "38.4" })
				: summary({}),
		);

		const snapshot = await fetchAdoption("GB", { token: "t", fetchImpl });
		const ipv6 = snapshot.metrics.find((metric) => metric.key === "ipv6");

		expect(ipv6).toMatchObject({ local: 42, global: 38.4 });
		// Five metrics, each asked twice — once filtered, once not.
		expect(urls).toHaveLength(10);
	});

	it("asks only for the global figure when the edge gave no country", async () => {
		const { fetchImpl, urls } = stubFetch(() => summary({ IPv6: "38.4" }));

		const snapshot = await fetchAdoption(null, { token: "t", fetchImpl });

		expect(snapshot.metrics.find((metric) => metric.key === "ipv6")?.local).toBeNull();
		expect(urls).toHaveLength(5);
		expect(urls.every((url) => !url.includes("location="))).toBe(true);
	});

	it("accepts more than one spelling of a summary key", async () => {
		// Radar has renamed `summary_0` keys before. Pinning one spelling would
		// silently blank a row; accepting a few keeps it readable.
		const { fetchImpl } = stubFetch((url) =>
			url.includes("tls_version") ? summary({ TLSv1_3: "94.2" }) : summary({}),
		);

		const snapshot = await fetchAdoption(null, { token: "t", fetchImpl });
		expect(snapshot.metrics.find((metric) => metric.key === "tls13")?.global).toBe(94.2);
	});

	it("drops one failing metric rather than failing the group", async () => {
		const { fetchImpl } = stubFetch((url) => {
			if (url.includes("http_version")) return { success: false, errors: [{ code: 2000 }] };
			return summary({ IPv6: "38.4" });
		});

		const snapshot = await fetchAdoption(null, { token: "t", fetchImpl });

		expect(snapshot.metrics.find((metric) => metric.key === "http3")?.global).toBeNull();
		expect(snapshot.metrics.find((metric) => metric.key === "ipv6")?.global).toBe(38.4);
	});
});

describe("fetchHealth", () => {
	it("keeps verified outages and unconfirmed anomalies in separate lists", async () => {
		// Radar's glossary draws this line; merging them would assert that an
		// algorithmic traffic drop had been corroborated when it has not.
		const { fetchImpl } = stubFetch((url) =>
			url.includes("/traffic_anomalies")
				? {
						success: true,
						result: {
							trafficAnomalies: [
								{ type: "AS", asnDetails: { asn: 9829, name: "BSNL" }, startDate: "2026-07-24" },
							],
						},
					}
				: {
						success: true,
						result: {
							annotations: [
								{
									outage: { outageCause: "CABLE_CUT", outageType: "NATIONWIDE" },
									locationsDetails: [{ name: "Syria" }],
									startDate: "2026-07-20",
								},
							],
						},
					},
		);

		const snapshot = await fetchHealth({ token: "t", fetchImpl });

		expect(snapshot.outages).toHaveLength(1);
		expect(snapshot.outages[0]).toMatchObject({
			verified: true,
			cause: "CABLE_CUT",
			locations: ["Syria"],
		});
		expect(snapshot.anomalies[0]).toMatchObject({ verified: false, asns: ["AS9829 BSNL"] });
	});

	it("returns empty lists when Radar is unreachable rather than throwing", async () => {
		const { fetchImpl } = stubFetch(() => ({ success: false, errors: [{ code: 2000 }] }));
		await expect(fetchHealth({ token: "t", fetchImpl })).resolves.toEqual({
			outages: [],
			anomalies: [],
		});
	});
});

describe("fetchRouting", () => {
	it("labels hijacks and leaks distinctly and words the confidence score", async () => {
		// Radar scores confidence 0–100. Reporting the raw number would imply a
		// precision the dataset does not claim, so it is bucketed.
		const { fetchImpl } = stubFetch((url) =>
			url.includes("/hijacks/")
				? {
						success: true,
						result: {
							events: [
								{
									hijacker_asn: 1234,
									victim_asns: [5678],
									prefixes: ["195.0.113.0/24"],
									confidence_score: 90,
									starttime: "2026-07-24",
								},
							],
						},
					}
				: {
						success: true,
						result: {
							events: [
								{ leaker_asn: 4321, origin_asn: 8765, leaked_prefixes: [{ prefix: "10.0.0.0/8" }] },
							],
						},
					},
		);

		const snapshot = await fetchRouting({ token: "t", fetchImpl });

		expect(snapshot.events).toHaveLength(2);
		expect(snapshot.events[0]).toMatchObject({
			kind: "hijack",
			prefix: "195.0.113.0/24",
			confidence: "high",
			detectedOrigin: "AS1234",
			expectedOrigin: "AS5678",
		});
		expect(snapshot.events[1]).toMatchObject({ kind: "leak", confidence: null });
	});

	it("still reports hijacks when the leak feed fails", async () => {
		const { fetchImpl } = stubFetch((url) =>
			url.includes("/leaks/")
				? { success: false, errors: [{ code: 2000 }] }
				: { success: true, result: { events: [{ hijacker_asn: 1234 }] } },
		);

		const snapshot = await fetchRouting({ token: "t", fetchImpl });
		expect(snapshot.events).toHaveLength(1);
	});
});

describe("fetchRankings", () => {
	it("asks for popular domains in the reader's country but keeps trending global", async () => {
		const { fetchImpl, urls } = stubFetch((url) =>
			url.includes("/ranking/top")
				? { success: true, result: { top_0: [{ rank: 1, domain: "google.com" }] } }
				: { success: true, result: { summary_0: { TCP: "68.0", UDP: "27.0", ICMP: "5.0" } } },
		);

		const snapshot = await fetchRankings("GB", { token: "t", fetchImpl });
		const rankingCalls = urls.filter((url) => url.includes("/ranking/top"));

		expect(snapshot.popular[0]).toEqual({ rank: 1, domain: "google.com" });
		expect(rankingCalls.filter((url) => url.includes("location=GB"))).toHaveLength(1);
		expect(rankingCalls.filter((url) => url.includes("TRENDING_RISE"))).toHaveLength(1);
	});

	it("orders attack shares largest first", async () => {
		const { fetchImpl } = stubFetch((url) =>
			url.includes("/attacks/")
				? { success: true, result: { summary_0: { ICMP: "5.0", TCP: "68.0", UDP: "27.0" } } }
				: { success: true, result: { top_0: [] } },
		);

		const snapshot = await fetchRankings(null, { token: "t", fetchImpl });
		expect(snapshot.ddosLayer3.map((share) => share.label)).toEqual(["TCP", "UDP", "ICMP"]);
	});
});

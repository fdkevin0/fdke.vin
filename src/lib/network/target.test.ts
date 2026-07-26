import { describe, expect, it } from "vitest";
import { parseHostname, parseIp, parseLookupTarget } from "@/lib/network/target";

describe("parseIp", () => {
	it("accepts dotted-quad IPv4", () => {
		expect(parseIp("1.1.1.1")).toBe("1.1.1.1");
		expect(parseIp("255.255.255.255")).toBe("255.255.255.255");
	});

	it("rejects out-of-range octets", () => {
		expect(parseIp("256.1.1.1")).toBeNull();
	});

	it("rejects shorthand IPv4 rather than expanding it", () => {
		// `http://1.1/` normalizes to 1.0.0.1 in a URL parser. Answering
		// confidently about a different address than the one typed is worse
		// than refusing, so shorthand is not accepted.
		expect(parseIp("1.1")).toBeNull();
		expect(parseIp("1.1.1")).toBeNull();
	});

	it("rejects zero-padded octets, which some resolvers read as octal", () => {
		expect(parseIp("01.1.1.1")).toBeNull();
	});

	it("canonicalizes IPv6 to its compressed lowercase form", () => {
		expect(parseIp("2606:4700:4700:0:0:0:0:1111")).toBe("2606:4700:4700::1111");
		expect(parseIp("2606:4700::1111")).toBe("2606:4700::1111");
		expect(parseIp("::1")).toBe("::1");
	});

	it("accepts an IPv6 address with an embedded IPv4 tail", () => {
		expect(parseIp("::ffff:1.1.1.1")).not.toBeNull();
	});

	it("rejects malformed IPv6", () => {
		expect(parseIp("2606:4700::1111::2")).toBeNull();
		expect(parseIp("gggg::1")).toBeNull();
	});
});

describe("parseHostname", () => {
	it("lowercases and strips a trailing root dot", () => {
		expect(parseHostname("GitHub.COM.")).toBe("github.com");
	});

	it("requires more than one label", () => {
		// A bare word is far more likely to be a mistyped flag than a real
		// single-label name, and the usage message is a better answer than an
		// NXDOMAIN.
		expect(parseHostname("localhost")).toBeNull();
	});

	it("rejects an all-numeric final label as a malformed address", () => {
		expect(parseHostname("1.2.3.999")).toBeNull();
	});

	it("rejects labels with invalid characters or edge hyphens", () => {
		expect(parseHostname("exa_mple.com")).toBeNull();
		expect(parseHostname("-example.com")).toBeNull();
		expect(parseHostname("example-.com")).toBeNull();
	});
});

describe("parseLookupTarget", () => {
	it("prefers an address reading over a hostname reading", () => {
		expect(parseLookupTarget("1.1.1.1")).toEqual({ kind: "ip", ip: "1.1.1.1" });
	});

	it("reads a name as a hostname", () => {
		expect(parseLookupTarget("github.com")).toEqual({ kind: "hostname", hostname: "github.com" });
	});

	it("decodes a percent-encoded IPv6 segment", () => {
		expect(parseLookupTarget("2606%3A4700%3A%3A1111")).toEqual({
			kind: "ip",
			ip: "2606:4700::1111",
		});
	});

	it("returns null for input that is neither", () => {
		expect(parseLookupTarget("not a host")).toBeNull();
		expect(parseLookupTarget("")).toBeNull();
	});
});

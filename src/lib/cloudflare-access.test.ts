import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parseAudienceList, verifyCloudflareAccessToken } from "@/lib/cloudflare-access";

const TEAM_DOMAIN = "https://test-team.cloudflareaccess.com";
const AUD = "aud-primary";
const OTHER_AUD = "aud-secondary";

let privateKey: CryptoKey;
let jwksBody: string;
const fetchCalls: string[] = [];

/** Signs a token the way Cloudflare Access would, minus the bits under test. */
async function sign(
	claims: Record<string, unknown>,
	overrides: { aud?: string; iss?: string } = {},
) {
	return new SignJWT({ type: "app", ...claims })
		.setProtectedHeader({ alg: "RS256" })
		.setIssuer(overrides.iss ?? TEAM_DOMAIN)
		.setAudience(overrides.aud ?? AUD)
		.setIssuedAt()
		.setExpirationTime("1h")
		.sign(privateKey);
}

const validClaims = {
	email: "owner@example.com",
	sub: "sub-123",
	uid: "uid-123",
	common_name: "owner",
	country: "GB",
};

beforeAll(async () => {
	const keyPair = await generateKeyPair("RS256", { extractable: true });
	privateKey = keyPair.privateKey;
	jwksBody = JSON.stringify({
		keys: [{ ...(await exportJWK(keyPair.publicKey)), alg: "RS256", use: "sig" }],
	});

	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: URL | RequestInfo) => {
			fetchCalls.push(String(input));
			return new Response(jwksBody, { headers: { "Content-Type": "application/json" } });
		}),
	);
});

afterAll(() => {
	vi.unstubAllGlobals();
});

describe("parseAudienceList", () => {
	it("splits the comma-separated form and trims blanks", () => {
		expect(parseAudienceList("a, b ,, c")).toEqual(["a", "b", "c"]);
		expect(parseAudienceList(["a", "b"])).toEqual(["a", "b"]);
	});
});

describe("verifyCloudflareAccessToken", () => {
	it("accepts a well-formed token and maps it to a user", async () => {
		const verified = await verifyCloudflareAccessToken({
			token: await sign(validClaims),
			teamDomain: TEAM_DOMAIN,
			policyAud: `${AUD},${OTHER_AUD}`,
		});

		expect(verified.user).toEqual({
			email: "owner@example.com",
			name: "owner",
			uid: "uid-123",
			common_name: "owner",
		});
		expect(verified.claims.country).toBe("GB");
	});

	it("accepts any audience in the configured list", async () => {
		const verified = await verifyCloudflareAccessToken({
			token: await sign(validClaims, { aud: OTHER_AUD }),
			teamDomain: TEAM_DOMAIN,
			policyAud: [AUD, OTHER_AUD],
		});

		expect(verified.user.email).toBe("owner@example.com");
	});

	it("rejects an audience outside the configured list", async () => {
		await expect(
			verifyCloudflareAccessToken({
				token: await sign(validClaims, { aud: "aud-elsewhere" }),
				teamDomain: TEAM_DOMAIN,
				policyAud: AUD,
			}),
		).rejects.toThrow();
	});

	it("rejects a token issued by another team", async () => {
		await expect(
			verifyCloudflareAccessToken({
				token: await sign(validClaims, { iss: "https://other-team.cloudflareaccess.com" }),
				teamDomain: TEAM_DOMAIN,
				policyAud: AUD,
			}),
		).rejects.toThrow();
	});

	it("rejects an expired token", async () => {
		const token = await new SignJWT({ type: "app", ...validClaims })
			.setProtectedHeader({ alg: "RS256" })
			.setIssuer(TEAM_DOMAIN)
			.setAudience(AUD)
			.setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
			.setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
			.sign(privateKey);

		await expect(
			verifyCloudflareAccessToken({ token, teamDomain: TEAM_DOMAIN, policyAud: AUD }),
		).rejects.toThrow();
	});

	it("rejects a service token, which carries no email to own anything by", async () => {
		const { email: _email, ...withoutEmail } = validClaims;
		await expect(
			verifyCloudflareAccessToken({
				token: await sign({ ...withoutEmail, common_name: "service-token" }),
				teamDomain: TEAM_DOMAIN,
				policyAud: AUD,
			}),
		).rejects.toThrow();
	});

	it("rejects an org token, which authorizes the login session and not this app", async () => {
		await expect(
			verifyCloudflareAccessToken({
				token: await sign({ ...validClaims, type: "org" }),
				teamDomain: TEAM_DOMAIN,
				policyAud: AUD,
			}),
		).rejects.toThrow(/token type/);
	});

	it("fetches the key set once per team domain, not once per request", async () => {
		const teamDomain = "https://cache-probe.cloudflareaccess.com";
		const before = fetchCalls.length;

		for (let i = 0; i < 5; i++) {
			await verifyCloudflareAccessToken({
				token: await sign(validClaims, { iss: teamDomain }),
				teamDomain,
				policyAud: AUD,
			});
		}

		const fetched = fetchCalls.slice(before).filter((url) => url.includes("cache-probe"));
		expect(fetched).toEqual([`${teamDomain}/cdn-cgi/access/certs`]);
	});
});

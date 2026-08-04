import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";

export interface CloudflareAccessUser {
	email: string;
	name: string | undefined;
	uid: string | undefined;
	common_name: string | undefined;
}

/**
 * The Access claims this app reads, kept loose so the debug view at
 * `/tools/access` can still show everything Cloudflare sent.
 *
 * Parsed rather than cast: a service-token JWT carries `common_name` and no
 * `email`, and a bare `as string` let that `undefined` travel all the way into
 * a D1 `bind()` before anything noticed.
 */
const accessClaimsSchema = z.looseObject({
	email: z.email(),
	sub: z.string().min(1),
	exp: z.number(),
	iat: z.number(),
	type: z.string().optional(),
	name: z.string().optional(),
	common_name: z.string().optional(),
	uid: z.string().optional(),
	country: z.string().optional(),
});

export type CloudflareAccessClaims = z.infer<typeof accessClaimsSchema>;

export interface VerifiedAccessToken {
	user: CloudflareAccessUser;
	claims: CloudflareAccessClaims;
}

export function parseAudienceList(value: string | string[]): string[] {
	return typeof value === "string"
		? value
				.split(",")
				.map((entry) => entry.trim())
				.filter(Boolean)
		: value;
}

export function getLocalMockUser(): CloudflareAccessUser {
	return {
		email: "local-dev@example.com",
		name: "Local Developer",
		uid: "local-dev-uid",
		common_name: "local-dev",
	};
}

/**
 * jose caches the fetched key set inside the object `createRemoteJWKSet`
 * returns, so building one per request meant a subrequest to the Access certs
 * endpoint on every authenticated hit. A Worker isolate serves many requests,
 * so hoisting the set here collapses that to roughly one fetch per isolate.
 */
const jwksByTeamDomain = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
	let jwks = jwksByTeamDomain.get(teamDomain);
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`), {
			cacheMaxAge: 6 * 60 * 60 * 1000,
			cooldownDuration: 30_000,
			// Without a timeout a stalled certs endpoint hangs every protected request.
			timeoutDuration: 5_000,
		});
		jwksByTeamDomain.set(teamDomain, jwks);
	}

	return jwks;
}

export async function verifyCloudflareAccessToken(options: {
	token: string;
	teamDomain: string;
	policyAud: string | string[];
}): Promise<VerifiedAccessToken> {
	const { token, teamDomain, policyAud } = options;
	const { payload } = await jwtVerify(token, getJwks(teamDomain), {
		issuer: teamDomain,
		audience: parseAudienceList(policyAud),
		requiredClaims: ["email", "sub", "exp"],
		clockTolerance: 5,
	});

	const claims = accessClaimsSchema.parse(payload);

	// `type` is Cloudflare's own claim, so jose cannot check it for us. Access
	// issues `app` tokens for an application and `org` tokens for the login
	// session itself; only the former authorizes a request here. A missing
	// claim is an older token that predates it, which stays acceptable.
	if (claims.type && claims.type !== "app") {
		throw new Error(`Unexpected Cloudflare Access token type: ${claims.type}`);
	}

	return {
		claims,
		user: {
			email: claims.email,
			name: claims.name ?? claims.common_name,
			uid: claims.uid,
			common_name: claims.common_name,
		},
	};
}

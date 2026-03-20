import { createRemoteJWKSet, jwtVerify } from "jose";

export interface CloudflareAccessUser {
	email: string;
	name: string | undefined;
	uid: string | undefined;
	common_name: string | undefined;
}

export function parseAudienceList(value: string | string[]): string[] {
	return typeof value === "string"
		? value
				.split(",")
				.map((entry) => entry.trim())
				.filter(Boolean)
		: value;
}

export async function verifyCloudflareAccessToken(options: {
	token: string;
	teamDomain: string;
	policyAud: string | string[];
}): Promise<CloudflareAccessUser> {
	const { token, teamDomain, policyAud } = options;
	const JWKS = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
	const { payload } = await jwtVerify(token, JWKS, {
		issuer: teamDomain,
		audience: parseAudienceList(policyAud),
	});

	return {
		email: payload.email as string,
		name: (payload.name || payload.common_name) as string | undefined,
		uid: payload.uid as string | undefined,
		common_name: payload.common_name as string | undefined,
	};
}

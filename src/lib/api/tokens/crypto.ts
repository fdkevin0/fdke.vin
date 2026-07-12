import { base64Url, sha256Hex } from "@/lib/crypto";

const TOKEN_PREFIX = "fdv_";

export interface GeneratedApiToken {
	id: string;
	secret: string;
	prefix: string;
	hash: string;
	createdAt: string;
}

export async function generateApiToken(): Promise<GeneratedApiToken> {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);

	const secret = `${TOKEN_PREFIX}${base64Url(bytes)}`;
	return {
		id: crypto.randomUUID(),
		secret,
		prefix: secret.slice(0, 16),
		hash: await sha256Hex(secret),
		createdAt: new Date().toISOString(),
	};
}

export { sha256Hex as sha256 } from "@/lib/crypto";

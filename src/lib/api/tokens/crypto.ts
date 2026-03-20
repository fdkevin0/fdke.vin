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

	const secret = `${TOKEN_PREFIX}${toBase64Url(bytes)}`;
	return {
		id: crypto.randomUUID(),
		secret,
		prefix: secret.slice(0, 16),
		hash: await sha256(secret),
		createdAt: new Date().toISOString(),
	};
}

export async function sha256(value: string): Promise<string> {
	const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

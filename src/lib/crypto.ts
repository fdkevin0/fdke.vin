import { Buffer } from "node:buffer";
import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";

async function sha256(value: string): Promise<ArrayBuffer> {
	return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

/** Hash a UTF-8 string with the Workers-native Web Crypto implementation. */
export async function sha256Hex(value: string): Promise<string> {
	const digest = await sha256(value);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Compare secrets without leaking their contents or lengths through timing. */
export async function timingSafeEqual(left: string, right: string): Promise<boolean> {
	const [leftDigest, rightDigest] = await Promise.all([sha256(left), sha256(right)]);
	return nodeTimingSafeEqual(new Uint8Array(leftDigest), new Uint8Array(rightDigest));
}

/** Encode bytes using RFC 4648's URL-safe, unpadded Base64 alphabet. */
export function base64Url(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("base64url");
}

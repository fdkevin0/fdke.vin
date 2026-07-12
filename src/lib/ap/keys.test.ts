import { exportJwk, generateCryptoKeyPair } from "@fedify/fedify/sig";
import { describe, expect, it } from "vitest";
import { loadActorKeyPair } from "@/lib/ap/keys";
import type { ApEnv } from "@/lib/ap/runtime";

/** Minimal env carrying just the secret `loadActorKeyPair` reads. */
function envWith(secret: string | undefined): ApEnv {
	return { AP_RSA_PRIVATE_KEY: secret } as unknown as ApEnv;
}

async function privateJwkString(): Promise<string> {
	const { privateKey } = await generateCryptoKeyPair("RSASSA-PKCS1-v1_5");
	return JSON.stringify(await exportJwk(privateKey));
}

describe("loadActorKeyPair", () => {
	it("imports the private key and derives a matching public key", async () => {
		const secret = await privateJwkString();
		const { privateKey, publicKey } = await loadActorKeyPair(envWith(secret));
		expect(privateKey.type).toBe("private");
		expect(publicKey.type).toBe("public");

		// The derived public key verifies what the private key signs — i.e. they
		// are a real pair, satisfying "the public key matches the private key".
		const data = new TextEncoder().encode("federation");
		const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, data);
		const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, sig, data);
		expect(ok).toBe(true);
	});

	it("throws when the secret is missing", async () => {
		await expect(loadActorKeyPair(envWith(undefined))).rejects.toThrow(/not configured/);
	});

	it("throws on a non-JSON secret", async () => {
		await expect(loadActorKeyPair(envWith("not-json"))).rejects.toThrow(/valid JSON/);
	});
});

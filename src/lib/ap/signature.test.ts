import { generateCryptoKeyPair } from "@fedify/fedify/sig";
import { CryptographicKey } from "@fedify/fedify/vocab";
import { beforeAll, describe, expect, it } from "vitest";
import { signRequest, verifySignature } from "@/lib/ap/signature";

const ACTOR = "https://remote.example/actor";
const KEY_ID = new URL(`${ACTOR}#main-key`);

let privateKey: CryptoKey;
let keyDoc: unknown;

beforeAll(async () => {
	const pair = await generateCryptoKeyPair("RSASSA-PKCS1-v1_5");
	privateKey = pair.privateKey;
	keyDoc = await new CryptographicKey({
		id: KEY_ID,
		owner: new URL(ACTOR),
		publicKey: pair.publicKey,
	}).toJsonLd();
});

/** A document loader that serves our generated key at its keyId (no network). */
// biome-ignore lint/suspicious/noExplicitAny: Fedify's loader result shape.
const documentLoader = async (url: string): Promise<any> => {
	if (url === KEY_ID.href) {
		return { contextUrl: null, documentUrl: url, document: keyDoc };
	}
	throw new Error(`unexpected fetch: ${url}`);
};

function inboxRequest(body: string): Request {
	return new Request("https://fdke.vin/inbox", {
		method: "POST",
		headers: { "Content-Type": "application/activity+json" },
		body,
	});
}

describe("signRequest + verifySignature round-trip", () => {
	it("a signed request verifies against its published key", async () => {
		const signed = await signRequest(inboxRequest('{"type":"Follow"}'), {
			privateKey,
			keyId: KEY_ID,
		});
		expect(signed.headers.get("signature")).toBeTruthy();

		const key = await verifySignature(signed, { documentLoader });
		expect(key?.id?.href).toBe(KEY_ID.href);
	});

	it("rejects a request whose body was tampered with after signing", async () => {
		const signed = await signRequest(inboxRequest('{"type":"Follow"}'), {
			privateKey,
			keyId: KEY_ID,
		});
		// Replay the signature headers over a different body — the digest no longer
		// matches, so verification must fail.
		const forged = new Request("https://fdke.vin/inbox", {
			method: "POST",
			headers: signed.headers,
			body: '{"type":"Follow","injected":true}',
		});
		const key = await verifySignature(forged, { documentLoader });
		expect(key).toBeNull();
	});

	it("rejects an unsigned request", async () => {
		const key = await verifySignature(inboxRequest('{"type":"Follow"}'), { documentLoader });
		expect(key).toBeNull();
	});
});

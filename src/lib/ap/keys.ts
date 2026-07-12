import { importJwk } from "@fedify/fedify/sig";
import type { ApEnv } from "@/lib/ap/runtime";

/**
 * Load the actor's RSA signing keypair from the Cloudflare secret.
 *
 * The private key is stored as a single JWK JSON secret (`AP_RSA_PRIVATE_KEY`);
 * the public key is derived from it by dropping the private components, so only
 * one secret has to be managed. Both are imported as WebCrypto `CryptoKey`s for
 * Fedify's `signRequest` (private) and the actor document's `publicKey` (public,
 * exported as SPKI PEM). Generate the secret with `scripts/ap/generate-keypair.mjs`.
 */

export interface ApKeyPair {
	privateKey: CryptoKey;
	publicKey: CryptoKey;
}

/** RSA JWK private-only members stripped to derive the public JWK. */
const PRIVATE_JWK_MEMBERS = ["d", "p", "q", "dp", "dq", "qi"] as const;

// Cache the imported pair per distinct secret value (in prod there is exactly
// one), so key import — a few ms of WebCrypto — runs once per isolate, not per
// request. Keyed by the raw secret rather than a lone flag so a rotated secret
// re-imports rather than serving the stale pair.
const keyPairCache = new Map<string, Promise<ApKeyPair>>();

/** Load (and cache per isolate) the actor's RSA keypair from the secret. */
export function loadActorKeyPair(env: ApEnv): Promise<ApKeyPair> {
	const raw = env.AP_RSA_PRIVATE_KEY;
	if (!raw) {
		return Promise.reject(new Error("AP_RSA_PRIVATE_KEY secret is not configured"));
	}
	const cached = keyPairCache.get(raw);
	if (cached) return cached;

	const promise = importKeyPair(raw).catch((error) => {
		// Don't cache a failed load — a later request (e.g. after fixing the
		// secret) should retry rather than see the same rejection forever.
		keyPairCache.delete(raw);
		throw error;
	});
	keyPairCache.set(raw, promise);
	return promise;
}

async function importKeyPair(raw: string): Promise<ApKeyPair> {
	let jwk: JsonWebKey;
	try {
		jwk = JSON.parse(raw) as JsonWebKey;
	} catch {
		throw new Error("AP_RSA_PRIVATE_KEY is not valid JSON (expected an RSA JWK)");
	}

	const privateKey = await importJwk(jwk, "private");
	const publicKey = await importJwk(toPublicJwk(jwk), "public");
	return { privateKey, publicKey };
}

/** Strip the private-only RSA members, leaving a public JWK (`kty`, `n`, `e`). */
function toPublicJwk(jwk: JsonWebKey): JsonWebKey {
	const pub: JsonWebKey = { ...jwk };
	for (const member of PRIVATE_JWK_MEMBERS) {
		delete pub[member as keyof JsonWebKey];
	}
	pub.key_ops = ["verify"];
	return pub;
}

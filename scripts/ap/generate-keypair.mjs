#!/usr/bin/env node
// Generate the ActivityPub actor's RSA signing keypair and print the private key
// as a JWK JSON string, ready to store as the `AP_RSA_PRIVATE_KEY` secret.
//
//   node scripts/ap/generate-keypair.mjs | npx wrangler secret put AP_RSA_PRIVATE_KEY
//
// The public key is derived from the private JWK at runtime (src/lib/ap/keys.ts)
// and published in the actor document, so only this one secret is stored.
//
// RSASSA-PKCS1-v1_5 / SHA-256 / 2048-bit is what the Fediverse (Mastodon et al.)
// expects for HTTP Signatures.

const keyPair = await crypto.subtle.generateKey(
	{
		name: "RSASSA-PKCS1-v1_5",
		modulusLength: 2048,
		publicExponent: new Uint8Array([1, 0, 1]),
		hash: "SHA-256",
	},
	true,
	["sign", "verify"],
);

const jwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
process.stdout.write(JSON.stringify(jwk));

import {
	signRequest as fedifySignRequest,
	type VerifyRequestOptions,
	verifyRequest,
} from "@fedify/fedify/sig";
import type { CryptographicKey } from "@fedify/fedify/vocab";

/**
 * HTTP Signatures for the ActivityPub inbox/delivery: verifying inbound requests
 * and signing outbound ones. Thin wrappers over Fedify's `sig` module (the
 * draft-cavage-12 scheme the Fediverse uses; see ADR-0002) so the rest of the
 * codebase depends on one small seam and both directions are unit-testable.
 */

export interface SignRequestOptions {
	/** The actor's RSA private key. */
	privateKey: CryptoKey;
	/** The `keyId` remote verifiers dereference — `${actor}#main-key`. */
	keyId: URL;
}

/**
 * Sign an outbound request with the actor's key. Ensures a `Date` and `Host`
 * header are present (both are covered by the signature) before delegating to
 * Fedify, so callers can hand in a plain `Request`.
 */
export async function signRequest(request: Request, options: SignRequestOptions): Promise<Request> {
	const prepared = withSignatureHeaders(request);
	return fedifySignRequest(prepared, options.privateKey, options.keyId);
}

/**
 * Verify a request's HTTP Signature, returning the sender's public key when
 * valid and `null` when the signature is missing, forged, or its key can't be
 * fetched. By default Fedify dereferences the sender's `keyId` over HTTP.
 */
export async function verifySignature(
	request: Request,
	options?: VerifyRequestOptions,
): Promise<CryptographicKey | null> {
	return verifyRequest(request, options);
}

/** Clone the request with `Date`/`Host` set if absent (signature-covered). */
function withSignatureHeaders(request: Request): Request {
	const headers = new Headers(request.headers);
	if (!headers.has("date")) headers.set("Date", new Date().toUTCString());
	if (!headers.has("host")) headers.set("Host", new URL(request.url).host);
	return new Request(request, { headers });
}

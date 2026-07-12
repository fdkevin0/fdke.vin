import { siteConfig } from "@/site.config";

/**
 * Fixed identity of the site's single ActivityPub {@link Actor} and the canonical
 * URLs of its collections. Every AP surface (WebFinger, actor doc, inbox, outbox,
 * delivery signing) derives its URIs from here so ids stay consistent once
 * published. See CONTEXT.md "Federation".
 */

/** The local part of the actor's `acct:` handle — `@fdkevin@fdke.vin`. */
export const AP_USERNAME = "fdkevin";

/** The apex domain the actor is discovered on (WebFinger host, `acct:` domain). */
export const AP_DOMAIN = new URL(siteConfig.url).host;

/** Canonical site origin the AP ids are built from, e.g. `https://fdke.vin`. */
export const AP_ORIGIN = new URL(siteConfig.url).origin;

/** The Cloudflare Queue that fans out signed Create/Update deliveries. */
export const AP_DELIVERY_QUEUE_NAME = "ap-delivery-queue";

function withBase(path: string, origin: URL | string = AP_ORIGIN): URL {
	return new URL(path, origin instanceof URL ? origin : new URL(origin));
}

/** The actor document URI (`${origin}/actor`) — the actor's canonical id. */
export function actorUri(origin: URL | string = AP_ORIGIN): URL {
	return withBase("/actor", origin);
}

/** The actor's inbox collection URI (`${origin}/inbox`). */
export function inboxUri(origin: URL | string = AP_ORIGIN): URL {
	return withBase("/inbox", origin);
}

/** The actor's outbox collection URI (`${origin}/outbox`). */
export function outboxUri(origin: URL | string = AP_ORIGIN): URL {
	return withBase("/outbox", origin);
}

/** The actor's followers collection URI (`${origin}/followers`). */
export function followersUri(origin: URL | string = AP_ORIGIN): URL {
	return withBase("/followers", origin);
}

/** The actor's following collection URI (`${origin}/following`). */
export function followingUri(origin: URL | string = AP_ORIGIN): URL {
	return withBase("/following", origin);
}

/**
 * The fragment id of the actor's signing key (`${actor}#main-key`) — the `keyId`
 * that outbound HTTP Signatures advertise and remote servers dereference back to
 * the actor's `publicKey`.
 */
export function keyId(origin: URL | string = AP_ORIGIN): URL {
	return new URL("#main-key", actorUri(origin));
}

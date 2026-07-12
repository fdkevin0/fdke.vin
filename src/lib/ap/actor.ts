import { Application, CryptographicKey, Endpoints } from "@fedify/fedify/vocab";
import {
	AP_DOMAIN,
	AP_USERNAME,
	actorUri,
	followersUri,
	followingUri,
	inboxUri,
	keyId,
	outboxUri,
} from "@/lib/ap/config";
import { siteConfig } from "@/site.config";

/**
 * Build the site's single ActivityPub {@link Actor}: its AS2 actor document and
 * the WebFinger JRD that makes it discoverable.
 *
 * Both are pure input→output (given the same origin + public key they return the
 * same JSON), so they are unit-tested without I/O. The protocol vocabulary is
 * delegated to Fedify (see ADR-0002); we only own the mapping from the site's
 * fixed identity ({@link ./config}) to AS2/JRD fields.
 */

/** A single WebFinger link (a JRD `links` entry). */
export interface WebFingerLink {
	rel: string;
	type?: string;
	href: string;
}

/** A WebFinger JRD (JSON Resource Descriptor) for the actor's `acct:` handle. */
export interface WebFinger {
	subject: string;
	aliases: string[];
	links: WebFingerLink[];
}

/**
 * Build the WebFinger JRD resolving `acct:fdkevin@fdke.vin` to the actor: a
 * `self` link to the AS2 actor document and a profile-page link to the site.
 */
export function buildWebFinger(options: { origin: URL | string }): WebFinger {
	const actor = actorUri(options.origin);
	return {
		subject: `acct:${AP_USERNAME}@${AP_DOMAIN}`,
		aliases: [actor.href],
		links: [
			{ rel: "self", type: "application/activity+json", href: actor.href },
			{
				rel: "http://webfinger.net/rel/profile-page",
				type: "text/html",
				href: siteConfig.url,
			},
		],
	};
}

/**
 * Build the spec-shaped AS2 actor document: an `Application` carrying the
 * actor's `preferredUsername`, `inbox`/`outbox`/`followers` collections, a
 * shared-inbox endpoint, and the RSA `publicKey` (serialized as SPKI PEM) that
 * remote servers dereference to verify the actor's signed requests.
 */
export async function buildActor(options: {
	origin: URL | string;
	publicKey: CryptoKey;
}): Promise<Record<string, unknown>> {
	const actor = actorUri(options.origin);
	const application = new Application({
		id: actor,
		preferredUsername: AP_USERNAME,
		name: siteConfig.author,
		summary: siteConfig.description,
		url: new URL(siteConfig.url),
		manuallyApprovesFollowers: false,
		discoverable: true,
		indexable: true,
		inbox: inboxUri(options.origin),
		outbox: outboxUri(options.origin),
		followers: followersUri(options.origin),
		following: followingUri(options.origin),
		endpoints: new Endpoints({ sharedInbox: inboxUri(options.origin) }),
		publicKey: new CryptographicKey({
			id: keyId(options.origin),
			owner: actor,
			publicKey: options.publicKey,
		}),
	});
	const json = await application.toJsonLd();
	return json as Record<string, unknown>;
}

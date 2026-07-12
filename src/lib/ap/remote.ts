/**
 * Dereference a remote {@link Actor}. Two entry points share one fetch:
 * {@link fetchRemoteActor} returns just the delivery inboxes (used by the Follow
 * flow); {@link fetchRemoteActorProfile} additionally returns the display fields
 * an {@link Interaction} renders (name, `@user@domain` handle, proxied avatar).
 */

import { type Referenceable, refToString } from "@/lib/ap/as2";
import { proxyRemoteImage } from "@/lib/ap/avatar";
import { domainOf } from "@/lib/ap/blocklist";
import type { ApEnv } from "@/lib/ap/runtime";

export interface RemoteActor {
	id: string;
	inbox: string;
	sharedInbox: string | null;
}

/** A remote actor's display fields, with the avatar already proxied through R2. */
export interface RemoteActorProfile {
	id: string;
	name: string | null;
	handle: string | null;
	avatarUrl: string | null;
}

interface RemoteActorDoc {
	id?: string;
	inbox?: Referenceable;
	endpoints?: { sharedInbox?: Referenceable } | null;
	name?: string;
	preferredUsername?: string;
	icon?: Referenceable | { url?: Referenceable };
	url?: Referenceable;
}

async function fetchActorDoc(actorId: string): Promise<RemoteActorDoc> {
	const res = await fetch(actorId, {
		headers: { Accept: "application/activity+json, application/ld+json" },
		redirect: "follow",
	});
	if (!res.ok) {
		throw new Error(`Failed to fetch actor ${actorId}: ${res.status}`);
	}
	return (await res.json()) as RemoteActorDoc;
}

/** Fetch a remote actor document and extract its delivery inboxes. */
export async function fetchRemoteActor(actorId: string): Promise<RemoteActor> {
	const doc = await fetchActorDoc(actorId);
	const inbox = refToString(doc.inbox);
	if (!inbox) {
		throw new Error(`Actor ${actorId} has no inbox`);
	}
	return {
		id: doc.id ?? actorId,
		inbox,
		sharedInbox: refToString(doc.endpoints?.sharedInbox),
	};
}

/** Resolve an actor's icon to a single image URL (icon may be an object or array). */
function iconUrl(icon: RemoteActorDoc["icon"]): string | null {
	if (!icon) return null;
	if (typeof icon === "string") return icon;
	if (Array.isArray(icon)) return iconUrl(icon[0] as RemoteActorDoc["icon"]);
	if ("url" in icon) return refToString(icon.url as Referenceable);
	return refToString(icon as Referenceable);
}

/**
 * Fetch a remote actor's display profile for an interaction: its name, a
 * `@user@domain` handle (from `preferredUsername` + the actor host), and its
 * avatar proxied through R2. Avatar proxying failures degrade to `null`.
 */
export async function fetchRemoteActorProfile(
	env: ApEnv,
	actorId: string,
): Promise<RemoteActorProfile> {
	const doc = await fetchActorDoc(actorId);
	const id = doc.id ?? actorId;
	const username = doc.preferredUsername?.trim();
	const host = domainOf(id);
	const handle = username && host ? `@${username}@${host}` : null;
	const avatarUrl = await proxyRemoteImage(env, iconUrl(doc.icon));
	return {
		id,
		name: doc.name?.trim() || username || null,
		handle,
		avatarUrl,
	};
}

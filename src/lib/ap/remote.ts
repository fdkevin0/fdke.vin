/**
 * Dereference a remote {@link Actor} to find where deliveries go: its personal
 * `inbox` and, when advertised, its `endpoints.sharedInbox`. Kept minimal — a
 * single authenticated-less GET with AS2 content negotiation — since we only
 * need the delivery endpoints, not the full profile.
 */

import { type Referenceable, refToString } from "@/lib/ap/as2";

export interface RemoteActor {
	id: string;
	inbox: string;
	sharedInbox: string | null;
}

/** Fetch a remote actor document and extract its delivery inboxes. */
export async function fetchRemoteActor(actorId: string): Promise<RemoteActor> {
	const res = await fetch(actorId, {
		headers: { Accept: "application/activity+json, application/ld+json" },
		redirect: "follow",
	});
	if (!res.ok) {
		throw new Error(`Failed to fetch actor ${actorId}: ${res.status}`);
	}
	const doc = (await res.json()) as {
		id?: string;
		inbox?: Referenceable;
		endpoints?: { sharedInbox?: Referenceable } | null;
	};

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

import { Accept, Follow } from "@fedify/fedify/vocab";
import { type Referenceable, refToString } from "@/lib/ap/as2";
import { actorUri } from "@/lib/ap/config";
import { postSignedActivity } from "@/lib/ap/delivery";
import { addFollower, removeFollower } from "@/lib/ap/followers";
import { fetchRemoteActor } from "@/lib/ap/remote";
import type { ApEnv } from "@/lib/ap/runtime";
import { ulid } from "@/lib/ap/ulid";

/**
 * Inbox activity handling (issue AP-5): turn a signature-verified inbound
 * Activity into follower-store writes and a signed `Accept`.
 *
 * The classifier {@link classifyInboxActivity} is pure (JSON → intent) and
 * unit-tested; {@link processInboxActivity} performs the I/O (fetching the
 * follower's actor, storing it, delivering the `Accept`).
 */

/** The minimal inbound Activity shape we read. */
export interface InboundActivity {
	id?: string;
	type?: string;
	actor?: Referenceable;
	object?: Referenceable;
}

/** What an inbound Activity asks us to do. */
export type InboxAction =
	| { kind: "follow"; actorId: string; followId: string; target: string | null }
	| { kind: "undo-follow"; actorId: string }
	| { kind: "ignore"; reason: string };

/**
 * Classify an inbound Activity into a follow, an undo-follow, or ignore.
 * Pure input→output over the parsed JSON.
 */
export function classifyInboxActivity(activity: InboundActivity): InboxAction {
	const type = activity.type;
	const actorId = refToString(activity.actor);
	if (!actorId) return { kind: "ignore", reason: "missing actor" };

	if (type === "Follow") {
		return {
			kind: "follow",
			actorId,
			followId: activity.id ?? "",
			target: refToString(activity.object),
		};
	}

	if (type === "Undo") {
		const inner = activity.object;
		const innerType = typeof inner === "object" && inner ? inner.type : undefined;
		// An Undo of a Follow (either the embedded Follow object or a bare ref).
		if (innerType === undefined || innerType === "Follow") {
			return { kind: "undo-follow", actorId };
		}
		return { kind: "ignore", reason: `unsupported Undo of ${innerType}` };
	}

	return { kind: "ignore", reason: `unsupported type ${type ?? "unknown"}` };
}

/** The outcome of handling an inbound Activity, for the endpoint's response. */
export type InboxOutcome =
	| { action: "followed"; actorId: string }
	| { action: "unfollowed"; actorId: string }
	| { action: "ignored"; reason: string };

/**
 * Apply a verified inbound Activity: store/deliver-Accept a `Follow`, or drop a
 * follower on `Undo(Follow)`.
 */
export async function processInboxActivity(
	env: ApEnv,
	options: { activity: InboundActivity; origin: URL | string },
): Promise<InboxOutcome> {
	const action = classifyInboxActivity(options.activity);

	if (action.kind === "ignore") {
		return { action: "ignored", reason: action.reason };
	}

	if (action.kind === "undo-follow") {
		await removeFollower(env, action.actorId);
		return { action: "unfollowed", actorId: action.actorId };
	}

	// Follow: resolve the follower's delivery inbox(es), persist, then Accept.
	const remote = await fetchRemoteActor(action.actorId);
	await addFollower(env, {
		actorId: remote.id,
		inboxUrl: remote.inbox,
		sharedInboxUrl: remote.sharedInbox,
	});
	await deliverAccept(env, {
		origin: options.origin,
		followId: action.followId,
		followerId: remote.id,
		inboxUrl: remote.inbox,
	});
	return { action: "followed", actorId: remote.id };
}

/** Build and deliver a signed `Accept(Follow)` to the follower's inbox. */
async function deliverAccept(
	env: ApEnv,
	options: { origin: URL | string; followId: string; followerId: string; inboxUrl: string },
): Promise<void> {
	const actor = actorUri(options.origin);
	const follow = new Follow({
		id: options.followId ? new URL(options.followId) : null,
		actor: new URL(options.followerId),
		object: actor,
	});
	const accept = new Accept({
		id: new URL(`#accepts/${ulid()}`, actor),
		actor,
		object: follow,
	});
	await postSignedActivity(env, {
		inboxUrl: options.inboxUrl,
		activity: await accept.toJsonLd(),
		origin: options.origin,
	});
}

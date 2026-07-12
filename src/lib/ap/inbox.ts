import { Accept, Follow } from "@fedify/fedify/vocab";
import { type Referenceable, refToString } from "@/lib/ap/as2";
import { isDomainBlocked } from "@/lib/ap/blocklist";
import { AP_DOMAIN, actorUri } from "@/lib/ap/config";
import { postSignedActivity } from "@/lib/ap/delivery";
import { addFollower, removeFollower } from "@/lib/ap/followers";
import {
	deleteInteractionsByObject,
	insertInteraction,
	removeInteraction,
} from "@/lib/ap/interactions";
import { fetchRemoteActor, fetchRemoteActorProfile } from "@/lib/ap/remote";
import type { ApEnv } from "@/lib/ap/runtime";
import { sanitizeRemoteHtml } from "@/lib/ap/sanitize";
import { getNoteById } from "@/lib/ap/storage";
import { ulid } from "@/lib/ap/ulid";

/**
 * Inbox activity handling (issues AP-5, AP-7): turn a signature-verified inbound
 * Activity into follower-store writes, interaction-store writes, and (for a
 * Follow) a signed `Accept`.
 *
 * The classifier {@link classifyInboxActivity} is pure (JSON → intent) and
 * unit-tested; {@link processInboxActivity} performs the I/O (blocklist check,
 * fetching/storing the remote actor, persisting interactions, delivering the
 * `Accept`).
 */

/** A loosely-typed inbound object (a Note in a Create, or a nested activity). */
export interface InboundObject {
	id?: string;
	type?: string;
	actor?: Referenceable;
	object?: Referenceable | InboundObject;
	inReplyTo?: Referenceable;
	content?: string;
	url?: Referenceable;
	published?: string;
	attributedTo?: Referenceable;
	[key: string]: unknown;
}

/** The minimal inbound Activity shape we read. */
export interface InboundActivity {
	id?: string | undefined;
	type?: string | undefined;
	actor?: Referenceable | undefined;
	object?: Referenceable | InboundObject | undefined;
}

/** What an inbound Activity asks us to do. */
export type InboxAction =
	| { kind: "follow"; actorId: string; followId: string; target: string | null }
	| { kind: "undo-follow"; actorId: string }
	| ({ kind: "reply"; actorId: string; activityId: string; noteId: string } & ReplyPayload)
	| { kind: "like"; actorId: string; activityId: string; noteId: string; objectId: string }
	| { kind: "announce"; actorId: string; activityId: string; noteId: string; objectId: string }
	| {
			kind: "undo-interaction";
			actorId: string;
			activityId: string;
			interactionKind: "like" | "announce";
			objectId: string;
	  }
	| { kind: "delete-object"; actorId: string; objectId: string }
	| { kind: "ignore"; reason: string };

/** The reply-specific fields carried alongside a classified `reply` action. */
interface ReplyPayload {
	objectId: string;
	inReplyTo: string;
	content: string;
	url: string | null;
	published: string | null;
}

/** True once we have resolved a URI to a local Note id under our own domain. */
function localNoteId(uri: string | null): string | null {
	if (!uri) return null;
	let url: URL;
	try {
		url = new URL(uri);
	} catch {
		return null;
	}
	if (url.host !== AP_DOMAIN) return null;
	const match = url.pathname.match(/^\/notes\/([^/]+)\/?$/);
	return match ? (match[1] ?? null) : null;
}

/** Read a possibly-nested inbound value as an object (never a bare string). */
function asObject(value: Referenceable | InboundObject | undefined): InboundObject | null {
	return value && typeof value === "object" ? (value as InboundObject) : null;
}

/**
 * Classify an inbound Activity into a follow, an interaction (reply/like/
 * announce), an undo/delete of one, or ignore. Pure input→output over the parsed
 * JSON — whether the target Note actually exists is checked later, with I/O.
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

	if (type === "Create") {
		return classifyCreate(activity, actorId);
	}

	if (type === "Like" || type === "Announce") {
		const objectId = refToString(activity.object);
		const noteId = localNoteId(objectId);
		if (!objectId || !noteId) {
			return { kind: "ignore", reason: `${type} of a non-local object` };
		}
		return {
			kind: type === "Like" ? "like" : "announce",
			actorId,
			activityId: activity.id ?? "",
			noteId,
			objectId,
		};
	}

	if (type === "Undo") {
		return classifyUndo(activity, actorId);
	}

	if (type === "Delete") {
		const objectId = refToString(activity.object) ?? asObject(activity.object)?.id ?? null;
		if (!objectId) return { kind: "ignore", reason: "Delete without an object" };
		return { kind: "delete-object", actorId, objectId };
	}

	return { kind: "ignore", reason: `unsupported type ${type ?? "unknown"}` };
}

/** Classify a `Create` — only a reply Note in-reply-to one of our Notes is kept. */
function classifyCreate(activity: InboundActivity, actorId: string): InboxAction {
	const object = asObject(activity.object);
	if (!object || object.type !== "Note") {
		return { kind: "ignore", reason: "Create of a non-Note object" };
	}
	const inReplyTo = refToString(object.inReplyTo);
	const noteId = localNoteId(inReplyTo);
	if (!inReplyTo || !noteId) {
		return { kind: "ignore", reason: "reply not in-reply-to a local Note" };
	}
	return {
		kind: "reply",
		actorId,
		activityId: activity.id ?? "",
		noteId,
		objectId: object.id ?? "",
		inReplyTo,
		content: object.content ?? "",
		url: refToString(object.url),
		published: object.published ?? null,
	};
}

/** Classify an `Undo` — of a Follow, or of a Like/Announce interaction. */
function classifyUndo(activity: InboundActivity, actorId: string): InboxAction {
	const inner = asObject(activity.object);
	const innerType = inner?.type;
	// An Undo of a Follow (embedded object, or a bare ref we assume is a Follow).
	if (innerType === undefined || innerType === "Follow") {
		return { kind: "undo-follow", actorId };
	}
	if (innerType === "Like" || innerType === "Announce") {
		const activityId = inner?.id ?? "";
		const objectId = refToString(inner?.object) ?? "";
		// Match on the activity id when present, otherwise on (actor, kind, object)
		// — remote Likes don't always carry an id, and that fallback also matches
		// our unique index. Need at least one to locate the row.
		if (!activityId && !objectId) {
			return { kind: "ignore", reason: `Undo of ${innerType} without an id or object` };
		}
		return {
			kind: "undo-interaction",
			actorId,
			activityId,
			interactionKind: innerType === "Like" ? "like" : "announce",
			objectId,
		};
	}
	return { kind: "ignore", reason: `unsupported Undo of ${innerType}` };
}

/** The outcome of handling an inbound Activity, for the endpoint's response. */
export type InboxOutcome =
	| { action: "followed"; actorId: string }
	| { action: "unfollowed"; actorId: string }
	| { action: "reply" | "like" | "announce"; actorId: string; noteId: string }
	| { action: "undone" | "deleted" }
	| { action: "ignored"; reason: string };

/**
 * Apply a verified inbound Activity: enforce the domain blocklist, then store a
 * follower / interaction, remove one on Undo/Delete, or deliver an `Accept`.
 */
export async function processInboxActivity(
	env: ApEnv,
	options: { activity: InboundActivity; origin: URL | string },
): Promise<InboxOutcome> {
	const action = classifyInboxActivity(options.activity);

	if (action.kind === "ignore") {
		return { action: "ignored", reason: action.reason };
	}

	// Blocklist enforcement: drop anything from a blocklisted actor domain before
	// any store write or remote fetch (issue AP-7).
	if (await isDomainBlocked(env, action.actorId)) {
		return { action: "ignored", reason: "blocklisted domain" };
	}

	switch (action.kind) {
		case "undo-follow":
			await removeFollower(env, action.actorId);
			return { action: "unfollowed", actorId: action.actorId };

		case "undo-interaction":
			await removeInteraction(env, {
				activityId: action.activityId || null,
				actorId: action.actorId,
				kind: action.interactionKind,
				objectId: action.objectId || null,
			});
			return { action: "undone" };

		case "delete-object":
			await deleteInteractionsByObject(env, action.objectId);
			return { action: "deleted" };

		case "follow":
			return handleFollow(env, action, options.origin);

		case "reply":
		case "like":
		case "announce":
			return handleInteraction(env, action);
	}
}

/** Resolve the follower's inbox(es), persist, then deliver a signed `Accept`. */
async function handleFollow(
	env: ApEnv,
	action: Extract<InboxAction, { kind: "follow" }>,
	origin: URL | string,
): Promise<InboxOutcome> {
	const remote = await fetchRemoteActor(action.actorId);
	await addFollower(env, {
		actorId: remote.id,
		inboxUrl: remote.inbox,
		sharedInboxUrl: remote.sharedInbox,
	});
	await deliverAccept(env, {
		origin,
		followId: action.followId,
		followerId: remote.id,
		inboxUrl: remote.inbox,
	});
	return { action: "followed", actorId: remote.id };
}

/** Store a reply/like/announce, dropping it if the target Note no longer exists. */
async function handleInteraction(
	env: ApEnv,
	action: Extract<InboxAction, { kind: "reply" | "like" | "announce" }>,
): Promise<InboxOutcome> {
	const note = await getNoteById(env, action.noteId);
	if (!note) {
		return { action: "ignored", reason: "target Note not found" };
	}

	const remote = await fetchRemoteActorProfile(env, action.actorId);
	const content = action.kind === "reply" ? await sanitizeRemoteHtml(action.content) : null;

	await insertInteraction(env, {
		id: ulid(),
		activityId: action.activityId || null,
		noteId: action.noteId,
		kind: action.kind,
		actorId: remote.id,
		actorName: remote.name,
		actorHandle: remote.handle,
		actorAvatarUrl: remote.avatarUrl,
		objectId: action.kind === "reply" ? action.objectId || null : action.objectId,
		content,
		url: action.kind === "reply" ? action.url : action.objectId,
		publishedAt: action.kind === "reply" ? action.published : null,
	});

	return { action: action.kind, actorId: remote.id, noteId: action.noteId };
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

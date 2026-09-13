import { WorkersKvStore, WorkersMessageQueue } from "@fedify/cfworkers";
import {
	type Context,
	createFederationBuilder,
	type InboxContext,
	type Message,
} from "@fedify/fedify";
import {
	Accept,
	type Activity,
	type Actor,
	Announce,
	Application,
	Note as As2Note,
	Create,
	Delete,
	Endpoints,
	Follow,
	Image,
	Like,
	Undo,
} from "@fedify/fedify/vocab";
import {
	buildActivityForNote,
	buildDeleteActivityForNote,
	type DeliveryKind,
} from "@/lib/ap/activity";
import { proxyRemoteImage } from "@/lib/ap/avatar";
import { isDomainBlocked } from "@/lib/ap/blocklist";
import { AP_USERNAME } from "@/lib/ap/config";
import { addFollower, countFollowers, listFollowers, removeFollower } from "@/lib/ap/followers";
import {
	deleteInteractionsByObject,
	insertInteraction,
	removeInteraction,
} from "@/lib/ap/interactions";
import { loadActorKeyPair } from "@/lib/ap/keys";
import { renderNoteMarkdown } from "@/lib/ap/markdown";
import { sanitizeRemoteHtml } from "@/lib/ap/sanitize";
import { buildNoteObject } from "@/lib/ap/serialize";
import { getNoteById, listNoteAttachments, listNotes } from "@/lib/ap/storage";
import type { NoteAttachment } from "@/lib/ap/types";
import { ulid } from "@/lib/ap/ulid";
import { siteConfig } from "@/site.config";

const builder = createFederationBuilder<Env>();

const actorCallbacks = builder.setActorDispatcher(
	"/users/{identifier}",
	async (ctx, identifier) => {
		if (identifier !== AP_USERNAME) return null;
		const keys = await ctx.getActorKeyPairs(identifier);
		const actor = ctx.getActorUri(identifier);
		const values: ConstructorParameters<typeof Application>[0] = {
			id: actor,
			preferredUsername: AP_USERNAME,
			name: siteConfig.author,
			summary: siteConfig.description,
			url: new URL(siteConfig.url),
			manuallyApprovesFollowers: false,
			discoverable: true,
			indexable: true,
			inbox: ctx.getInboxUri(identifier),
			outbox: ctx.getOutboxUri(identifier),
			followers: ctx.getFollowersUri(identifier),
			icon: new Image({ url: new URL("/icons/icon-512.png", actor), mediaType: "image/png" }),
			image: new Image({ url: new URL("/social-card.png", actor), mediaType: "image/png" }),
			endpoints: new Endpoints({ sharedInbox: ctx.getInboxUri() }),
			assertionMethods: keys.map((key) => key.multikey),
		};
		if (keys[0]) values.publicKey = keys[0].cryptographicKey;
		return new Application(values);
	},
);

actorCallbacks
	.mapActorAlias("/actor", AP_USERNAME)
	.setKeyPairsDispatcher(async (ctx, identifier) => {
		if (identifier !== AP_USERNAME) return [];
		return [await loadActorKeyPair(ctx.data)];
	});

builder.setObjectDispatcher(As2Note, "/notes/{id}/", async (ctx, { id }) => {
	const note = await getNoteById(ctx.data, id);
	if (!note) return null;
	const [htmlContent, attachments] = await Promise.all([
		renderNoteMarkdown(note.content),
		listNoteAttachments(ctx.data, note.id),
	]);
	return buildNoteObject(note, activityOptions(ctx, htmlContent, attachments));
});

builder
	.setOutboxDispatcher("/users/{identifier}/outbox", async (ctx, identifier) => {
		if (identifier !== AP_USERNAME) return null;
		const notes = await listNotes(ctx.data);
		return {
			items: await Promise.all(
				notes.map(async (note) => {
					const [htmlContent, attachments] = await Promise.all([
						renderNoteMarkdown(note.content),
						listNoteAttachments(ctx.data, note.id),
					]);
					return buildActivityForNote(
						"Create",
						note,
						activityOptions(ctx, htmlContent, attachments),
					);
				}),
			),
		};
	})
	.setCounter(async (ctx, identifier) =>
		identifier === AP_USERNAME ? (await listNotes(ctx.data)).length : null,
	);

builder
	.setFollowersDispatcher("/users/{identifier}/followers", async (ctx, identifier) => {
		if (identifier !== AP_USERNAME) return null;
		return { items: await listFollowers(ctx.data) };
	})
	.setCounter(async (ctx, identifier) =>
		identifier === AP_USERNAME ? countFollowers(ctx.data) : null,
	);

builder
	.setInboxListeners("/users/{identifier}/inbox", "/inbox")
	.on(Follow, handleFollow)
	.on(Undo, handleUndo)
	.on(Create, handleCreate)
	.on(Like, (ctx, activity) => handleReaction(ctx, activity, "like"))
	.on(Announce, (ctx, activity) => handleReaction(ctx, activity, "announce"))
	.on(Delete, handleDelete);

function activityOptions(ctx: Context<Env>, htmlContent: string, attachments: NoteAttachment[]) {
	return {
		origin: ctx.origin,
		actorId: ctx.getActorUri(AP_USERNAME),
		followersUri: ctx.getFollowersUri(AP_USERNAME),
		htmlContent,
		attachments,
	};
}

async function remoteActor(ctx: InboxContext<Env>, activity: Follow | Create | Like | Announce) {
	const actorId = activity.actorId;
	if (!actorId || (await isDomainBlocked(ctx.data, actorId.href))) return null;
	return activity.getActor(ctx);
}

async function handleFollow(ctx: InboxContext<Env>, follow: Follow) {
	if (follow.objectId?.href !== ctx.getActorUri(AP_USERNAME).href) return;
	const actor = await remoteActor(ctx, follow);
	if (!actor?.id || !actor.inboxId) return;
	await addFollower(ctx.data, {
		actorId: actor.id.href,
		inboxUrl: actor.inboxId.href,
		sharedInboxUrl: actor.endpoints?.sharedInbox?.href ?? null,
	});
	await ctx.sendActivity(
		{ identifier: AP_USERNAME },
		actor,
		new Accept({
			id: new URL(`#accepts/${ulid()}`, ctx.getActorUri(AP_USERNAME)),
			actor: ctx.getActorUri(AP_USERNAME),
			object: follow,
		}),
	);
}

async function handleUndo(ctx: InboxContext<Env>, undo: Undo) {
	const actorId = undo.actorId;
	if (!actorId || (await isDomainBlocked(ctx.data, actorId.href))) return;
	const object = await undo.getObject(ctx);
	if (object instanceof Follow) {
		await removeFollower(ctx.data, actorId.href);
	} else if (object instanceof Like || object instanceof Announce) {
		await removeInteraction(ctx.data, {
			activityId: object.id?.href ?? null,
			actorId: actorId.href,
			kind: object instanceof Like ? "like" : "announce",
			objectId: object.objectId?.href ?? null,
		});
	}
}

async function handleCreate(ctx: InboxContext<Env>, create: Create) {
	const actor = await remoteActor(ctx, create);
	if (!actor?.id) return;
	const object = await create.getObject(ctx);
	if (!(object instanceof As2Note) || !object.id) return;
	const noteId = localNoteId(object.replyTargetId, ctx.hostname);
	if (!noteId || !(await getNoteById(ctx.data, noteId))) return;
	await storeInteraction(ctx, actor, {
		activityId: create.id,
		noteId,
		kind: "reply",
		objectId: object.id,
		content: await sanitizeRemoteHtml(text(object.content) ?? ""),
		url: object.url instanceof URL ? object.url : object.id,
		publishedAt: object.published?.toString() ?? null,
	});
}

async function handleReaction(
	ctx: InboxContext<Env>,
	activity: Like | Announce,
	kind: "like" | "announce",
) {
	const actor = await remoteActor(ctx, activity);
	const objectId = activity.objectId;
	const noteId = localNoteId(objectId, ctx.hostname);
	if (!actor?.id || !objectId || !noteId || !(await getNoteById(ctx.data, noteId))) return;
	await storeInteraction(ctx, actor, {
		activityId: activity.id,
		noteId,
		kind,
		objectId,
		content: null,
		url: objectId,
		publishedAt: null,
	});
}

async function handleDelete(ctx: InboxContext<Env>, activity: Delete) {
	if (!activity.actorId || (await isDomainBlocked(ctx.data, activity.actorId.href))) return;
	if (activity.objectId) await deleteInteractionsByObject(ctx.data, activity.objectId.href);
}

async function storeInteraction(
	ctx: InboxContext<Env>,
	actor: Actor,
	input: {
		activityId: URL | null;
		noteId: string;
		kind: "reply" | "like" | "announce";
		objectId: URL;
		content: string | null;
		url: URL;
		publishedAt: string | null;
	},
) {
	const username = text(actor.preferredUsername)?.trim() || null;
	const icon = await actor.getIcon(ctx);
	const iconUrl = icon?.url instanceof URL ? icon.url : (icon?.url?.href ?? icon?.id);
	await insertInteraction(ctx.data, {
		id: ulid(),
		activityId: input.activityId?.href ?? null,
		noteId: input.noteId,
		kind: input.kind,
		actorId: actor.id?.href ?? "",
		actorName: text(actor.name)?.trim() || username,
		actorHandle: username && actor.id ? `@${username}@${actor.id.host}` : null,
		actorAvatarUrl: await proxyRemoteImage(ctx.data, iconUrl?.href),
		objectId: input.objectId.href,
		content: input.content,
		url: input.url.href,
		publishedAt: input.publishedAt,
	});
}

function text(value: unknown): string | null {
	return typeof value === "string" ? value : value == null ? null : String(value);
}

function localNoteId(uri: URL | null, hostname: string): string | null {
	if (!uri || uri.hostname !== hostname) return null;
	return uri.pathname.match(/^\/notes\/([^/]+)\/?$/)?.[1] ?? null;
}

export async function createFederation(env: Env) {
	return builder.build({
		kv: new WorkersKvStore(env.AP_FEDIFY_KV),
		queue: new WorkersMessageQueue(env.AP_DELIVERY_QUEUE),
		origin: siteConfig.url,
	});
}

export async function sendNoteActivity(
	env: Env,
	kind: DeliveryKind,
	noteId: string,
): Promise<void> {
	const federation = await createFederation(env);
	const ctx = federation.createContext(new URL(siteConfig.url), env);
	let activity: Activity;
	if (kind === "Delete") {
		activity = buildDeleteActivityForNote(noteId, {
			origin: ctx.origin,
			actorId: ctx.getActorUri(AP_USERNAME),
			followersUri: ctx.getFollowersUri(AP_USERNAME),
		});
	} else {
		const note = await getNoteById(env, noteId);
		if (!note) return;
		const [htmlContent, attachments] = await Promise.all([
			renderNoteMarkdown(note.content),
			listNoteAttachments(env, note.id),
		]);
		activity = buildActivityForNote(kind, note, activityOptions(ctx, htmlContent, attachments));
	}
	await ctx.sendActivity({ identifier: AP_USERNAME }, "followers", activity, {
		preferSharedInbox: true,
	});
}

export async function processFederationMessage(env: Env, message: Message): Promise<void> {
	const queue = new WorkersMessageQueue(env.AP_DELIVERY_QUEUE);
	const result = await queue.processMessage(message);
	if (!result.shouldProcess) throw new Error("Fedify ordering lock is busy");
	try {
		const federation = await createFederation(env);
		await federation.processQueuedTask(env, result.message as Message);
	} finally {
		await result.release?.();
	}
}

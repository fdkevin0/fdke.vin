import { type ActivityKind, activityForNote } from "@/lib/ap/activity";
import { AP_ORIGIN, keyId } from "@/lib/ap/config";
import { listDeliveryInboxes } from "@/lib/ap/followers";
import { loadActorKeyPair } from "@/lib/ap/keys";
import { renderNoteMarkdown } from "@/lib/ap/markdown";
import type { ApEnv } from "@/lib/ap/runtime";
import { signRequest } from "@/lib/ap/signature";
import { getNoteById, listNoteAttachments } from "@/lib/ap/storage";
import type { ApDeliveryMessage } from "@/lib/ap/types";

/**
 * Deliver a signed AS2 activity to a single remote inbox.
 *
 * The shared low-level primitive behind every outbound POST: the inbox `Accept`
 * (issue AP-5) and the Create/Update fan-out (issue AP-6). Signs the request
 * with the actor's key and throws on a non-2xx response so queue consumers
 * retry. See CONTEXT.md "Delivery".
 */
export async function postSignedActivity(
	env: ApEnv,
	options: { inboxUrl: string; activity: unknown; origin: URL | string },
): Promise<void> {
	const { privateKey } = await loadActorKeyPair(env);
	const request = new Request(options.inboxUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/activity+json",
			Accept: "application/activity+json",
		},
		body: JSON.stringify(options.activity),
	});
	const signed = await signRequest(request, {
		privateKey,
		keyId: keyId(options.origin),
	});

	const res = await fetch(signed);
	if (!res.ok) {
		const detail = await res.text().catch(() => "");
		throw new Error(
			`Delivery to ${options.inboxUrl} failed: ${res.status}${detail ? ` ${detail.slice(0, 200)}` : ""}`,
		);
	}
}

/**
 * Enqueue a delivery of a Note's Create/Update to every follower (issue AP-6).
 *
 * Fans out one {@link ApDeliveryMessage} per deduped follower inbox so authoring
 * stays fast and a flaky server only fails its own message. A no-op when there
 * are no followers. Only live authoring delivers — backfilled Notes never do.
 */
export async function enqueueNoteDelivery(
	env: ApEnv,
	options: { kind: ActivityKind; noteId: string },
): Promise<void> {
	const inboxes = await listDeliveryInboxes(env);
	if (inboxes.length === 0) return;

	await env.AP_DELIVERY_QUEUE.sendBatch(
		inboxes.map((inboxUrl) => ({
			body: {
				kind: options.kind,
				noteId: options.noteId,
				inboxUrl,
			} satisfies ApDeliveryMessage,
		})),
	);
}

/**
 * Consume one delivery message (issue AP-6): rebuild the Note's activity and
 * POST it, signed, to the target inbox. Throwing on failure lets the queue
 * retry with backoff; a missing Note (deleted before delivery) is a no-op.
 */
export async function processDeliveryMessage(
	env: ApEnv,
	message: ApDeliveryMessage,
): Promise<void> {
	const note = await getNoteById(env, message.noteId);
	if (!note) return;

	const [htmlContent, attachments] = await Promise.all([
		renderNoteMarkdown(note.content),
		listNoteAttachments(env, note.id),
	]);
	const activity = await activityForNote(message.kind, note, {
		origin: AP_ORIGIN,
		htmlContent,
		attachments,
	});
	await postSignedActivity(env, {
		inboxUrl: message.inboxUrl,
		activity,
		origin: AP_ORIGIN,
	});
}

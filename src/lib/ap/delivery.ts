import { activityForNote, type DeliveryKind, deleteActivityForNote } from "@/lib/ap/activity";
import { ALBUM_DEBOUNCE_MS } from "@/lib/ap/album";
import { AP_ORIGIN, keyId } from "@/lib/ap/config";
import { recordDeliveryPending, recordDeliveryResult } from "@/lib/ap/deliveries";
import { listDeliveryInboxes } from "@/lib/ap/followers";
import { loadActorKeyPair } from "@/lib/ap/keys";
import { renderNoteMarkdown } from "@/lib/ap/markdown";
import type { ApEnv } from "@/lib/ap/runtime";
import { signRequest } from "@/lib/ap/signature";
import { getNoteById, listNoteAttachments } from "@/lib/ap/storage";
import type { AlbumFinalizeMessage, ApDeliveryMessage } from "@/lib/ap/types";
import { getErrorMessage } from "@/lib/api/http";

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
	options: { kind: DeliveryKind; noteId: string },
): Promise<void> {
	const inboxes = await listDeliveryInboxes(env);
	if (inboxes.length === 0) return;

	// Mark each target pending before enqueueing so the dashboard shows in-flight
	// deliveries even before the queue drains (issue AP-8).
	await Promise.all(
		inboxes.map((inboxUrl) =>
			recordDeliveryPending(env, { noteId: options.noteId, inboxUrl, kind: options.kind }),
		),
	);

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
 * Enqueue a debounced finalization check for a Pending album (issue AP-11),
 * delayed by the same quiet period {@link decideAlbumFinalization} checks
 * against. Called on every arriving Album photo; whichever check lands after
 * the group's last arrival is the one that finalizes.
 */
export async function enqueueAlbumFinalizeCheck(
	env: ApEnv,
	options: { chatId: number; groupId: string },
): Promise<void> {
	await env.AP_DELIVERY_QUEUE.send(
		{
			kind: "AlbumFinalize",
			chatId: options.chatId,
			groupId: options.groupId,
		} satisfies AlbumFinalizeMessage,
		{ delaySeconds: Math.ceil(ALBUM_DEBOUNCE_MS / 1000) },
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
	const activity = await buildDeliveryActivity(env, message);
	// A missing Note on a Create/Update (deleted before delivery) is a no-op.
	if (!activity) return;

	try {
		await postSignedActivity(env, {
			inboxUrl: message.inboxUrl,
			activity,
			origin: AP_ORIGIN,
		});
		await recordDeliveryResult(env, {
			noteId: message.noteId,
			inboxUrl: message.inboxUrl,
			kind: message.kind,
			ok: true,
		});
	} catch (error) {
		// Record the failure for the dashboard, then rethrow so the queue retries.
		await recordDeliveryResult(env, {
			noteId: message.noteId,
			inboxUrl: message.inboxUrl,
			kind: message.kind,
			ok: false,
			error: getErrorMessage(error, "delivery failed"),
		});
		throw error;
	}
}

/**
 * Build the AS2 activity for a delivery message: a `Delete(Tombstone)` (which
 * needs only the Note id — the row is gone by delivery time), or a `Create`/
 * `Update` rebuilt from the stored Note (`null` if that Note no longer exists).
 */
async function buildDeliveryActivity(
	env: ApEnv,
	message: ApDeliveryMessage,
): Promise<Record<string, unknown> | null> {
	if (message.kind === "Delete") {
		return deleteActivityForNote(message.noteId, { origin: AP_ORIGIN });
	}

	const note = await getNoteById(env, message.noteId);
	if (!note) return null;

	const [htmlContent, attachments] = await Promise.all([
		renderNoteMarkdown(note.content),
		listNoteAttachments(env, note.id),
	]);
	return activityForNote(message.kind, note, {
		origin: AP_ORIGIN,
		htmlContent,
		attachments,
	});
}

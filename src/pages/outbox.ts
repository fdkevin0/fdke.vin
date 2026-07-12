export const prerender = false;

import { OrderedCollection } from "@fedify/fedify/vocab";
import type { APIRoute } from "astro";
import { buildActivityForNote } from "@/lib/ap/activity";
import { outboxUri } from "@/lib/ap/config";
import { renderNoteMarkdown } from "@/lib/ap/markdown";
import { activityJson } from "@/lib/ap/response";
import { getApEnv } from "@/lib/ap/runtime";
import { listNoteAttachments, listNotes } from "@/lib/ap/storage";
import { getErrorMessage, logApiError } from "@/lib/api/http";

/**
 * The actor's outbox (issue AP-4): an `OrderedCollection` of `Create` activities
 * for every Note, newest-first — including backfilled historical Notes, which
 * appear here but are never delivered (delivery only ever originates from live
 * authoring; see CONTEXT.md "Delivery"). Read-only.
 */
export const GET: APIRoute = async ({ url }) => {
	try {
		const env = await getApEnv();
		const notes = await listNotes(env);
		const activities = await Promise.all(
			notes.map(async (note) => {
				const [html, attachments] = await Promise.all([
					renderNoteMarkdown(note.content),
					listNoteAttachments(env, note.id),
				]);
				return buildActivityForNote("Create", note, {
					origin: url.origin,
					htmlContent: html,
					attachments,
				});
			}),
		);

		const collection = new OrderedCollection({
			id: outboxUri(url.origin),
			totalItems: activities.length,
			items: activities,
		});
		return activityJson(await collection.toJsonLd());
	} catch (error) {
		logApiError("ap.outbox", error);
		return new Response(getErrorMessage(error, "Outbox is not available"), { status: 500 });
	}
};

import type { ApEnv } from "@/lib/ap/runtime";
import type { Interaction, InteractionCounts, InteractionKind } from "@/lib/ap/types";

/**
 * D1-backed {@link Interaction} store (issue AP-7): remote replies, likes, and
 * announces ingested via the inbox. Replies render as a sanitized thread under a
 * Note; likes/announces render as counts. Rows are removed on `Undo` (matched by
 * `activity_id`) and on `Delete` (matched by `object_id`); the author can hide a
 * reply from the dashboard (issue AP-8). Canonical schema in
 * `scripts/d1/activitypub.sql`.
 */

const COLUMNS =
	"id, activity_id, note_id, kind, actor_id, actor_name, actor_handle, actor_avatar_url, object_id, content, url, published_at, created_at, hidden";

interface ApInteractionRow {
	id: string;
	activity_id: string | null;
	note_id: string;
	kind: InteractionKind;
	actor_id: string;
	actor_name: string | null;
	actor_handle: string | null;
	actor_avatar_url: string | null;
	object_id: string | null;
	content: string | null;
	url: string | null;
	published_at: string | null;
	created_at: string;
	hidden: number;
}

let ensureSchemaPromise: Promise<void> | null = null;

async function ensureInteractionSchema(env: ApEnv): Promise<void> {
	if (!ensureSchemaPromise) {
		ensureSchemaPromise = (async () => {
			await env.DATABASE.prepare(
				`CREATE TABLE IF NOT EXISTS ap_interactions (
					id TEXT PRIMARY KEY,
					activity_id TEXT,
					note_id TEXT NOT NULL,
					kind TEXT NOT NULL,
					actor_id TEXT NOT NULL,
					actor_name TEXT,
					actor_handle TEXT,
					actor_avatar_url TEXT,
					object_id TEXT,
					content TEXT,
					url TEXT,
					published_at TEXT,
					created_at TEXT NOT NULL,
					hidden INTEGER NOT NULL DEFAULT 0
				)`,
			).run();
			await env.DATABASE.prepare(
				"CREATE INDEX IF NOT EXISTS idx_ap_interactions_note ON ap_interactions(note_id, kind)",
			).run();
			await env.DATABASE.prepare(
				"CREATE INDEX IF NOT EXISTS idx_ap_interactions_activity ON ap_interactions(activity_id)",
			).run();
			await env.DATABASE.prepare(
				"CREATE INDEX IF NOT EXISTS idx_ap_interactions_object ON ap_interactions(object_id)",
			).run();
			await env.DATABASE.prepare(
				`CREATE UNIQUE INDEX IF NOT EXISTS idx_ap_interactions_unique
				 ON ap_interactions(note_id, actor_id, kind, object_id)`,
			).run();
		})();
	}
	return ensureSchemaPromise;
}

function mapRow(row: ApInteractionRow): Interaction {
	return {
		id: row.id,
		kind: row.kind,
		actorId: row.actor_id,
		actorName: row.actor_name,
		actorHandle: row.actor_handle,
		actorAvatarUrl: row.actor_avatar_url,
		objectId: row.object_id,
		content: row.content,
		url: row.url,
		publishedAt: row.published_at,
		createdAt: row.created_at,
		hidden: row.hidden !== 0,
	};
}

/** A remote interaction to persist. */
export interface InsertInteractionInput {
	id: string;
	activityId: string | null;
	noteId: string;
	kind: InteractionKind;
	actorId: string;
	actorName: string | null;
	actorHandle: string | null;
	actorAvatarUrl: string | null;
	objectId: string | null;
	content: string | null;
	url: string | null;
	publishedAt: string | null;
}

/**
 * Store an interaction. Idempotent under the (note, actor, kind, object) unique
 * index — a re-sent Like/Announce or redelivered reply is ignored rather than
 * duplicated.
 */
export async function insertInteraction(env: ApEnv, input: InsertInteractionInput): Promise<void> {
	await ensureInteractionSchema(env);
	await env.DATABASE.prepare(
		`INSERT INTO ap_interactions (${COLUMNS})
		 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 0)
		 ON CONFLICT(note_id, actor_id, kind, object_id) DO NOTHING`,
	)
		.bind(
			input.id,
			input.activityId,
			input.noteId,
			input.kind,
			input.actorId,
			input.actorName,
			input.actorHandle,
			input.actorAvatarUrl,
			input.objectId,
			input.content,
			input.url,
			input.publishedAt,
			new Date().toISOString(),
		)
		.run();
}

/**
 * Remove an interaction on an `Undo(Like/Announce)`. Matches on the remote
 * Activity URI when the Undo carries one, otherwise on `(actor, kind, object)` —
 * remote Likes don't always advertise an id, and that tuple is our unique index,
 * so it reliably locates the row either way.
 */
export async function removeInteraction(
	env: ApEnv,
	match: {
		activityId: string | null;
		actorId: string;
		kind: InteractionKind;
		objectId: string | null;
	},
): Promise<void> {
	await ensureInteractionSchema(env);
	if (match.activityId) {
		const byActivity = await env.DATABASE.prepare(
			"DELETE FROM ap_interactions WHERE activity_id = ?1",
		)
			.bind(match.activityId)
			.run();
		if ((byActivity.meta?.changes ?? 0) > 0) return;
	}
	if (match.objectId) {
		await env.DATABASE.prepare(
			"DELETE FROM ap_interactions WHERE actor_id = ?1 AND kind = ?2 AND object_id = ?3",
		)
			.bind(match.actorId, match.kind, match.objectId)
			.run();
	}
}

/** Remove interactions referencing a deleted remote object (a `Delete` of a reply). */
export async function deleteInteractionsByObject(env: ApEnv, objectId: string): Promise<void> {
	await ensureInteractionSchema(env);
	await env.DATABASE.prepare("DELETE FROM ap_interactions WHERE object_id = ?1")
		.bind(objectId)
		.run();
}

/** Visible (non-hidden) replies to a Note, oldest-first (thread order). */
export async function listRepliesForNote(env: ApEnv, noteId: string): Promise<Interaction[]> {
	await ensureInteractionSchema(env);
	const result = await env.DATABASE.prepare(
		`SELECT ${COLUMNS} FROM ap_interactions
		 WHERE note_id = ?1 AND kind = 'reply' AND hidden = 0
		 ORDER BY COALESCE(published_at, created_at) ASC, id ASC`,
	)
		.bind(noteId)
		.all<ApInteractionRow>();
	return (result.results ?? []).map(mapRow);
}

/** Reply/like/announce counts for a Note (hidden replies excluded from the reply count). */
export async function countInteractionsForNote(
	env: ApEnv,
	noteId: string,
): Promise<InteractionCounts> {
	await ensureInteractionSchema(env);
	const result = await env.DATABASE.prepare(
		`SELECT kind, COUNT(*) AS total
		 FROM ap_interactions
		 WHERE note_id = ?1 AND NOT (kind = 'reply' AND hidden = 1)
		 GROUP BY kind`,
	)
		.bind(noteId)
		.all<{ kind: InteractionKind; total: number }>();
	const counts: InteractionCounts = { replies: 0, likes: 0, announces: 0 };
	for (const row of result.results ?? []) {
		if (row.kind === "reply") counts.replies = row.total;
		else if (row.kind === "like") counts.likes = row.total;
		else if (row.kind === "announce") counts.announces = row.total;
	}
	return counts;
}

/**
 * Reply/like/announce counts for many Notes at once, keyed by Note id (dashboard
 * note list). Hidden replies are excluded from the reply count. Notes with no
 * interactions are absent from the map.
 */
export async function interactionCountsForNotes(
	env: ApEnv,
	noteIds: string[],
): Promise<Map<string, InteractionCounts>> {
	const map = new Map<string, InteractionCounts>();
	if (noteIds.length === 0) return map;
	await ensureInteractionSchema(env);
	const placeholders = noteIds.map((_, i) => `?${i + 1}`).join(", ");
	const result = await env.DATABASE.prepare(
		`SELECT note_id, kind, COUNT(*) AS total
		 FROM ap_interactions
		 WHERE note_id IN (${placeholders}) AND NOT (kind = 'reply' AND hidden = 1)
		 GROUP BY note_id, kind`,
	)
		.bind(...noteIds)
		.all<{ note_id: string; kind: InteractionKind; total: number }>();
	for (const row of result.results ?? []) {
		const entry = map.get(row.note_id) ?? { replies: 0, likes: 0, announces: 0 };
		if (row.kind === "reply") entry.replies = row.total;
		else if (row.kind === "like") entry.likes = row.total;
		else if (row.kind === "announce") entry.announces = row.total;
		map.set(row.note_id, entry);
	}
	return map;
}

/** All interactions for a Note including hidden ones, newest-first (dashboard moderation). */
export async function listInteractionsForNote(env: ApEnv, noteId: string): Promise<Interaction[]> {
	await ensureInteractionSchema(env);
	const result = await env.DATABASE.prepare(
		`SELECT ${COLUMNS} FROM ap_interactions
		 WHERE note_id = ?1
		 ORDER BY COALESCE(published_at, created_at) DESC, id DESC`,
	)
		.bind(noteId)
		.all<ApInteractionRow>();
	return (result.results ?? []).map(mapRow);
}

/** Hide or unhide a stored reply so it stops/starts rendering under its Note. */
export async function setInteractionHidden(
	env: ApEnv,
	id: string,
	hidden: boolean,
): Promise<boolean> {
	await ensureInteractionSchema(env);
	const result = await env.DATABASE.prepare("UPDATE ap_interactions SET hidden = ?2 WHERE id = ?1")
		.bind(id, hidden ? 1 : 0)
		.run();
	return (result.meta?.changes ?? 0) > 0;
}

/** Permanently delete a stored interaction (dashboard "remove"). */
export async function deleteInteraction(env: ApEnv, id: string): Promise<boolean> {
	await ensureInteractionSchema(env);
	const result = await env.DATABASE.prepare("DELETE FROM ap_interactions WHERE id = ?1")
		.bind(id)
		.run();
	return (result.meta?.changes ?? 0) > 0;
}

/** Delete all interactions targeting a Note (when the Note itself is deleted). */
export async function deleteInteractionsForNote(env: ApEnv, noteId: string): Promise<void> {
	await ensureInteractionSchema(env);
	await env.DATABASE.prepare("DELETE FROM ap_interactions WHERE note_id = ?1").bind(noteId).run();
}

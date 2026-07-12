import type { DeliveryKind } from "@/lib/ap/activity";
import type { ApEnv } from "@/lib/ap/runtime";

/**
 * Per-inbox {@link Delivery} status tracking (issue AP-8). Each follower inbox a
 * Note is delivered to gets one row, moved `pending` → `delivered`/`failed` as
 * the queue processes it. The dashboard aggregates these into a Note's overall
 * federation status. Canonical schema in `scripts/d1/activitypub.sql`.
 */

export type DeliveryStatus = "pending" | "delivered" | "failed";

let ensureSchemaPromise: Promise<void> | null = null;

async function ensureDeliverySchema(env: ApEnv): Promise<void> {
	if (!ensureSchemaPromise) {
		ensureSchemaPromise = (async () => {
			await env.DATABASE.prepare(
				`CREATE TABLE IF NOT EXISTS ap_note_deliveries (
					note_id TEXT NOT NULL,
					inbox_url TEXT NOT NULL,
					kind TEXT NOT NULL,
					status TEXT NOT NULL,
					attempts INTEGER NOT NULL DEFAULT 0,
					last_error TEXT,
					updated_at TEXT NOT NULL,
					PRIMARY KEY (note_id, inbox_url)
				)`,
			).run();
			await env.DATABASE.prepare(
				"CREATE INDEX IF NOT EXISTS idx_ap_note_deliveries_note ON ap_note_deliveries(note_id)",
			).run();
		})();
	}
	return ensureSchemaPromise;
}

/** Aggregated delivery status for one Note. */
export interface NoteDeliveryStatus {
	pending: number;
	delivered: number;
	failed: number;
	total: number;
}

/** Mark a (note, inbox) delivery as pending — called when the message is enqueued. */
export async function recordDeliveryPending(
	env: ApEnv,
	input: { noteId: string; inboxUrl: string; kind: DeliveryKind },
): Promise<void> {
	await ensureDeliverySchema(env);
	await env.DATABASE.prepare(
		`INSERT INTO ap_note_deliveries (note_id, inbox_url, kind, status, attempts, last_error, updated_at)
		 VALUES (?1, ?2, ?3, 'pending', 0, NULL, ?4)
		 ON CONFLICT(note_id, inbox_url) DO UPDATE SET
		   kind = excluded.kind,
		   status = 'pending',
		   attempts = 0,
		   last_error = NULL,
		   updated_at = excluded.updated_at`,
	)
		.bind(input.noteId, input.inboxUrl, input.kind, new Date().toISOString())
		.run();
}

/** Record the result of a delivery attempt (delivered, or failed with an error). */
export async function recordDeliveryResult(
	env: ApEnv,
	input: { noteId: string; inboxUrl: string; kind: DeliveryKind; ok: boolean; error?: string },
): Promise<void> {
	await ensureDeliverySchema(env);
	await env.DATABASE.prepare(
		`INSERT INTO ap_note_deliveries (note_id, inbox_url, kind, status, attempts, last_error, updated_at)
		 VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6)
		 ON CONFLICT(note_id, inbox_url) DO UPDATE SET
		   kind = excluded.kind,
		   status = excluded.status,
		   attempts = ap_note_deliveries.attempts + 1,
		   last_error = excluded.last_error,
		   updated_at = excluded.updated_at`,
	)
		.bind(
			input.noteId,
			input.inboxUrl,
			input.kind,
			input.ok ? "delivered" : "failed",
			input.ok ? null : (input.error ?? "delivery failed").slice(0, 500),
			new Date().toISOString(),
		)
		.run();
}

/**
 * Aggregate delivery status per Note for a set of Note ids, as a map keyed by
 * Note id. Notes with no delivery rows (e.g. backfilled Notes, never delivered)
 * are simply absent from the map.
 */
export async function deliveryStatusForNotes(
	env: ApEnv,
	noteIds: string[],
): Promise<Map<string, NoteDeliveryStatus>> {
	const map = new Map<string, NoteDeliveryStatus>();
	if (noteIds.length === 0) return map;
	await ensureDeliverySchema(env);
	const placeholders = noteIds.map((_, i) => `?${i + 1}`).join(", ");
	const result = await env.DATABASE.prepare(
		`SELECT note_id, status, COUNT(*) AS total
		 FROM ap_note_deliveries
		 WHERE note_id IN (${placeholders})
		 GROUP BY note_id, status`,
	)
		.bind(...noteIds)
		.all<{ note_id: string; status: DeliveryStatus; total: number }>();

	for (const row of result.results ?? []) {
		const entry = map.get(row.note_id) ?? { pending: 0, delivered: 0, failed: 0, total: 0 };
		entry[row.status] = row.total;
		entry.total += row.total;
		map.set(row.note_id, entry);
	}
	return map;
}

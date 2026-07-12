import type { ApEnv } from "@/lib/ap/runtime";

/**
 * D1-backed {@link Follower} store: remote actors that have sent an accepted
 * `Follow`. Each row records the follower's actor id, its personal `inbox`, and
 * its (optional) shared `endpoints.sharedInbox`. Delivery fans out to the shared
 * inbox where present, deduped across followers on the same server — so one POST
 * reaches every follower on a big instance. See CONTEXT.md "Follower" / "Delivery".
 */

const FOLLOWER_COLUMNS = "actor_id, inbox_url, shared_inbox_url, created_at";

let ensureSchemaPromise: Promise<void> | null = null;

/** Create the `ap_followers` table if absent. Idempotent, cached per isolate. */
async function ensureFollowerSchema(env: ApEnv): Promise<void> {
	if (!ensureSchemaPromise) {
		ensureSchemaPromise = (async () => {
			await env.DATABASE.prepare(
				`CREATE TABLE IF NOT EXISTS ap_followers (
					actor_id TEXT PRIMARY KEY,
					inbox_url TEXT NOT NULL,
					shared_inbox_url TEXT,
					created_at TEXT NOT NULL
				)`,
			).run();
		})();
	}
	return ensureSchemaPromise;
}

interface ApFollowerRow {
	actor_id: string;
	inbox_url: string;
	shared_inbox_url: string | null;
	created_at: string;
}

/** Add a follower, or refresh its inbox URLs if it already follows (idempotent). */
export async function addFollower(
	env: ApEnv,
	input: { actorId: string; inboxUrl: string; sharedInboxUrl: string | null },
): Promise<void> {
	await ensureFollowerSchema(env);
	await env.DATABASE.prepare(
		`INSERT INTO ap_followers (actor_id, inbox_url, shared_inbox_url, created_at)
		 VALUES (?1, ?2, ?3, ?4)
		 ON CONFLICT(actor_id) DO UPDATE SET
		   inbox_url = excluded.inbox_url,
		   shared_inbox_url = excluded.shared_inbox_url`,
	)
		.bind(input.actorId, input.inboxUrl, input.sharedInboxUrl, new Date().toISOString())
		.run();
}

/** Remove a follower by actor id (an `Undo(Follow)`). No-op if not present. */
export async function removeFollower(env: ApEnv, actorId: string): Promise<void> {
	await ensureFollowerSchema(env);
	await env.DATABASE.prepare("DELETE FROM ap_followers WHERE actor_id = ?1").bind(actorId).run();
}

/** Total number of followers, for the followers collection's `totalItems`. */
export async function countFollowers(env: ApEnv): Promise<number> {
	await ensureFollowerSchema(env);
	const row = await env.DATABASE.prepare("SELECT COUNT(*) AS total FROM ap_followers").first<{
		total: number;
	}>();
	return row?.total ?? 0;
}

/** List follower actor ids newest-first (for the followers collection `items`). */
export async function listFollowerIds(env: ApEnv): Promise<string[]> {
	await ensureFollowerSchema(env);
	const result = await env.DATABASE.prepare(
		"SELECT actor_id FROM ap_followers ORDER BY created_at DESC",
	).all<{ actor_id: string }>();
	return (result.results ?? []).map((r) => r.actor_id);
}

/**
 * The deduplicated set of inbox URLs to deliver an activity to: each follower's
 * shared inbox where it has one, otherwise its personal inbox, with duplicate
 * shared inboxes collapsed so one server receives a single POST.
 */
export async function listDeliveryInboxes(env: ApEnv): Promise<string[]> {
	await ensureFollowerSchema(env);
	const result = await env.DATABASE.prepare(
		`SELECT ${FOLLOWER_COLUMNS} FROM ap_followers`,
	).all<ApFollowerRow>();
	return dedupeDeliveryInboxes(
		(result.results ?? []).map((row) => ({
			inboxUrl: row.inbox_url,
			sharedInboxUrl: row.shared_inbox_url,
		})),
	);
}

/**
 * Collapse a set of followers to the inboxes to deliver to: each follower's
 * shared inbox where present (so one POST serves every follower on that server),
 * otherwise its personal inbox, deduplicated. Pure — unit-tested.
 */
export function dedupeDeliveryInboxes(
	followers: { inboxUrl: string; sharedInboxUrl: string | null }[],
): string[] {
	const inboxes = new Set<string>();
	for (const follower of followers) {
		inboxes.add(follower.sharedInboxUrl ?? follower.inboxUrl);
	}
	return [...inboxes];
}

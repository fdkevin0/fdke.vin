import type { Recipient } from "@fedify/fedify/vocab";
import type { ApEnv } from "@/lib/ap/runtime";

/**
 * D1-backed {@link Follower} store: remote actors that have sent an accepted
 * `Follow`. Each row records the follower's actor id, its personal `inbox`, and
 * its (optional) shared `endpoints.sharedInbox`. Fedify consumes these rows as
 * recipients and handles shared-inbox fan-out. See CONTEXT.md "Follower" / "Delivery".
 */

const FOLLOWER_COLUMNS = "actor_id, inbox_url, shared_inbox_url, created_at";

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
	await env.DATABASE.prepare("DELETE FROM ap_followers WHERE actor_id = ?1").bind(actorId).run();
}

/** Total number of followers, for the followers collection's `totalItems`. */
export async function countFollowers(env: ApEnv): Promise<number> {
	const row = await env.DATABASE.prepare("SELECT COUNT(*) AS total FROM ap_followers").first<{
		total: number;
	}>();
	return row?.total ?? 0;
}

/** List followers in Fedify's native recipient shape. */
export async function listFollowers(env: ApEnv): Promise<Recipient[]> {
	const result = await env.DATABASE.prepare(
		`SELECT ${FOLLOWER_COLUMNS} FROM ap_followers`,
	).all<ApFollowerRow>();
	return (result.results ?? []).map((row) => ({
		id: new URL(row.actor_id),
		inboxId: new URL(row.inbox_url),
		endpoints: { sharedInbox: row.shared_inbox_url ? new URL(row.shared_inbox_url) : null },
	}));
}

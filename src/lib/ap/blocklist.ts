import type { ApEnv } from "@/lib/ap/runtime";

/**
 * The domain blocklist (issues AP-7, AP-8): hosts whose inbound Activities the
 * inbox drops. Enforced in {@link ./inbox} via {@link isDomainBlocked} and
 * managed from the Access-protected dashboard. The canonical schema lives in
 * `scripts/d1/activitypub.sql`.
 */

let ensureSchemaPromise: Promise<void> | null = null;

async function ensureBlocklistSchema(env: ApEnv): Promise<void> {
	if (!ensureSchemaPromise) {
		ensureSchemaPromise = (async () => {
			await env.DATABASE.prepare(
				`CREATE TABLE IF NOT EXISTS ap_blocklist (
					domain TEXT PRIMARY KEY,
					reason TEXT,
					created_at TEXT NOT NULL
				)`,
			).run();
		})();
	}
	return ensureSchemaPromise;
}

/** A blocklist entry as the dashboard reads it. */
export interface BlockedDomain {
	domain: string;
	reason: string | null;
	createdAt: string;
}

/**
 * Extract the lower-cased host of an actor URI (or a bare domain), or `null` if
 * it can't be parsed. Pure — unit-tested. Tolerant of a bare `example.com` by
 * retrying with an `https://` scheme.
 */
export function domainOf(actorId: string): string | null {
	const parse = (value: string): string | null => {
		try {
			return new URL(value).host.toLowerCase() || null;
		} catch {
			return null;
		}
	};
	return parse(actorId) ?? parse(`https://${actorId}`);
}

/** True if the actor URI's host is on the blocklist. */
export async function isDomainBlocked(env: ApEnv, actorId: string): Promise<boolean> {
	const domain = domainOf(actorId);
	if (!domain) return false;
	await ensureBlocklistSchema(env);
	const row = await env.DATABASE.prepare("SELECT 1 AS hit FROM ap_blocklist WHERE domain = ?1")
		.bind(domain)
		.first<{ hit: number }>();
	return row != null;
}

/** List blocked domains, newest-first. */
export async function listBlockedDomains(env: ApEnv): Promise<BlockedDomain[]> {
	await ensureBlocklistSchema(env);
	const result = await env.DATABASE.prepare(
		"SELECT domain, reason, created_at FROM ap_blocklist ORDER BY created_at DESC",
	).all<{ domain: string; reason: string | null; created_at: string }>();
	return (result.results ?? []).map((row) => ({
		domain: row.domain,
		reason: row.reason,
		createdAt: row.created_at,
	}));
}

/**
 * Add (or update the reason of) a blocked domain. The input is normalized to a
 * bare host; returns the stored domain, or `null` if it can't be parsed.
 */
export async function addBlockedDomain(
	env: ApEnv,
	input: { domain: string; reason?: string | null },
): Promise<string | null> {
	const domain = domainOf(input.domain);
	if (!domain) return null;
	await ensureBlocklistSchema(env);
	await env.DATABASE.prepare(
		`INSERT INTO ap_blocklist (domain, reason, created_at)
		 VALUES (?1, ?2, ?3)
		 ON CONFLICT(domain) DO UPDATE SET reason = excluded.reason`,
	)
		.bind(domain, input.reason ?? null, new Date().toISOString())
		.run();
	return domain;
}

/** Remove a domain from the blocklist. No-op if absent. */
export async function removeBlockedDomain(env: ApEnv, domain: string): Promise<void> {
	const normalized = domainOf(domain) ?? domain.toLowerCase();
	await ensureBlocklistSchema(env);
	await env.DATABASE.prepare("DELETE FROM ap_blocklist WHERE domain = ?1").bind(normalized).run();
}

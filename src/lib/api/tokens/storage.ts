import { generateApiToken, sha256 } from "@/lib/api/tokens/crypto";
import type { ApiScope } from "@/lib/api/tokens/scopes";
import { hasRequiredScope, isApiScope } from "@/lib/api/tokens/scopes";
import type { CloudflareAccessUser } from "@/lib/cloudflare-access";
import { getCloudflareEnv } from "@/lib/cloudflare-runtime";

interface ApiTokensEnv {
	DATABASE?: D1Database;
}

export interface StoredApiToken {
	id: string;
	ownerUid: string;
	ownerEmail: string;
	name: string;
	prefix: string;
	scopes: ApiScope[];
	expiresAt: string | null;
	lastUsedAt: string | null;
	revokedAt: string | null;
	createdAt: string;
	updatedAt: string;
	rotatedFromTokenId: string | null;
}

export interface CreatedApiToken {
	token: StoredApiToken;
	secret: string;
}

interface TokenRow {
	id: string;
	owner_uid: string;
	owner_email: string;
	name: string;
	token_prefix: string;
	scopes: string;
	expires_at: string | null;
	last_used_at: string | null;
	revoked_at: string | null;
	created_at: string;
	updated_at: string;
	rotated_from_token_id: string | null;
	token_hash: string;
}

export interface VerifiedApiToken {
	token: StoredApiToken;
	owner: CloudflareAccessUser;
}

export async function listApiTokensForUser(user: CloudflareAccessUser): Promise<StoredApiToken[]> {
	const db = await getApiTokensDb();
	const result = await db
		.prepare(
			`SELECT id, owner_uid, owner_email, name, token_prefix, scopes, expires_at, last_used_at, revoked_at, created_at, updated_at, rotated_from_token_id, token_hash
			 FROM api_tokens
			 WHERE owner_uid = ?
			 ORDER BY created_at DESC`,
		)
		.bind(user.uid ?? user.email)
		.all<TokenRow>();

	return (result.results ?? []).map(mapTokenRow);
}

export async function createApiToken(options: {
	user: CloudflareAccessUser;
	name: string;
	scopes: ApiScope[];
	expiresAt: string | null;
}): Promise<CreatedApiToken> {
	const { user, name, scopes, expiresAt } = options;
	const db = await getApiTokensDb();
	const generated = await generateApiToken();

	await db
		.prepare(
			`INSERT INTO api_tokens (
				id, owner_uid, owner_email, name, token_prefix, token_hash, scopes, expires_at,
				last_used_at, revoked_at, created_at, updated_at, rotated_from_token_id
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL)`,
		)
		.bind(
			generated.id,
			user.uid ?? user.email,
			user.email,
			name,
			generated.prefix,
			generated.hash,
			JSON.stringify(scopes),
			expiresAt,
			generated.createdAt,
			generated.createdAt,
		)
		.run();

	await insertAuditEvent({
		tokenId: generated.id,
		actor: user,
		action: "created",
		metadata: { scopes, expiresAt, name },
	});

	return {
		token: {
			id: generated.id,
			ownerUid: user.uid ?? user.email,
			ownerEmail: user.email,
			name,
			prefix: generated.prefix,
			scopes,
			expiresAt,
			lastUsedAt: null,
			revokedAt: null,
			createdAt: generated.createdAt,
			updatedAt: generated.createdAt,
			rotatedFromTokenId: null,
		},
		secret: generated.secret,
	};
}

export async function updateApiToken(options: {
	user: CloudflareAccessUser;
	tokenId: string;
	name: string;
	scopes: ApiScope[];
	expiresAt: string | null;
}): Promise<StoredApiToken | null> {
	const { user, tokenId, name, scopes, expiresAt } = options;
	const db = await getApiTokensDb();
	const now = new Date().toISOString();

	const existing = await getOwnedTokenRow(user, tokenId);
	if (!existing) {
		return null;
	}

	await db
		.prepare(
			`UPDATE api_tokens
			 SET name = ?, scopes = ?, expires_at = ?, updated_at = ?
			 WHERE id = ? AND owner_uid = ?`,
		)
		.bind(name, JSON.stringify(scopes), expiresAt, now, tokenId, user.uid ?? user.email)
		.run();

	await insertAuditEvent({
		tokenId,
		actor: user,
		action: "updated",
		metadata: { name, scopes, expiresAt },
	});

	return {
		...mapTokenRow(existing),
		name,
		scopes,
		expiresAt,
		updatedAt: now,
	};
}

export async function revokeApiToken(
	user: CloudflareAccessUser,
	tokenId: string,
): Promise<boolean> {
	const db = await getApiTokensDb();
	const existing = await getOwnedTokenRow(user, tokenId);
	if (!existing) {
		return false;
	}

	const now = new Date().toISOString();
	await db
		.prepare(
			`UPDATE api_tokens
			 SET revoked_at = ?, updated_at = ?
			 WHERE id = ? AND owner_uid = ?`,
		)
		.bind(now, now, tokenId, user.uid ?? user.email)
		.run();

	await insertAuditEvent({
		tokenId,
		actor: user,
		action: "revoked",
		metadata: null,
	});

	return true;
}

export async function rotateApiToken(options: {
	user: CloudflareAccessUser;
	tokenId: string;
}): Promise<CreatedApiToken | null> {
	const existing = await getOwnedTokenRow(options.user, options.tokenId);
	if (!existing) {
		return null;
	}

	const db = await getApiTokensDb();
	const now = new Date().toISOString();
	const generated = await generateApiToken();
	const scopes = parseStoredScopes(existing.scopes);

	await db.batch([
		db
			.prepare(
				"UPDATE api_tokens SET revoked_at = ?, updated_at = ? WHERE id = ? AND owner_uid = ?",
			)
			.bind(now, now, options.tokenId, options.user.uid ?? options.user.email),
		db
			.prepare(
				`INSERT INTO api_tokens (
					id, owner_uid, owner_email, name, token_prefix, token_hash, scopes, expires_at,
					last_used_at, revoked_at, created_at, updated_at, rotated_from_token_id
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
			)
			.bind(
				generated.id,
				existing.owner_uid,
				existing.owner_email,
				existing.name,
				generated.prefix,
				generated.hash,
				existing.scopes,
				existing.expires_at,
				generated.createdAt,
				generated.createdAt,
				existing.id,
			),
	]);

	await insertAuditEvent({
		tokenId: existing.id,
		actor: options.user,
		action: "rotated",
		metadata: { replacementTokenId: generated.id },
	});

	await insertAuditEvent({
		tokenId: generated.id,
		actor: options.user,
		action: "created",
		metadata: { rotatedFromTokenId: existing.id },
	});

	return {
		token: {
			id: generated.id,
			ownerUid: existing.owner_uid,
			ownerEmail: existing.owner_email,
			name: existing.name,
			prefix: generated.prefix,
			scopes,
			expiresAt: existing.expires_at,
			lastUsedAt: null,
			revokedAt: null,
			createdAt: generated.createdAt,
			updatedAt: generated.createdAt,
			rotatedFromTokenId: existing.id,
		},
		secret: generated.secret,
	};
}

export async function verifyApiToken(
	secret: string,
	requiredScope: string,
): Promise<VerifiedApiToken | null> {
	const db = await getApiTokensDb();
	const hash = await sha256(secret);
	const result = await db
		.prepare(
			`SELECT id, owner_uid, owner_email, name, token_prefix, scopes, expires_at, last_used_at, revoked_at, created_at, updated_at, rotated_from_token_id, token_hash
			 FROM api_tokens
			 WHERE token_hash = ?
			 LIMIT 1`,
		)
		.bind(hash)
		.first<TokenRow>();

	if (!result) {
		return null;
	}

	if (result.revoked_at) {
		return null;
	}

	if (result.expires_at && new Date(result.expires_at).getTime() <= Date.now()) {
		return null;
	}

	const scopes = parseStoredScopes(result.scopes);
	if (!hasRequiredScope(scopes, requiredScope)) {
		return null;
	}

	const now = new Date().toISOString();
	void db
		.prepare("UPDATE api_tokens SET last_used_at = ?, updated_at = ? WHERE id = ?")
		.bind(now, now, result.id)
		.run();

	return {
		token: mapTokenRow(result),
		owner: {
			email: result.owner_email,
			name: undefined,
			uid: result.owner_uid,
			common_name: undefined,
		},
	};
}

async function getApiTokensDb(): Promise<D1Database> {
	const runtimeEnv = await getCloudflareEnv<ApiTokensEnv>();
	if (!runtimeEnv.DATABASE) {
		throw new Error("DATABASE is not configured");
	}

	return runtimeEnv.DATABASE;
}

async function getOwnedTokenRow(
	user: CloudflareAccessUser,
	tokenId: string,
): Promise<TokenRow | null> {
	const db = await getApiTokensDb();
	const result = await db
		.prepare(
			`SELECT id, owner_uid, owner_email, name, token_prefix, scopes, expires_at, last_used_at, revoked_at, created_at, updated_at, rotated_from_token_id, token_hash
			 FROM api_tokens
			 WHERE id = ? AND owner_uid = ?
			 LIMIT 1`,
		)
		.bind(tokenId, user.uid ?? user.email)
		.first<TokenRow>();

	return result ?? null;
}

async function insertAuditEvent(options: {
	tokenId: string;
	actor: CloudflareAccessUser;
	action: string;
	metadata: unknown;
}) {
	const db = await getApiTokensDb();
	await db
		.prepare(
			`INSERT INTO api_token_audit_events (id, token_id, actor_uid, actor_email, action, created_at, metadata)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			crypto.randomUUID(),
			options.tokenId,
			options.actor.uid ?? options.actor.email,
			options.actor.email,
			options.action,
			new Date().toISOString(),
			options.metadata ? JSON.stringify(options.metadata) : null,
		)
		.run();
}

function mapTokenRow(row: TokenRow): StoredApiToken {
	return {
		id: row.id,
		ownerUid: row.owner_uid,
		ownerEmail: row.owner_email,
		name: row.name,
		prefix: row.token_prefix,
		scopes: parseStoredScopes(row.scopes),
		expiresAt: row.expires_at,
		lastUsedAt: row.last_used_at,
		revokedAt: row.revoked_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		rotatedFromTokenId: row.rotated_from_token_id,
	};
}

function parseStoredScopes(value: string): ApiScope[] {
	const parsed = JSON.parse(value) as unknown;
	if (!Array.isArray(parsed)) {
		return [];
	}

	return parsed.filter(
		(entry): entry is ApiScope => typeof entry === "string" && isApiScope(entry),
	);
}

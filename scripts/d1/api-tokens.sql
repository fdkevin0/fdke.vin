CREATE TABLE IF NOT EXISTS api_tokens (
	id TEXT PRIMARY KEY,
	owner_uid TEXT NOT NULL,
	owner_email TEXT NOT NULL,
	name TEXT NOT NULL,
	token_prefix TEXT NOT NULL,
	token_hash TEXT NOT NULL UNIQUE,
	scopes TEXT NOT NULL,
	expires_at TEXT,
	last_used_at TEXT,
	revoked_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	rotated_from_token_id TEXT,
	FOREIGN KEY (rotated_from_token_id) REFERENCES api_tokens(id)
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_owner_uid ON api_tokens(owner_uid);
CREATE INDEX IF NOT EXISTS idx_api_tokens_token_hash ON api_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_api_tokens_revoked_at ON api_tokens(revoked_at);

CREATE TABLE IF NOT EXISTS api_token_audit_events (
	id TEXT PRIMARY KEY,
	token_id TEXT NOT NULL,
	actor_uid TEXT NOT NULL,
	actor_email TEXT NOT NULL,
	action TEXT NOT NULL,
	created_at TEXT NOT NULL,
	metadata TEXT,
	FOREIGN KEY (token_id) REFERENCES api_tokens(id)
);

CREATE INDEX IF NOT EXISTS idx_api_token_audit_token_id ON api_token_audit_events(token_id);

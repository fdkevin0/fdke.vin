-- ActivityPub Notes (see CONTEXT.md "Federation" and docs/adr/0002-*).
-- A Note is a D1 row keyed by an opaque, time-sortable ULID (the Note id).

CREATE TABLE IF NOT EXISTS ap_notes (
	id TEXT PRIMARY KEY,             -- ULID; canonical Note id and /notes/{id}/ segment
	title TEXT,                      -- optional display title
	content TEXT NOT NULL,           -- markdown source (rendered SSR + serialized to AS2)
	summary TEXT,                    -- optional AS2 summary
	published_at TEXT NOT NULL,      -- ISO 8601
	updated_at TEXT NOT NULL,        -- ISO 8601
	created_at TEXT NOT NULL,        -- ISO 8601
	source TEXT NOT NULL DEFAULT 'migration'  -- 'migration' | 'telegram' | 'dashboard'
);

CREATE INDEX IF NOT EXISTS idx_ap_notes_published_at ON ap_notes(published_at);

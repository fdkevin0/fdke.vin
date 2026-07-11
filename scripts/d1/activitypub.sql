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
	source TEXT NOT NULL DEFAULT 'migration',  -- 'migration' | 'telegram' | 'dashboard'
	telegram_chat_id INTEGER,        -- authoring Telegram channel/chat id (NULL for non-Telegram)
	telegram_message_id INTEGER      -- authoring Telegram message id; edits look up the Note by (chat, message)
);

CREATE INDEX IF NOT EXISTS idx_ap_notes_published_at ON ap_notes(published_at);

-- One Note per authoring channel message, so an edit updates rather than duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ap_notes_telegram
	ON ap_notes(telegram_chat_id, telegram_message_id)
	WHERE telegram_chat_id IS NOT NULL;

-- Media attachments on a Note (channel-post photos stored to R2).
-- Rendered as <img> on the SSR page and serialized as AS2 `Document` objects.
CREATE TABLE IF NOT EXISTS ap_note_attachments (
	id TEXT PRIMARY KEY,             -- ULID
	note_id TEXT NOT NULL REFERENCES ap_notes(id) ON DELETE CASCADE,
	r2_key TEXT NOT NULL,            -- R2 object key (bucket AP_BUCKET)
	url TEXT NOT NULL,               -- serving URL (/api/ap/media/{r2_key})
	media_type TEXT NOT NULL,        -- IANA media type, e.g. image/jpeg
	name TEXT,                       -- optional alt text / display name
	width INTEGER,
	height INTEGER,
	position INTEGER NOT NULL DEFAULT 0  -- ordering within a Note
);

CREATE INDEX IF NOT EXISTS idx_ap_note_attachments_note ON ap_note_attachments(note_id, position);

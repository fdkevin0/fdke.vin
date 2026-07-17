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
	telegram_message_id INTEGER,     -- authoring Telegram message id; edits look up the Note by (chat, message)
	telegram_media_group_id TEXT     -- authoring Album's media_group_id (NULL for non-Album Notes)
);

CREATE INDEX IF NOT EXISTS idx_ap_notes_published_at ON ap_notes(published_at);

-- One Note per authoring channel message, so an edit updates rather than duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ap_notes_telegram
	ON ap_notes(telegram_chat_id, telegram_message_id)
	WHERE telegram_chat_id IS NOT NULL;

-- One Note per Album, so a straggler photo or an edit finalizes into the same Note.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ap_notes_telegram_group
	ON ap_notes(telegram_chat_id, telegram_media_group_id)
	WHERE telegram_media_group_id IS NOT NULL;

-- Pending albums (see CONTEXT.md "Pending album" and issue AP-11): one row per
-- photo of a not-yet-finalized Album, written durably before the webhook
-- responds 200. Finalization assembles a group's rows into one Note (deleting
-- the rows), so a group's presence here is exactly its "not yet finalized"
-- state. Idempotent under Telegram's at-least-once delivery via the unique
-- (chat, message) index — a redelivered album message is a no-op insert.
CREATE TABLE IF NOT EXISTS ap_pending_album_photos (
	id TEXT PRIMARY KEY,             -- ULID; this row's id
	group_id TEXT NOT NULL,          -- Telegram media_group_id
	chat_id INTEGER NOT NULL,        -- Telegram channel/chat id
	message_id INTEGER NOT NULL,     -- Telegram message id of this photo
	file_id TEXT NOT NULL,           -- Telegram file id (resolved to bytes at finalization)
	file_unique_id TEXT NOT NULL,
	media_type TEXT NOT NULL,        -- IANA media type, e.g. image/jpeg
	width INTEGER NOT NULL,
	height INTEGER NOT NULL,
	content TEXT NOT NULL DEFAULT '', -- markdown from this message's caption; '' if it carried none
	publish_date TEXT NOT NULL,      -- ISO 8601, from this message's Telegram date
	arrived_at TEXT NOT NULL         -- ISO 8601, ingest time (the debounce clock)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ap_pending_album_photos_message
	ON ap_pending_album_photos(chat_id, message_id);

CREATE INDEX IF NOT EXISTS idx_ap_pending_album_photos_group
	ON ap_pending_album_photos(chat_id, group_id);

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
	position INTEGER NOT NULL DEFAULT 0,  -- ordering within a Note
	telegram_message_id INTEGER      -- authoring Album message (NULL for non-Album attachments)
);

CREATE INDEX IF NOT EXISTS idx_ap_note_attachments_note ON ap_note_attachments(note_id, position);

-- One row per (Note, R2 object), so re-appending the same photo (a retried
-- Album finalize, a redelivered straggler) is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ap_note_attachments_r2key
	ON ap_note_attachments(note_id, r2_key);

-- One attachment per (Note, authoring Album message), so editing a photo
-- within an already-finalized Album replaces it in place instead of
-- appending a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ap_note_attachments_message
	ON ap_note_attachments(note_id, telegram_message_id)
	WHERE telegram_message_id IS NOT NULL;

-- Followers (see CONTEXT.md "Follower" and issue AP-5): remote actors that sent
-- an accepted Follow. Delivery fans out to shared_inbox_url where present
-- (deduped across a server), otherwise inbox_url.
CREATE TABLE IF NOT EXISTS ap_followers (
	actor_id TEXT PRIMARY KEY,       -- remote actor URI
	inbox_url TEXT NOT NULL,         -- the follower's personal inbox
	shared_inbox_url TEXT,           -- endpoints.sharedInbox, if advertised
	created_at TEXT NOT NULL         -- ISO 8601
);

-- Interactions (see CONTEXT.md "Interaction" and issue AP-7): remote reactions to
-- one of our Notes, ingested via the inbox. A 'reply' is a Create(Note) in-reply-to
-- a Note (its sanitized HTML renders as a thread); a 'like'/'announce' renders as a
-- count. Rows are removed on Undo (matched by activity_id) and tombstoned on Delete
-- (matched by object_id). `hidden` lets the author moderate a stored reply (AP-8).
CREATE TABLE IF NOT EXISTS ap_interactions (
	id TEXT PRIMARY KEY,             -- ULID; our row id
	activity_id TEXT,                -- remote Activity URI (matched on Undo)
	note_id TEXT NOT NULL,           -- local Note id the interaction targets
	kind TEXT NOT NULL,              -- 'reply' | 'like' | 'announce'
	actor_id TEXT NOT NULL,          -- remote actor URI
	actor_name TEXT,                 -- remote actor display name
	actor_handle TEXT,               -- @user@domain, when derivable
	actor_avatar_url TEXT,           -- proxied avatar URL (/api/ap/media/...), or NULL
	object_id TEXT,                  -- reply: the remote Note URI (matched on Delete)
	content TEXT,                    -- reply: sanitized HTML; NULL for like/announce
	url TEXT,                        -- link to the remote object, when advertised
	published_at TEXT,               -- ISO 8601, when advertised
	created_at TEXT NOT NULL,        -- ISO 8601 (ingest time)
	hidden INTEGER NOT NULL DEFAULT 0  -- 1 = moderated out (does not render)
);

CREATE INDEX IF NOT EXISTS idx_ap_interactions_note ON ap_interactions(note_id, kind);
CREATE INDEX IF NOT EXISTS idx_ap_interactions_activity ON ap_interactions(activity_id);
CREATE INDEX IF NOT EXISTS idx_ap_interactions_object ON ap_interactions(object_id);
-- One row per (actor, kind, note, object) so a re-sent Like/Announce is idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ap_interactions_unique
	ON ap_interactions(note_id, actor_id, kind, object_id);

-- Domain blocklist (see issue AP-7/AP-8): inbound Activities whose actor's host is
-- listed here are dropped at the inbox. Managed from the Access-protected dashboard.
CREATE TABLE IF NOT EXISTS ap_blocklist (
	domain TEXT PRIMARY KEY,         -- lower-cased host, e.g. spam.example
	reason TEXT,                     -- optional operator note
	created_at TEXT NOT NULL         -- ISO 8601
);

-- Per-inbox delivery status (see issue AP-8): the dashboard aggregates these into a
-- Note's federation/delivery status. Keyed by (note, inbox) so the current status of
-- the latest activity to each follower inbox is what's shown.
CREATE TABLE IF NOT EXISTS ap_note_deliveries (
	note_id TEXT NOT NULL,           -- the Note delivered
	inbox_url TEXT NOT NULL,         -- the target follower inbox
	kind TEXT NOT NULL,              -- 'Create' | 'Update' | 'Delete'
	status TEXT NOT NULL,            -- 'pending' | 'delivered' | 'failed'
	attempts INTEGER NOT NULL DEFAULT 0,
	last_error TEXT,
	updated_at TEXT NOT NULL,        -- ISO 8601
	PRIMARY KEY (note_id, inbox_url)
);

CREATE INDEX IF NOT EXISTS idx_ap_note_deliveries_note ON ap_note_deliveries(note_id);

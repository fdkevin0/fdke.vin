CREATE TABLE IF NOT EXISTS rss_feeds (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	feed_url TEXT NOT NULL UNIQUE,
	site_url TEXT,
	is_active INTEGER NOT NULL DEFAULT 1,
	last_fetched_at TEXT,
	last_error TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	created_by_email TEXT NOT NULL,
	updated_by_email TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rss_feeds_active ON rss_feeds(is_active);

CREATE TABLE IF NOT EXISTS rss_feed_items (
	id TEXT PRIMARY KEY,
	feed_id TEXT NOT NULL,
	guid_hash TEXT NOT NULL UNIQUE,
	title TEXT NOT NULL,
	title_en TEXT,
	url TEXT NOT NULL,
	author TEXT,
	published_at TEXT,
	visible_until TEXT,
	click_count INTEGER NOT NULL DEFAULT 0,
	excerpt TEXT,
	source_language TEXT,
	description TEXT,
	description_en TEXT,
	ai_status TEXT NOT NULL DEFAULT 'pending',
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	FOREIGN KEY (feed_id) REFERENCES rss_feeds(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rss_feed_items_feed_id ON rss_feed_items(feed_id);
CREATE INDEX IF NOT EXISTS idx_rss_feed_items_published_at ON rss_feed_items(published_at);
CREATE INDEX IF NOT EXISTS idx_rss_feed_items_visible_until ON rss_feed_items(visible_until);
CREATE INDEX IF NOT EXISTS idx_rss_feed_items_ai_status ON rss_feed_items(ai_status);

CREATE TABLE IF NOT EXISTS rss_ingest_runs (
	id TEXT PRIMARY KEY,
	day_utc TEXT NOT NULL,
	trigger TEXT NOT NULL,
	status TEXT NOT NULL,
	feed_count INTEGER NOT NULL DEFAULT 0,
	success_count INTEGER NOT NULL DEFAULT 0,
	failure_count INTEGER NOT NULL DEFAULT 0,
	triggered_by_email TEXT,
	started_at TEXT NOT NULL,
	completed_at TEXT,
	updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rss_ingest_runs_day ON rss_ingest_runs(day_utc);

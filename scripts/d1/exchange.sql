-- Bank of China exchange-rate history, appended by the BOC poll cron
-- (src/lib/api/exchange/poll.ts) and read by /api/exchange/* and /tools/exchange.
--
-- The (currency, pub_time) primary key is the backstop that makes a repeat write
-- a no-op; boc_poll_state below is what stops the poller from making those writes
-- in the first place.
--
-- This table already exists in production — it was created and populated by the
-- fdkevin-bot Worker, which shares this D1 database. The script is idempotent
-- and is here so the schema has an owner in this repo.
CREATE TABLE IF NOT EXISTS boc_rate_history (
	currency TEXT NOT NULL,
	pub_time TEXT NOT NULL,
	buying_rate REAL,
	cash_buying_rate REAL,
	selling_rate REAL,
	cash_selling_rate REAL,
	middle_rate REAL,
	PRIMARY KEY (currency, pub_time)
);

-- The poll watermark: the last publication round the poller stored. BOC advances
-- every currency together, so one row is enough for all 40 — the CHECK constraint
-- pins it to that one row. Read once per poll so a run that falls between rounds
-- (most of them) writes nothing at all.
--
-- last_row_count is how many rows of that round actually landed. The poller drops
-- rows it cannot parse, so a round can land incomplete; without the count, the
-- watermark would skip that round forever and the missing currencies would never
-- be stored.
--
-- The poller creates this table lazily too (src/lib/api/exchange/poll.ts), so a
-- deploy that lands before this script runs still works; the CREATE here is what
-- gives the schema an owner in this repo.
CREATE TABLE IF NOT EXISTS boc_poll_state (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	last_pub_time TEXT NOT NULL,
	last_row_count INTEGER NOT NULL
);

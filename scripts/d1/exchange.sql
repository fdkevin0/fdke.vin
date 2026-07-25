-- Bank of China exchange-rate history, appended by the BOC poll cron
-- (src/lib/api/exchange/poll.ts) and read by /api/exchange/* and /tools/exchange.
--
-- The (currency, pub_time) primary key is what makes a repeat poll a no-op: the
-- poller inserts every currency on every run with INSERT OR IGNORE, and only a
-- publication time we have not seen before actually lands.
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

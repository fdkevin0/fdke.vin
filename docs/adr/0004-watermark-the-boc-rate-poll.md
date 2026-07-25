# 4. Watermark the BOC rate poll

Date: 2026-07-25

## Status

Accepted

## Context

`docs/adr/0003` adopted the poller from `fdkevin-bot` with its `*/2` cadence
unchanged, and recorded the cost as a follow-up: the poll inserts all 40
currencies with `INSERT OR IGNORE` on every run, so at 720 runs a day it issues
~28,800 insert statements to store the ~120 rows BOC actually publishes. About
99.6% of those statements are conflicts that write nothing (issue #74).

The reason the poll could not know it had nothing to do is that nothing in the
code held the answer. "Is this publication new?" was delegated to the
`(currency, pub_time)` primary key, so the only way to ask was to write all 40
rows and count how many survived.

## Decision

Keep a **poll watermark** — the last **publication round** stored — in a
single-row D1 table, `boc_poll_state`, and read it before writing anything.
`CONTEXT.md` gains _Publication round_ as a term: a _Publication_ is one
currency's row, and the thing the poll actually decides about is the whole
40-currency page sharing one `pub_time`.

- `recordPublicationRound` reads the watermark, compares it against the fetched
  page, and returns early when they match. A run between rounds is one single-row
  read and zero writes.
- The watermark stores the round's `pub_time` **and its row count**, and two
  guards must both pass before a poll skips:
  - _every_ row on the page sits at the watermark's `pub_time`, not merely no
    newer than it. BOC advances all currencies together, so this is normally one
    comparison; the stricter form means a currency that somehow lagged behind
    still gets written rather than skipped along with the rest.
  - the page holds no more rows than we stored. This is the one that matters:
    `parseBocRates` silently drops rows it cannot read, so a round can land
    incomplete, and once the poll stops writing, the primary key can no longer
    heal it. Without the count, a round that landed with 5 of 40 currencies would
    be skipped forever and the other 35 never stored.
- The watermark advances in the _same_ `batch` as the row inserts. D1 runs a
  batch as one transaction, so it cannot move past rows that failed to land. Its
  `ON CONFLICT … WHERE last_pub_time < ?1 OR (last_pub_time = ?1 AND last_row_count < ?2)`
  guard keeps it monotonic in both dimensions: a stale page cannot rewind it and
  hide a later round, but a fuller read of the round we are already on raises the
  count.
- `pub_time` is a zero-padded `YYYY/MM/DD HH:MM:SS`, so watermark comparisons are
  plain string comparisons — no parsing, and no second representation of a value
  that ADR-0003 already established must be handled byte-for-byte.
- The cadence drops from `*/2` to `*/15` (`BOC_POLL_CRON` and `triggers.crons`
  must stay in sync). At ~3 rounds a day this cannot miss one; it only bounds how
  stale a stored round can be, by 15 minutes.
- The table is created lazily by the poller as well as by
  `scripts/d1/exchange.sql`, matching the `ap_*` modules — but only on the
  **write** path. A `*/15` cron mostly gets a cold isolate, so ensuring the
  schema on the read path would put a `CREATE TABLE IF NOT EXISTS` in front of
  nearly every poll and double the statement count it exists to cut. The read
  instead treats its own failure as "no watermark", which degrades to the
  pre-watermark behaviour and is repaired by the next write.

## Consequences

- A no-op poll costs one row read instead of 40 insert statements, and there are
  96 of them a day instead of 720: ~28,800 statements/day becomes ~96 reads plus
  ~123 writes on the ~3 rounds a day. The reads were left in place rather than
  cached in isolate memory — an in-memory watermark would make warm runs
  literally free, but at 96 single-row reads a day it buys little and adds state
  whose lifetime nothing in the code controls.
- Freshness is now an explicit decision in one module rather than a property of
  the schema, and it survives a further cadence change.
- The primary key is still the backstop, but it is no longer the _only_ one: once
  the poll can decline to write, a row it never wrote can no longer be healed by
  a later conflict. That is what the row-count guard restores. Losing the
  watermark row (or the table) is still safe — it only returns the poll to
  writing all 40 rows per run.
- A page whose rows carry mixed `pub_time`s can never satisfy the skip check, so
  it would write all 41 statements on every run indefinitely. This is the
  deliberate conservative direction — never skip a row we may not hold — and it
  should not arise while BOC advances all currencies together.
- Detection of a new round is up to 15 minutes late. `pub_time` is BOC's own
  timestamp, so the stored series is unaffected; only the delay between BOC
  publishing and the site serving it grows.
- `boc_rate_history` still grows ~44k rows/year unpruned, and the paginated read
  path still does a full-table `count(*)` and an unindexed `ORDER BY pub_time`.
  ADR-0003 flagged both; neither is addressed here.

# 1. Keep `rss_`-prefixed D1 table names for the feed aggregator

Date: 2026-07-04

## Status

Accepted

## Context

"RSS" names two unrelated things in this codebase: the site's own feeds
(`src/lib/rss.ts`, the `rss.xml` routes) and the feed *aggregator*
(`src/lib/feed`, a D1 + Durable Object + queues + Workers AI feed reader).
An architecture review proposed renaming the aggregator's D1 tables
(`rss_feeds`, `rss_feed_items`, and related) to drop the collision.

## Decision

Rename only the setup script (`scripts/d1/feed-aggregator.sql`) and keep the
production D1 table names as they are.

## Consequences

- Renaming the tables would require an ALTER TABLE migration against live
  production data — the naming nicety does not justify that risk.
- The `rss_` prefix in SQL remains a known misnomer: those tables belong to
  the feed aggregator, not the site's feeds. Future architecture reviews
  should not re-propose the rename unless a data migration is already
  happening for other reasons.

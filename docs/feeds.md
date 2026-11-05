# Feeds

## Site feeds

A **Site feed** publishes this site's own content. [src/lib/rss.ts](../src/lib/rss.ts) builds the blog feed at `/rss.xml` and the Notes feed at `/notes/rss.xml`. Blog feeds use [Post resolution](content.md#translation-selection); Notes come from [ActivityPub storage](activitypub.md).

## Feed aggregator and `/reading`

The **Feed aggregator** ingests external RSS/Atom/JSON feeds into D1, optionally translates titles and summaries into English with Workers AI, and serves a rolling 24-hour reading list at `/reading`. It is separate from the Site feeds despite its `rss_`-prefixed tables.

Implementation lives in [src/lib/feed](../src/lib/feed/); resource bindings and cron expressions live in [wrangler.jsonc](../wrangler.jsonc):

- **Ingestion**: The hourly cron (`0 * * * *`) or `POST /api/feed/sync` triggers the `FEED_COORDINATOR` Durable Object, which tracks the active run in Durable Object storage, reuses an in-progress run rather than overlapping work, sets a 30-minute alarm to recover timed-out runs, and dispatches per-feed messages to `RSS_FETCH_QUEUE`. Each feed fetch processes up to 30 entries, deduplicating items by `guid_hash` (`sha256Hex("{feedId}:{entry.id}")`) in `rss_feed_items`.
- **AI translation**: Items from feeds with `ai_translation_enabled` are queued on `RSS_AI_QUEUE` and translated with `@cf/google/gemma-3-12b-it` (summaries truncated to 4,000 characters). Re-fetched entries reset `ai_status` to `'pending'` only when `title` or `summary` changes.
- **Public reading list**: `/reading` ([reading.astro](../src/pages/reading.astro)) and `GET /api/reading` return items whose `visible_until` window (initially `created_at + 24 hours`) has not expired, with original/translated display toggles. Opening an item calls unauthenticated `POST /api/reading/click` to increment `click_count` and extend `visible_until` by 24 hours.
- **Dashboard management**: `/dashboard/feed` manages sources and translations via Access-protected routes `GET/POST /api/feed/sources` (including client-side OPML parsing that submits each feed URL), `PATCH/DELETE /api/feed/sources/[id]`, `POST /api/feed/sync`, and `GET/POST /api/feed/items/ai-retry`.

## Storage and design

The schema is in [0004_feed_aggregator.sql](../migrations/0004_feed_aggregator.sql) (with the unused `rss_ingest_runs` table dropped in [0006_drop_unused_tables.sql](../migrations/0006_drop_unused_tables.sql)). Keep the existing production names `rss_feeds` and `rss_feed_items`: renaming them solely for terminology would require migrating live data with little functional benefit. Revisit names only when a necessary data migration justifies the change.

Use "Site feed" for published content and "Feed aggregator" for the reader subsystem in documentation and design discussions, so the shared RSS format does not obscure their separate responsibilities.

# Feeds

## Site feeds

A **Site feed** publishes this site's own content. [src/lib/rss.ts](../src/lib/rss.ts) builds the blog feed at `/rss.xml` and the Notes feed at `/notes/rss.xml`. Blog feeds use [Post resolution](content.md#translation-selection); Notes come from [ActivityPub storage](activitypub.md).

## Feed aggregator

The **Feed aggregator** reads external feeds into D1, optionally translates them with Workers AI, and serves them to the dashboard. It is separate from the Site feeds despite its `rss_`-prefixed tables.

Implementation lives in [src/lib/feed](../src/lib/feed/). The hourly cron triggers the `FEED_COORDINATOR` Durable Object, which tracks an ingestion run and dispatches fetch work to `RSS_FETCH_QUEUE`. Fetched entries are deduplicated by `guid_hash` and stored in D1 (`rss_feed_items`) with a 24-hour `visible_until` reading window that extends on interaction. Translation work uses `RSS_AI_QUEUE` (`RSS_BUCKET` is bound in [wrangler.jsonc](../wrangler.jsonc) but not currently used by the Worker).

The coordinator reuses an active run rather than starting overlapping work and uses an alarm to recover timed-out runs. Fetch and translation failures are handled through the queue processing path in [src/worker.ts](../src/worker.ts).

## Storage and design

The schema is in [0004_feed_aggregator.sql](../migrations/0004_feed_aggregator.sql). Keep the existing production names such as `rss_feeds` and `rss_feed_items`: renaming them solely for terminology would require migrating live data with little functional benefit. Revisit names only when a necessary data migration justifies the change.

Use "Site feed" for published content and "Feed aggregator" for the reader subsystem in documentation and design discussions, so the shared RSS format does not obscure their separate responsibilities.

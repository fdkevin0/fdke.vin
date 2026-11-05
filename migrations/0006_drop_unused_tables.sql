-- FeedCoordinator Durable Object storage owns active feed run state, and
-- api_tokens columns already record token lifecycle timestamps.
DROP TABLE IF EXISTS rss_ingest_runs;
DROP TABLE IF EXISTS api_token_audit_events;

-- Fedify and Cloudflare Queues own delivery/retry state; the dashboard no longer
-- maintains a second per-inbox status ledger.
DROP TABLE IF EXISTS ap_note_deliveries;

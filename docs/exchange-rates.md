# Exchange rates

The exchange tool at `/tools/exchange` reads Bank of China (BOC) rates collected by this Worker. Implementation lives in [src/lib/api/exchange](../src/lib/api/exchange/) and the schema in [0003_exchange.sql](../migrations/0003_exchange.sql).

## Latest-rate API

- `GET /api/exchange/currencies` returns the stored currency names.
- `GET /api/exchange/rates?currency=USD&limit=30` returns an array of the latest records for one currency, newest first. Currency is required and normalized to uppercase; limit defaults to 30 and must be a positive integer, capped at 1000 by the query.
- Missing currency or invalid limit returns 400; no stored rows returns 404. Results use `Cache-Control: no-store`.

The read performs one currency-filtered query using the `(currency, pub_time)` primary key. There is no total count, offset, date-range filter, or pagination metadata. The standalone `pub_time` index remains in the migration from an earlier query design; it does not imply support for currency-less queries.

## Publications and polling

A **Publication** is one currency's seven-cell row on the BOC page, identified by `(currency, pub_time)`. A **Publication round** groups rows with the same publication time. A **Rate metric** is one of `buying_rate`, `cash_buying_rate`, `selling_rate`, `cash_selling_rate`, or `middle_rate`; blank or invalid numeric cells are stored as `NULL`, not zero.

A **Rate poll** fetches, parses, and appends publications. It runs on `*/15 * * * *`; `BOC_POLL_CRON` and `triggers.crons` must stay in sync. This polls the currently published page, so it cannot reconstruct intermediate publications if the source changes between successful polls.

**Rate history** is append-only in `boc_rate_history`, with no pruning or rollup. Polling and reads are owned here rather than split across this site and the former bot. Telegram rate commands and threshold alerts are outside this feature; the legacy `boc_rate_alerts` table was left untouched for recovery, and is not used by this code.

## Poll watermark

The **Poll watermark** in `boc_poll_state` records the last stored publication time and row count. A poll skips writes only when every parsed row has that exact time and the fetched row count is no greater than the stored count.

The count matters: a partial parse must not permanently hide currencies that become readable on a later fetch. Mixed publication times deliberately fail the skip check. Row inserts and watermark advancement share one [D1 batch transaction](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch); the update guard prevents older times or smaller counts from rewinding the watermark.

A missing watermark row or failed read falls back to inserting rows with primary-key conflict protection. The schema must already be installed through migrations: application requests do not create tables, and a missing table can still make the write fail.

## Parser compatibility

The streaming `HTMLRewriter` parser uses start tags to close prior rows and cells because BOC markup may omit closing tags. One `td` text handler receives nested text; adding a second `td *` handler would duplicate it. Character references are decoded before parsing.

Keep `pub_time` compatible with existing keys: remove non-breaking spaces instead of converting them to ordinary spaces, and trim the result. Changing that representation can insert duplicate historical publications. Zero-padded `YYYY/MM/DD HH:MM:SS` strings are compared directly by the watermark.

## Testing

The query and poll take injected D1 dependencies for Node tests using [fake-d1.ts](../src/lib/testing/fake-d1.ts). The parser's `HTMLRewriter` integration needs a Workers runtime; Node tests exercise the row parsing and persistence behavior through their respective seams.

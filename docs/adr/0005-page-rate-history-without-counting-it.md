# 5. Page rate history without counting it

Date: 2026-07-25

## Status

Accepted

## Context

`queryBocRateHistory` served `/api/exchange/rates` with two statements: a
`SELECT count(*)` over the whole filtered table to build `pagination.total`, then
the page itself with `ORDER BY pub_time DESC LIMIT ? OFFSET ?` (issue #75).

`boc_rate_history` carries only the `(currency, pub_time)` primary key. Its
leading column is `currency`, so a query that does not filter by one has nothing
to sort or range-scan on. Confirmed against SQLite: both the currency-less page
and a `start`/`end` range fell back to a full scan plus a `USE TEMP B-TREE FOR
ORDER BY`.

The UI mitigated this by accident — `ExchangeRates.astro`'s currency select
defaults to `USD`, so every call it makes is covered by the primary key. The scan
only happened on a currency-less call, which the endpoint accepts and nothing in
this repo makes. ADR-0003 flagged the read path; ADR-0004 addressed the write
side and explicitly left this.

## Decision

Two changes, one to the schema and one to the response.

**Index `pub_time`.** `idx_boc_rate_history_pub_time` gives the currency-less
sort and the `start`/`end` range something to work on. Verified by query plan: the
scan-plus-temp-B-tree becomes an index scan, and the range becomes a `SEARCH`.
The currency-filtered call the UI actually makes is unaffected — it still uses the
primary key. The index is ensured from the poll's write path
(`ensureExchangeSchema`), not the read path, because the poll is the only code
that touches this table on a schedule and a read-path DDL would sit in front of
every API request.

**Drop `total` and `totalPages` from the response**, in favour of reading
`pageSize + 1` rows and reporting the extra one as `hasNextPage`. This removes
the `count(*)` outright rather than making it cheaper: an index makes a count
faster but leaves it O(rows matched), and it was producing a number the UI
displayed and nothing acted on.

This is a **breaking change** to `/api/exchange/rates`, taken deliberately. The
endpoint is unauthenticated and public, but it is undocumented, and
`ExchangeRates.astro` is its only known caller; it now shows "Showing 30 latest"
and "Page 1 · More available" instead of "30 / 1240" and "Page 1 / 42".

The SQL moved into `queryBocRateHistoryFrom(db, options)`, which takes the
database instead of resolving the binding through `cloudflare:workers`.
`queryBocRateHistory` is the binding-resolving edge callers keep using. The split
exists so the statements the read issues are assertable in a node test run, the
same reason ADR-0004 split the poll — though the unit differs, a `D1Database`
here against an `Env` there, because the poll needs the binding for `batch`. The
D1 stand-in both test files use now lives in `src/lib/testing/fake-d1.ts`.

## Consequences

- A rate-history request is one statement instead of two, and no request scans
  more rows than the page it returns.
- Callers can no longer learn how many rows match, only whether another page
  exists. Anyone needing a total must count for themselves. Restoring it would
  mean restoring the scan, so the shape is the decision.
- The 404 for an unknown currency now fires only on page 1, where an empty result
  still proves the currency has nothing stored. An empty later page means the
  caller paged off the end — a 200 before this change, and still one.
- The index costs a write per inserted row, against ~120 inserts a day (ADR-0004),
  and a one-off build over the existing rows the first time the poll ensures it.
- Ensuring it from the write path means it does **not** exist at deploy time: the
  poll skips that path whenever the watermark says the round is already stored, so
  the index lands whenever BOC next publishes — hours later. That is acceptable
  because it is a performance fix on a path nothing in this repo calls, and the
  read is correct either way. Running `scripts/d1/exchange.sql` puts it in place
  immediately for anyone who does not want to wait.
- `boc_rate_history` still grows ~44k rows/year with nothing pruning or rolling it
  up. Deep `OFFSET` paging still walks the rows it skips; at this size neither is
  worth more than the note ADR-0003 already made.

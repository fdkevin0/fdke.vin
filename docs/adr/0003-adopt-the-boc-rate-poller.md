# 3. Adopt the BOC rate poller from fdkevin-bot

Date: 2026-07-25

## Status

Accepted

## Context

`boc_rate_history` has always been written by a different Worker. The
`fdkevin-bot` project shares this exact D1 database (`c623d6ec-…`, bound there as
`DB` and here as `DATABASE`) and ran a `*/2` cron that scraped the Bank of China
published-rates page into that table.

This repo already owned the whole read side — `src/lib/api/exchange/boc.ts`,
`/api/exchange/rates`, `/api/exchange/currencies`, and `/tools/exchange` — but
none of the writes. The table's producer and its consumers lived in two repos
with no shared code, only a shared table name.

The bot's exchange feature also carried a Telegram surface: `/rate`,
`/rate_chart`, `/rate_alert`, `/rate_best`, `/rate_alerts`,
`/cancel_rate_alert`, plus threshold alert subscriptions in `boc_rate_alerts`
and alert notifications delivered to subscriber chats.

## Decision

Take over the poll here and let the bot drop the feature entirely.

- `src/lib/api/exchange/poll.ts` fetches and parses the BOC page and appends new
  publications, on a second cron (`*/2 * * * *`). `src/worker.ts` branches on
  `controller.cron` to tell it from the hourly feed run.
- The parser uses `HTMLRewriter` rather than porting the bot's `cheerio` call —
  no new dependency, and the page streams. Two behaviours of `HTMLRewriter`
  shaped the implementation and are load-bearing:
  - a `text` handler fires for the matched element's **whole subtree**, so a
    second `td *` handler would append every chunk twice;
  - text chunks are **undecoded source text**, so `&nbsp;` arrives literally and
    the parser decodes character references itself.
- Only *start* tags drive the row/cell state machine. `</td>` and `</tr>` are
  optional in HTML and BOC's markup cannot be relied on to emit them.
- **The Telegram surface is not migrated.** It is deleted from the bot and not
  rebuilt here.

## Consequences

- The producer and consumers of `boc_rate_history` now live in one repo.
- Threshold rate alerts no longer exist anywhere. `boc_rate_alerts` is left in
  place in D1 (unread by any code) rather than dropped, so the subscriptions can
  be recovered if the feature is ever rebuilt.
- `pub_time` is half the table's primary key, so the parser deliberately
  reproduces the previous poller's exact string handling — strip non-breaking
  spaces outright, do not fold them to a space. A formatting drift here would
  silently double every row instead of deduplicating it.
- The `*/2` cadence is inherited unchanged to keep the series' resolution
  continuous, but it is far finer than the data warrants. BOC publishes roughly
  three times a day (measured 2026-07-25: five-hour gaps, 40 currencies per
  publication), so the poll issues ~28,800 insert statements a day to store
  ~120 rows — about 99.6% ignored conflicts. A `pub_time` watermark, a coarser
  cadence, or both would fix that; it is a separate decision.
- At ~120 rows/day the table grows ~44k rows/year, so its size is not currently
  a concern. Nothing prunes or rolls it up, and the paginated read path
  (`queryBocRateHistory`) does a full-table `count(*)` and an unindexed
  `ORDER BY pub_time` — worth revisiting eventually, not urgently.

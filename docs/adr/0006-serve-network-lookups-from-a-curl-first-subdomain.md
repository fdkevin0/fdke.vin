# 6. Serve network lookups from a curl-first subdomain

Date: 2026-07-25

## Status

Accepted

## Context

The site should answer "what does the internet see when I connect?" — both as a
page under `/tools/` and, more importantly, as something scriptable:
`curl ip.fdke.vin`.

`docs/cloudflare-radar-api.md` researched Cloudflare Radar for this, but it was
written against `fdkevin-bot` — it targets `src/features/net/net.ts`, Telegram
commands, `wrangler.toml`, and replacing an `IPPLUS360_TOKEN`. None of that
exists here. Its endpoint catalogue (§3) is primary-source material and still
applies; its refactor plan (§7) describes a different codebase and does not.

Two facts drove the shape of this.

**Radar's per-IP data is weaker than what the runtime already has.**
`/radar/entities/ip` returns country-level location plus origin AS, and nothing
finer — Radar's glossary states its IP geolocation comes from a third-party
country-granular database, and there is no IP→city path through Radar at all
(the `/radar/geolocations` family carries coordinates but is keyed by GeoNames
id, which `entities/ip` does not return). Meanwhile `request.cf` already carries
`asn`, `asOrganization`, `city`, `region`, `postalCode`, `latitude`,
`longitude`, `timezone`, `colo`, `httpProtocol`, `tlsVersion`, `tlsCipher` and
`clientTcpRtt` (`worker-configuration.d.ts`), for free, with no token and no
upstream call.

**Radar's budget is undocumented.** The docs publish no numeric rate limit or
concurrency figure anywhere; error `1015`/HTTP 429 is the only signal there is,
alongside `2002`/422 for a query above max cost. Anything public and
Radar-backed is therefore exposed to a budget nobody can measure in advance.

## Decision

**`ip.fdke.vin` is a second `custom_domain` route on this same Worker, answered
in `src/worker.ts` before Astro's `handle()`.** The endpoint uses none of the
site's request pipeline — no Access check, no API-token verification, no
language cookie, no page routing — and it is the one surface here that scripts
poll. Branching on the hostname first means a `curl` costs a hostname
comparison and a `Response`, not a trip through the blog's middleware. The
logic lives in `src/lib/network/` and takes its dependencies (`fetchImpl`,
`cache`, `token`) as arguments, so it is exercised in the plain node Vitest run
the same way `src/lib/api/exchange/` is.

**The boundary between hosts is "an IP" versus "the internet".** `ip.fdke.vin`
answers about an address; the aggregate Radar datasets live on the apex under
`/tools/network` and `/api/network/*`.

**A Connection and an IP profile are different things**, not one type with
nullable fields. A **Connection** is what the edge observed about a live
request: it is read from `request.cf`, exists only while the request does, and
is never cached or stored. An **IP profile** is what Radar knows about an
address whether or not it ever connected: country-granular, cacheable for a
day. Colo, TLS version and RTT are properties of a connection and cannot be
asked about an address, and naming the two apart is what makes that obvious
rather than a surprising gap.

**The default answer is one line and one upstream call.** `curl ip.fdke.vin`
returns the bare address with a single trailing newline so `IP=$(curl -s
ip.fdke.vin)` yields exactly the address. A lookup spends exactly one Radar
call; `?detail=1` opts into the second. Format is negotiated from `Accept`
(`*/*` → text, `text/html` → a redirect to the tool page,
`application/json` → JSON) with `?format=` as an override, rather than by
sniffing `User-Agent`.

**Hostnames resolve over 1.1.1.1 DoH, not Radar.** Radar's DNS datasets are
aggregated, anonymized trends over 1.1.1.1 traffic, not a resolver; there is no
Radar endpoint that answers what a name resolves to. DoH needs no token and
spends no Radar budget.

**Radar failures are surfaced, never retried and never masked.** A 429 is
returned as a 429 with `Retry-After`; a 422 as a 422. Retrying either spends an
unmeasurable budget faster. A missing token degrades lookups to a 503 that says
so, and leaves `curl ip.fdke.vin` working.

Caching is `caches.default` alone — no KV, no D1, no new binding. The cache key
is rebuilt from the parsed target rather than reused from the request URL, so
`/1.1.1.1` and `/1.1.1.1/` share one entry and unrelated query strings cannot
multiply it.

## Consequences

- `curl ip.fdke.vin` works with no Radar token configured, and costs no upstream
  call. Address and hostname lookups are the only parts that need the secret.
- The bare response shape is now a public contract. Scripts will depend on it
  being exactly one line, so adding a banner or a second field to the default
  text form is a breaking change; that is what `?detail=1` and `?format=json`
  exist for.
- Requests to `ip.fdke.vin` never reach Astro, so nothing in `src/pages/` or
  `src/middleware.ts` can serve or protect that host. Anything the lookup host
  should answer has to be added to `src/lib/network/handler.ts` — including
  `robots.txt`, which it serves itself as a blanket disallow.
- Custom domains match exactly, so the hostname is pinned in two places:
  `LOOKUP_HOST` and the `wrangler.jsonc` route. They must stay in sync.
- `wrangler deploy` provisions the DNS record and certificate for the new custom
  domain, but only if no CNAME already exists at `ip.fdke.vin`. Removing the
  route later does not remove the certificate.
- Reported geolocation differs between the two halves by design: your own
  connection is city-level, any other address is country-level. This will look
  like an inconsistency to anyone who has not read the distinction above, which
  is precisely why the two concepts are named separately in `CONTEXT.md`.
- Cache entries are per-colo, so a lookup popular in one region stays cold
  elsewhere. Accepted rather than adding a KV tier: the traffic here does not
  justify a binding, and the fallback is one Radar call.
- A hostname with many A/AAAA records is capped at four profiled addresses, so
  one lookup cannot fan out into a large number of Radar calls.

# Cloudflare Radar API Research (Replacing IPPlus360 + Extending the `net` Feature)

**Date:** 2026-07-12
**Scope:** Replacing the IPPlus360-backed `/ip` command in `src/features/net/net.ts` with the Cloudflare Radar API, and mapping which further Radar endpoints make compelling new Telegram bot commands. Authored against the official Radar docs and the Radar OpenAPI/API-reference spec only.

---

## Executive Summary (TL;DR)

Cloudflare Radar exposes a free, REST + Bearer-token API at `https://api.cloudflare.com/client/v4/radar/` covering global Internet traffic, attacks, BGP/routing, DNS trends, outages, domain rankings, and device/browser/OS/TLS/HTTP adoption. It is authenticated with a Cloudflare API token carrying the **Account > Radar > Read** permission, and returns the standard `{ success, errors, result, ... }` envelope.

**The IPPlus360 replacement is only *partial*.** Radar's `/radar/entities/ip` endpoint returns country-level geolocation plus the origin ASN/AS name/AS org and IP version — it does **not** return city, province/district, latitude, longitude, or a coordinate system. Radar's own glossary states its IP geolocation "comes from a third-party database" and is country-granularity. So Radar cleanly replaces the ASN/ISP and country fields of the current `IPPlus360Response` but drops the district/city/lat/long/coordsys fields. recommended path: replace `/ip` with a Radar-backed `/ip` (country + ASN) and either drop the granular geo fields or keep a second lightweight geolocation source for city-level.

**The `/domain` DoH command should stay as-is.** Radar's DNS endpoints are aggregate trend datasets built from 1.1.1.1 (e.g. query-type share, DNSSEC share, top ASes/locations by DNS queries) — the glossary explicitly defines Radar DNS as "aggregated and anonymized DNS lookups to Cloudflare's 1.1.1.1". They do not resolve a single domain's records. Keep 1.1.1.1 DoH for per-domain resolution; add Radar-backed aggregate DNS/traffic/attack/outage commands as new tools.

No numeric rate-limit/concurrency figures are published in the Radar docs (only error code `1015` → HTTP `429`). No dedicated Radar client SDK is documented; access is plain REST, plus an official MCP server. For a Worker, raw `fetch` with a `Bearer` header is the intended integration.

---

## Primary sources

- Radar docs landing page (raw markdown): https://developers.cloudflare.com/radar/index.md
- Radar docs index / page tree: https://developers.cloudflare.com/radar/llms.txt
- Get started: first API request (auth, base URL, token): https://developers.cloudflare.com/radar/get-started/first-request/index.md
- Make comparisons (array-param / multi-series convention): https://developers.cloudflare.com/radar/get-started/making-comparisons/index.md
- Radar API error codes: https://developers.cloudflare.com/radar/get-started/error-codes/index.md
- Glossary (defines DNS/IP-geolocation/BGP/outage terms): https://developers.cloudflare.com/radar/glossary/index.md
- URL Scanner investigate page: https://developers.cloudflare.com/radar/investigate/url-scanner/index.md
- Domains ranking investigate page: https://developers.cloudflare.com/radar/investigate/domain-ranking-datasets/index.md
- API reference (OpenAPI-derived, all endpoints): https://developers.cloudflare.com/api/resources/radar/index.md
- Repo context: `src/features/net/net.ts`, `wrangler.toml`, `AGENTS.md`

---

## 1. What Cloudflare Radar is

Cloudflare Radar is a public product/visualization hub ("`https://radar.cloudflare.com` is a hub that showcases global Internet traffic, attacks, and technology trends and insights"), powered by Cloudflare's global network plus "aggregated and anonymized data from Cloudflare's 1.1.1.1 public DNS resolver." ([landing](https://developers.cloudflare.com/radar/index.md))

Two distinct surfaces:

- **Radar (the dashboard/visualization)** at `radar.cloudflare.com` — charts, outage center, domain scans, embeddable charts.
- **Radar's API** — the data API. The docs are explicit: "Using Radar's API you can access Cloudflare's data on global Internet traffic. Radar's API is free… Data available via Radar API endpoints is made available under the CC BY-NC 4.0 license." ([landing](https://developers.cloudflare.com/radar/index.md))

Canonical base URL: `https://api.cloudflare.com/client/v4/radar/` ([first-request](https://developers.cloudflare.com/radar/get-started/first-request/index.md)). Auth model: Bearer API token (see §2).

---

## 2. The Radar REST API — mechanics

### Base URL & auth

- Base: `https://api.cloudflare.com/client/v4/radar/` ([first-request](https://developers.cloudflare.com/radar/get-started/first-request/index.md)).
- Auth: `Authorization: Bearer <API_TOKEN>`. Token creation: "Create a Custom Token, with **Account > Radar** in the Permissions group, and select **Read** as the access level." ([first-request](https://developers.cloudflare.com/radar/get-started/first-request/index.md); token creation flow at https://developers.cloudflare.com/fundamentals/api/get-started/create-token/).

### Envelope & response shape

All responses use the Cloudflare v4 envelope: `{ "success": boolean, "errors": [...], "result": { ... }, "meta": { ... } }`. The first-request doc shows the pattern: `result.summary_0` holds the dimension→value map, `result.meta` carries `dateRange`, `normalization`, `aggInterval`, `confidenceInfo`, `lastUpdated`, `units`. ([first-request](https://developers.cloudflare.com/radar/get-started/first-request/index.md))

### Common query-parameter conventions (across nearly all data endpoints)

Confirmed from the API reference across `http`, `dns`, `netflows`, `bgp`, `attacks`, `ai/inference`, etc. ([API ref](https://developers.cloudflare.com/api/resources/radar/index.md)):

- `asn` — array; comma-separated ASNs; prefix `-` to exclude (e.g. `-174,3356`).
- `location` — array; ISO 3166-1 alpha-2 country codes; prefix `-` to exclude.
- `continent` — array; alpha-2 continent codes (`EU`, `NA`, …); prefix `-` to exclude.
- `geoId` — array of GeoNames IDs (used by `http/*` and `geolocations`).
- `dateRange` — array; shortcuts like `7d`, `7dcontrol` (previous week), `1d`, etc.; or use explicit `dateStart`/`dateEnd` (ISO-8601, URL-encoded).
- `aggInterval` — `15m` | `1h` | `1d` | `1w` (timeseries only).
- `botClass` — `LIKELY_HUMAN` | `LIKELY_AUTOMATED`.
- `name` — array; labels each series in multi-series comparison requests.
- `format` — `JSON` (default) | `CSV`. Scalars `format` and `aggInterval` are **not** arrays (they apply globally). ([comparisons](https://developers.cloudflare.com/radar/get-started/making-comparisons/index.md))
- `limit`, `offset`, `limitPerGroup` — pagination / top-N truncation.
- `normalization` — `PERCENTAGE` | `MIN0_MAX` | `MIN_MAX` | `RAW_VALUES` | … ([concepts/normalization](https://developers.cloudflare.com/radar/concepts/normalization/)).

### Multi-series comparison

Array params are positional — "it is the position in the array that defines the series the filter belongs to." Repeated `name=…&dateRange=…&location=…` triples return multiple named series in one response; min-max normalization is applied consistently across series only when they are requested together. ([comparisons](https://developers.cloudflare.com/radar/get-started/making-comparisons/index.md))

### Endpoint families (`summary` vs `timeseries`/`timeseries_groups` vs `top`)

- **`/summary/{dimension}`** (and `/summary/<fixed-dimension>`): a single `summary_0` map of dimension-key → share/percentage. Best for a snappy single-message bot reply. e.g. `/radar/http/summary/device_type` → `{ desktop, mobile, other }`. ([API ref](https://developers.cloudflare.com/api/resources/radar/index.md))
- **`/timeseries`** and **`/timeseries_groups/{dimension}`**: `serie_0`/`<name>` objects with `timestamps` + `values` arrays. Heavier; best rendered as a sparkline or condensed stats.
- **`/top/...`**: ranked arrays (e.g. top ASes/locations/browsers/domains). Ideal for top-N tables.

### Errors, rate limits, concurrency

The only documented error table:

| Error code | HTTP | Meaning |
|---|---|---|
| 2000 | 500 | Internal Error |
| 2001 | 400 | Input Validation Error |
| 2002 | 422 | Query is above max cost |
| 1015 | 429 | Too many requests |
| 7003 | 404 | Not found |

([error-codes](https://developers.cloudflare.com/radar/get-started/error-codes/index.md))

**No numeric rate-limit or concurrency figures are published** anywhere in the Radar docs or the API reference markdown (the spec exposes only the `429`/`1015` signal). Treat this as a gap: the Worker should throttle defensively and surface `429`/`422` ("query above max cost") to the user rather than retry aggressively.

---

## 3. Endpoint enumeration relevant to the `net` feature

All paths are relative to `https://api.cloudflare.com/client/v4`, method `GET` unless noted. Sources: [API reference](https://developers.cloudflare.com/api/resources/radar/index.md); [URL Scanner](https://developers.cloudflare.com/radar/investigate/url-scanner/index.md); [domain ranking](https://developers.cloudflare.com/radar/investigate/domain-ranking-datasets/index.md).

### 3.1 IP / ASN / geolocation (the IPPlus360 replacement surface)

| Method | Path | Key params | Response fields |
|---|---|---|---|
| GET | `/radar/entities/ip` | `ip` (required) | `result.ip`: `asn`, `asnName`, `asnOrgName`, `asnLocation` (country α2), `ip`, `ipVersion`, `location` (country α2), `locationName` (country name) |
| GET | `/radar/entities/asns` | `asn`, `location`, `limit`, `offset`, `orderBy=ASN\|POPULATION` | `result.asns[]`: `asn`, `country`, `countryName`, `name`, `orgName`, `aka`, `website`, `estimatedUsers` |
| GET | `/radar/entities/asns/{asn}` | — | `result.asn`: `asn`, `confidenceLevel`, `country`, `countryName`, `name`, `orgName`, `source` (RIR), `website`, `related[]`, `estimatedUsers.{locations[],estimatedUsers}` |
| GET | `/radar/entities/asns/ip` | `ip` (required) | same shape as `/asns/{asn}` — full AS detail derived from an IP |
| GET | `/radar/entities/asns/{asn}/rel` | `asn2` | `result.rels[]`: `asn1`, `asn1_country`, `asn1_name`, `asn2`, …, `rel` (provider-customer/peering) |
| GET | `/radar/entities/locations` | — | list of supported locations |
| GET | `/radar/entities/locations/{location}` | — | location details |
| GET | `/radar/geolocations` | `geoId`, `location`, `limit`, `offset` (+ `Accept-Language` for localized names) | `result.geolocations[]`: `geoId`, `latitude`, `longitude`, `name`, `type` (CONTINENT/COUNTRY/ADM1), `code`, `parent` (nested) |
| GET | `/radar/geolocations/{geo_id}` | — | single geolocation detail (GeoNames-keyed) |
| GET | `/radar/search/global` | `query`, `include`/`exclude` (ASNS, LOCATIONS, ADM1S, TLDS, ORIGINS, …), `limit`, `limitPerGroup` | `result.search[]`: `{ code, name, type }` — resolves "cloudflare" → `13335`/`asn`, etc. |

**Critical caveat for replacing IPPlus360:** `/radar/entities/ip` returns **only country-level** location plus AS identity. There is **no** city/province/district, no latitude/longitude, no coordinate system. The glossary confirms this: "IP geolocation used on Cloudflare Radar comes from a third-party database" and the location field on `entities/ip` is an alpha-2 country code ([glossary](https://developers.cloudflare.com/radar/glossary/index.md)). The `/radar/geolocations` family *does* carry `latitude`/`longitude`/`name`/`type=ADM1`, but is keyed by GeoNames `geoId`, which `entities/ip` does **not** return, so there is no IP→city path through Radar. Field-by-field mapping for the refactor is given in §7.

### 3.2 DNS / domain lookups (aggregate, not per-domain)

Radar DNS data is "aggregated and anonymized DNS lookups to Cloudflare's 1.1.1.1" ([glossary](https://developers.cloudflare.com/radar/glossary/index.md)) — trends, not resolution. Endpoints:

| Method | Path | Purpose |
|---|---|---|
| GET | `/radar/dns/summary/{dimension}` | `dimension` ∈ AS, CACHE_HIT, DNSSEC, DNSSEC_AWARE, DNSSEC_E2E, IP_VERSION, LOCATION, MATCHING_ANSWER, PROTOCOL, QUERY_TYPE, RESPONSE_CODE, RESPONSE_TTL, TLD, TLD_DNS_MAGNITUDE. Returns `summary_0` map. |
| GET | `/radar/dns/summary/query_type` | share of A/AAAA/MX/TXT/… (88 types) |
| GET | `/radar/dns/summary/ip_version` | IPv4 vs IPv6 share of DNS queries |
| GET | `/radar/dns/summary/protocol` | UDP/TCP/HTTPS/TLS (DoT/DoH) share |
| GET | `/radar/dns/summary/dnssec` | INVALID/INSECURE/SECURE/OTHER share |
| GET | `/radar/dns/top/ases` | top ASes by DNS query volume |
| GET | `/radar/dns/top/locations` | top countries by DNS query volume |
| GET | `/radar/dns/timeseries` | DNS query volume over time |

Domain rankings (1.1.1.1-derived popularity):

| Method | Path | Purpose |
|---|---|---|
| GET | `/radar/ranking/top` | ordered top-100 domains globally/per-country (daily); params: `rankingType=POPULAR\|TRENDING_RISE\|TRENDING_STEADY`, `location`, `limit`, `domainCategory`, `date`. Returns `top_0[]` = `{rank, domain, categories, pctRankChange?}`. |
| GET | `/radar/ranking/domain/{domain}` | rank details for one domain: `details_0` = `{rank?, bucket?, categories, top_locations[]}` |
| GET | `/radar/ranking/internet_services/top` | top Internet services (service = grouped domains) |
| GET | `/radar/ranking/internet_services/categories` | service categories |
| GET | `/radar/datasets` | list ranking-bucket datasets (top-200 … top-1,000,000) |
| GET | `/radar/datasets/{alias}` | stream a bucket CSV (e.g. `ranking_top_1000`) |
| POST | `/radar/datasets/download` | get a download URL for a dataset by `id` |

### 3.3 Network traffic & routing (BGP)

| Method | Path | Purpose / response |
|---|---|---|
| GET | `/radar/bgp/timeseries` | BGP announcements/withdrawals over time; `asn`, `prefix`, `updateType=ANNOUNCEMENT\|WITHDRAWAL`, `aggInterval` |
| GET | `/radar/bgp/top/prefixes` | top prefixes by BGP updates |
| GET | `/radar/bgp/top/ases` | top ASes by BGP updates |
| GET | `/radar/bgp/top/ases/prefixes` | top ASes by prefix count |
| GET | `/radar/bgp/leaks/events` | detected route-leak events (From/By/To, BGP msgs, prefixes, vantage points) |
| GET | `/radar/bgp/hijacks/events` | origin-hijack events (detected origin, expected origins, confidence High/Med/Low, tags, RPKI) |
| GET | `/radar/bgp/routes/moas` | Multi-Origin-AS prefixes |
| GET | `/radar/bgp/routes/pfx2as` | prefix→ASN mapping |
| GET | `/radar/bgp/routes/stats` | global routing-table stats |
| GET | `/radar/bgp/routes/ases` | list ASes from global routing tables |
| GET | `/radar/bgp/routes/realtime` | real-time BGP routes for a `prefix` (RouteViews + RIPE RIS); `meta.prefix_origins[]` with `origin`, `rpki_validation` (valid/invalid/unknown), `visibility`, `total_peers`, `total_visible`; `routes[]` with `as_path`, `collector`, `communities` |
| GET | `/radar/bgp/ips/timeseries` | announced IP-address-space size over time |
| GET | `/radar/bgp/ips/top/ases` | top ASes by announced IP space |
| GET | `/radar/bgp/rpki/aspa/snapshot`, `…/changes`, `…/timeseries` | ASPA objects |
| GET | `/radar/bgp/rpki/roas/timeseries` | RPKI ROA deployment |
| GET | `/radar/netflows/timeseries`, `/summary`, `/summary/{dimension}`, `/top/ases`, `/top/locations` | network traffic from edge routers (min0-max normalized) |

### 3.4 Attack / abuse datasets

Layer 3/4 (network) DDoS:

| Method | Path | Summary dimensions |
|---|---|---|
| GET | `/radar/attacks/layer3/summary/{dimension}` | by protocol, vector, bitrate, duration, ip_version, industry, vertical |
| GET | `/radar/attacks/layer3/top/attacks` | top origin→target attack pairs |
| GET | `/radar/attacks/layer3/top/locations/origin` and `/target` | top countries |
| GET | `/radar/attacks/layer3/top/industry`, `/vertical` | top targeted industries/verticals |
| GET | `/radar/attacks/layer3/timeseries` | attack volume over time |

Layer 7 (application) attacks:

| Method | Path | Summary dimensions |
|---|---|---|
| GET | `/radar/attacks/layer7/summary/{dimension}` | by ip_version, http_method, http_version, managed_rules, mitigation_product, industry, vertical |
| GET | `/radar/attacks/layer7/top/attacks`, `/top/locations/origin`, `/top/locations/target`, `/top/ases/origin`, `/top/industry`, `/vertical` | ranked attack sources/targets |
| GET | `/radar/attacks/layer7/timeseries` | mitigated-request volume over time |

### 3.5 Device / browser / OS / bot + connection adoption (HTTP summary family)

All share the same parameter set (`asn`, `location`, `continent`, `geoId`, `botClass`, `browserFamily`, `os`, `tlsVersion`, `httpVersion`, `httpProtocol`, `ipVersion`, `dateRange`, `name`) and return `result.summary_0` as a dimension→percentage map.

| Method | Path | `summary_0` keys |
|---|---|---|
| GET | `/radar/http/summary/device_type` | `{desktop, mobile, other}` |
| GET | `/radar/http/summary/os` | WINDOWS, MACOSX, IOS, ANDROID, CHROMEOS, LINUX, SMART_TV |
| GET | `/radar/http/summary/browser` (via `/http/top/browser` & `/http/top/browser_family`) | browser / family shares |
| GET | `/radar/http/summary/http_version` | HTTPv1, HTTPv2, HTTPv3 |
| GET | `/radar/http/summary/http_protocol` | HTTP, HTTPS |
| GET | `/radar/http/summary/ip_version` | IPv4, IPv6 |
| GET | `/radar/http/summary/tls_version` | TLSv1_0 … TLSv1_3, TLSvQUIC |
| GET | `/radar/http/summary/post_quantum` | PQ adoption share |
| GET | `/radar/http/summary/bot_class` | LIKELY_AUTOMATED, LIKELY_HUMAN |
| GET | `/radar/http/top/locations`, `/radar/http/top/ases` (+ `/bot_class/{bot_class}`, `/device_type/{device_type}`, `/os/{os}`, `/tls_version/{tls_version}`, `/browser_family/{browser_family}`, `/ip_version/{ip_version}`, `/http_version/{http_version}`) | top countries/ASes for a given segment |

### 3.6 Outages / disruptions / traffic anomalies

| Method | Path | Purpose / response |
|---|---|---|
| GET | `/radar/annotations/outages` | latest outages + anomalies; `annotations[]` with `eventType=OUTAGE`, `outage.{outageCause,outageType}`, `locationsDetails[]`, `asnsDetails[]`, `originsDetails[]`, `startDate`, `endDate?`, `scope`, `linkedUrl`; filters `asn`, `location`, `origin`, `dateRange` |
| GET | `/radar/annotations/outages/locations` | count of outages by country: `{clientCountryAlpha2, clientCountryName, value}` |
| GET | `/radar/traffic_anomalies` | latest (possibly-unverified) traffic anomalies; `trafficAnomalies[]` with `startDate`, `endDate?`, `status=VERIFIED\|UNVERIFIED`, `type=LOCATION\|AS\|ORIGIN`, `asnDetails/locationDetails/originDetails`; filters `asn`, `location`, `origin`, `status`, `type` |
| GET | `/radar/traffic_anomalies/locations` | sum of anomalies by country |
| GET | `/radar/annotations` | latest annotations (general) |

The glossary distinguishes *verified outages* (manually corroborated, listed in the Internet Outages table/API) from *unverified traffic anomalies* (algorithmically observed drops) ([glossary](https://developers.cloudflare.com/radar/glossary/index.md)).

### 3.7 URL Scanner — a *separate* API (not under `/radar`)

The URL Scanner is **not** part of the `/radar/*` dataset API. It lives at `https://api.cloudflare.com/client/v4/accounts/{account_id}/urlscanner/v2/` and "you must obtain a URL Scanner specific API token… Create a Custom Token with **Account > URL Scanner** in the Permissions group, and select **Edit** as the access level." ([url-scanner](https://developers.cloudflare.com/radar/investigate/url-scanner/index.md))

| Method | Path | Notes |
|---|---|---|
| POST | `/accounts/{account_id}/urlscanner/v2/scan` | submit a URL; returns `uuid`. Up to 100 URLs via bulk endpoint. Retention 12 months (success) / 30 days (failed). |
| GET | `/accounts/{account_id}/urlscanner/v2/result/{scan_id}` | poll until `200` (404 while in progress); report includes `page`, `meta.processors`, `verdicts.overall.malicious`, `lists.{ips,asns,domains,certificates,hashes}` |
| GET | `/accounts/{account_id}/urlscanner/v2/search?q=...` | ElasticSearch-subset query over past scans |

It is **async** (poll every 10–30s), needs its **own Edit-scoped token**, and scanning *by location* is **Enterprise-only** ([url-scanner](https://developers.cloudflare.com/radar/investigate/url-scanner/index.md)). Treat it as an opt-in premium-ish tool, not part of the free aggregate API.

### 3.8 Other useful families (briefly)

- Quality/speed: `/radar/quality/iqi/summary` (Internet Quality Index: bandwidth/latency/DNS by continent/country/ASN), `/radar/quality/speed/{summary,histogram,top/ases,top/locations}`.
- Email routing/security: `/radar/email/routing/summary/{arc,dkim,dmarc,encrypted,ip_version,spf}`, `/radar/email/security/summary/{malicious,spam,spoof,threat_category,tls_version}`, `/radar/email/security/top/tlds/...`.
- Certificate transparency: `/radar/ct/summary/{dimension}`, `/radar/ct/authorities`, `/radar/ct/logs`.
- TCP resets/timeouts: `/radar/tcp_resets_timeouts/{summary,timeseries_groups}` (connection-tampering signal).
- Bots/verified bots: `/radar/bots`, `/radar/bots/{bot_slug}`, `/radar/verified_bots/top/{bots,categories}`, `/radar/bots/crawlers/...`, `/radar/ai/bots/...` (AI scraper/crawler traffic).

---

## 4. Anonymized vs enhanced vs paid tiers

The Radar docs do **not** publish an "anonymized / enhanced / paid" tier matrix. What they do state, from primary sources:

- **The Radar dataset API is free.** "Radar's API is free, allowing academics, technology professionals, and other web enthusiasts to investigate Internet usage across the globe." Data is licensed **CC BY-NC 4.0** (attribution, non-commercial). ([landing](https://developers.cloudflare.com/radar/index.md))
- **The aggregate endpoints are anonymized.** DNS data is "aggregated and anonymized DNS lookups to Cloudflare's 1.1.1.1"; domain rankings are "anonymized and aggregated 1.1.1.1 DNS resolver data" that "complies with our privacy policy." ([glossary](https://developers.cloudflare.com/radar/glossary/index.md))
- **URL Scanner is the exception.** It is a separate product with its own Edit-scope token, and location-based scanning is gated to **Enterprise** customers. ([url-scanner](https://developers.cloudflare.com/radar/investigate/url-scanner/index.md))
- **No endpoint is documented as "paid/enhanced" within the `/radar/*` dataset API** itself; the only cost-control signal is error `2002` (HTTP 422, "Query is above max cost") for overly expensive queries ([error-codes](https://developers.cloudflare.com/radar/get-started/error-codes/index.md)). Bucket datasets up to 1,000,000 domains are accessible through the standard datasets endpoints ([domain ranking](https://developers.cloudflare.com/radar/investigate/domain-ranking-datasets/index.md)).

Practical implication for a hobby bot: an API token on a free/standard Cloudflare account with **Account > Radar > Read** can hit all the `/radar/*` aggregate endpoints (subject to query-cost and 429 limits). The URL Scanner requires a separate token and is Enterprise-gated for location scans — deprioritise it.

---

## 5. Auth & limits specifics for a Cloudflare Worker

- **Minting the token:** Dashboard → My Profile → API Tokens → Create Custom Token → Permissions: **Account > Radar > Read**. ([first-request](https://developers.cloudflare.com/radar/get-started/first-request/index.md))
- **Storing it:** use `wrangler secret put RADAR_API_TOKEN` and read `env.RADAR_API_TOKEN` (mirrors the existing `IPPLUS360_TOKEN` pattern in `net.ts:29` and the secrets guidance in `AGENTS.md` "Security & Configuration Tips"). Optional: also rotate the existing Cloudflare token used for other Worker Cloudflare APIs — but Radar's Read scope is narrow and safe to isolate in its own token.
- **Single token for Radar + other Cloudflare APIs:** technically possible (a custom token can carry multiple permissions), but the first-request doc frames Radar as its own **Account > Radar > Read** scope ([first-request](https://developers.cloudflare.com/radar/get-started/first-request/index.md)). Recommend a dedicated token to keep blast-radius small. URL Scanner needs a *separate* **Account > URL Scanner > Edit** token ([url-scanner](https://developers.cloudflare.com/radar/investigate/url-scanner/index.md)).
- **CORS / origin constraints:** none documented for server-side Bearer calls; the API is designed for `curl`/backend use ([first-request](https://developers.cloudflare.com/radar/get-started/first-request/index.md)). A Worker calling via `fetch` with `Authorization: Bearer …` is the canonical pattern.
- **Rate limits / concurrency:** not numerically documented; only the `429`/`1015` signal exists ([error-codes](https://developers.cloudflare.com/radar/get-started/error-codes/index.md)). Recommend: serialise Radar calls per command invocation, surface `429` and `422` to the user, and avoid fanning out multiple Radar requests per single Telegram message unless needed.

---

## 6. Official client SDKs

- **No dedicated Radar client SDK is documented.** The first-request page demonstrates raw `curl` and raw Python `requests`+`pandas`; it links only to companion Jupyter notebooks at `github.com/cloudflare/radar-notebooks` ([first-request](https://developers.cloudflare.com/radar/get-started/first-request/index.md)). The API reference shows raw HTTP `curl` examples throughout ([API ref](https://developers.cloudflare.com/api/resources/radar/index.md)).
- **MCP server:** the Radar landing page points to an official `cloudflare/mcp` repo exposing Radar to MCP clients ([landing](https://developers.cloudflare.com/radar/index.md)). Not relevant to a Worker, but worth noting as Cloudflare's only first-party "client" surface for Radar.
- **Practical:** for `src/features/net/net.ts` use a plain `fetch` with a `Bearer` header — consistent with how the current code calls IPPlus360 (`net.ts:30`) and 1.1.1.1 DoH (`net.ts:81`). No npm/PyPI dependency is required or recommended.

---

## 7. Recommendation — refactor `src/features/net/net.ts`

### 7.1 Replace `/ip` (IPPlus360 → Radar)

Call **`GET /radar/entities/ip?ip=<ip>`** (Bearer `RADAR_API_TOKEN`). Field mapping vs. the current `IPPlus360Response` (`net.ts:198-205`) and its rendered table (`net.ts:46-50`):

| Current `IPPlus360` field | Radar `entities/ip` field | Status |
|---|---|---|
| `data.country` / country name | `ip.location` / `ip.locationName` (country α2 + name) | ✅ country only |
| `data.region` / `data.province` / `data.city` / `data.district` | — | ❌ **not available** (Radar is country-granular) |
| `data.lat` / `data.lng` / `coordsys` | — | ❌ **not available** |
| `data.isp` (AS name / org) | `ip.asn`, `ip.asnName`, `ip.asnOrgName` | ✅ |
| `ip` | `ip.ip` | ✅ |
| (none) | `ip.ipVersion` | ✅ (bonus) |
| `charge` | — | n/a — Radar is free, drop the `charge` row |

To enrich the IP reply beyond country, you can **chain** one extra call: `GET /radar/entities/asns/{asn}` (using the ASN returned by `entities/ip`) to add `confidenceLevel`, `country`/`countryName` of the AS registration, `estimatedUsers`, `website`, `source` (RIR), and `related[]` ASes. This is still country-level for *geo* but adds ASN richness that IPPlus360 lacks.

For per-IP **city/province/lat-long**, Radar has no path (see §3.1). Options: (a) drop those rows; (b) keep a tiny fallback geolocation source solely for city-level (e.g. the existing IPPlus360 token, kept as an opt-in enhancement), with Radar as the authoritative ASN/country layer. Given the maintainer's goal is to *replace* IPPlus360, option (a) is the clean cut; document the regression explicitly in the PR.

Net assessment: **partial replacement** — clean for country + ASN/org + IP version; loses district/city/lat/long/coordsys.

### 7.2 Keep `/domain` (1.1.1.1 DoH) as-is

Radar's DNS endpoints are aggregate trends, not per-domain resolution ([glossary](https://developers.cloudflare.com/radar/glossary/index.md): "aggregated and anonymized DNS lookups to Cloudflare's 1.1.1.1"). The current `DomainCommand` (`net.ts:62-103`) does a real DNS resolution via `https://1.1.1.1/dns-query?name=...&type=...` with `Accept: application/dns-json`. That is the right tool for "show me this domain's A/AAAA/MX/… records." Do **not** migrate it to Radar. Instead add the Radar DNS *trend* and domain-ranking commands below as new tools.

### 7.3 New bot commands unlocked by Radar (prioritised: free + snappy output)

Each is a single `GET` to `/radar/*` with Bearer `RADAR_API_TOKEN`; recommended default `dateRange=7d`, `format=json`.

| Command | Endpoint | One-line description | Output shape |
|---|---|---|---|
| `/ip <ip>` (refactored) | `/radar/entities/ip?ip=` | Country + origin ASN/AS-org + IP version for an address | small table |
| `/asn <asn>` | `/radar/entities/asns/{asn}` | AS profile: name, org, country, confidence, est. users, website, related ASes | small table |
| `/asnip <ip>` | `/radar/entities/asns/ip?ip=` | Full AS detail behind an IP (richer than `/entities/ip`) | small table |
| `/bgp <prefix>` | `/radar/bgp/routes/realtime?prefix=` | Real-time origin AS, RPKI validation, visibility, AS-path | table |
| `/outages` | `/radar/annotations/outages?limit=10` | Latest verified Internet outages (cause, type, scope, dates, location/AS/origin) | bulleted list |
| `/anomalies` | `/radar/traffic_anomalies?limit=10&status=VERIFIED` | Latest traffic anomalies that may indicate outages | bulleted list |
| `/topdomains [CC]` | `/radar/ranking/top?limit=10&location=<CC>&rankingType=POPULAR` | Top-10 popular domains globally or per country | numbered list |
| `/trending` | `/radar/ranking/top?limit=10&rankingType=TRENDING_RISE` | Domains spiking in popularity today | numbered list |
| `/domainrank <domain>` | `/radar/ranking/domain/{domain}?includeTopLocations=true` | Radar rank + bucket + categories + per-country rank for a domain | small table |
| `/dnsstats [CC]` | `/radar/dns/summary/ip_version?location=<CC>` (and `query_type`, `protocol`, `dnssec`) | IPv4/IPv6, query-type, DoT/DoH, DNSSEC share of 1.1.1.1 queries | small table |
| `/devtype [CC]` | `/radar/http/summary/device_type?location=<CC>` | Mobile vs desktop vs other share of HTTP traffic | 3-row table |
| `/os [CC]` | `/radar/http/summary/os?location=<CC>` | OS adoption (Windows/macOS/iOS/Android/ChromeOS/Linux/Smart TV) | small table |
| `/browser [CC]` | `/radar/http/top/browser_family?limit=5&location=<CC>` | Top browser families by HTTP share | top-5 list |
| `/tls [CC]` | `/radar/http/summary/tls_version?location=<CC>` | TLS-version (1.0–1.3, QUIC) adoption | small table |
| `/httpver [CC]` | `/radar/http/summary/http_version?location=<CC>` | HTTP/1 vs HTTP/2 vs HTTP/3 share | small table |
| `/botshare [CC]` | `/radar/http/summary/bot_class?location=<CC>` | Likely-human vs likely-automated traffic share | 2-row table |
| `/ddos_l3` | `/radar/attacks/layer3/summary/protocol?limitPerGroup=5` | L3/4 DDoS share by protocol (TCP/UDP/ICMP…) | small table |
| `/ddos_l7` | `/radar/attacks/layer7/summary/mitigation_product?limitPerGroup=5` | L7 attack share by mitigation product | small table |
| `/search <query>` | `/radar/search/global?query=&limit=10` | Resolve a name/number to ASNs, locations, TLDs, origins, industries | small list |
| `/iqi [CC]` | `/radar/quality/iqi/summary?location=<CC>` | Internet Quality Index (bandwidth, latency, DNS) for a country/ASN | small table |
| `/speed [CC]` | `/radar/quality/speed/top/locations?limit=10` | Top countries by speed-test throughput | top-10 list |

**Tier-2/optional** (extra token / async / heavier): `/scan <url>` → URL Scanner (`POST …/urlscanner/v2/scan` then poll `…/result/{uuid}`), gated behind a separate `URL_SCANNER_TOKEN` and `adminOnly`; `/leaks`, `/hijacks`, `/datasets/<alias>` (CSV bucket streams) for power users.

### 7.4 Suggested implementation slices (issue-ready)

1. **Add `RADAR_API_TOKEN` secret** + a thin `radar` fetch helper (base URL, Bearer header, `success`/`errors` unwrap, 429/422 → user-facing message). Reuse the existing `formatTableData`/`formatAsCodeBlock` utilities in `net.ts`.
2. **Refactor `/ip`** to `/radar/entities/ip`, dropping district/city/lat-long/coordsys rows and adding `ipVersion` + ASN rows; document the field regression in the PR. Optionally chain `/radar/entities/asns/{asn}` for enrichment.
3. **Keep `/domain`** unchanged (DoH). Add a code comment noting Radar DNS is aggregate-only so future readers don't "migrate" it.
4. **Add `/asn`, `/asnip`, `/bgp`, `/outages`, `/anomalies`** (single-call, table/list output) — highest signal, lowest cost.
5. **Add `/topdomains`, `/trending`, `/domainrank`, `/dnsstats`** — the DNS/ranking menu.
6. **Add `/devtype`, `/os`, `/browser`, `/tls`, `/httpver`, `/botshare`** — the adoption-summary menu (all `summary_0` maps, trivial to render).
7. **Add `/ddos_l3`, `/ddos_l7`, `/search`, `/iqi`, `/speed`** — attacks/quality/search menu.
8. **(Optional, later) `/scan`** behind a separate `URL_SCANNER_TOKEN` once the URL Scanner Edit token is minted; async polling in the queue handler (the Worker already has `QUEUE` — `wrangler.toml:70-80`), so submit-on-command / deliver-on-queue fits the existing architecture.

Register each new command in `src/core/index.ts` per `AGENTS.md` ("Register new commands in `src/core/index.ts` so they surface in the bot"). Default `adminOnly = true` to match the existing `IPCommand`/`DomainCommand` and keep load off the free quota.

---

## Sources (consolidated)

- Radar overview & free/CC-BY-NC license: https://developers.cloudflare.com/radar/index.md
- First API request (token scope, base URL, envelope): https://developers.cloudflare.com/radar/get-started/first-request/index.md
- Comparisons (array-param convention): https://developers.cloudflare.com/radar/get-started/making-comparisons/index.md
- Error codes (429/1015, 422/2002): https://developers.cloudflare.com/radar/get-started/error-codes/index.md
- Glossary (DNS anonymized; IP-geo third-party DB; outages vs anomalies): https://developers.cloudflare.com/radar/glossary/index.md
- URL Scanner (separate token, async, Enterprise location scans): https://developers.cloudflare.com/radar/investigate/url-scanner/index.md
- Domain rankings & bucket datasets: https://developers.cloudflare.com/radar/investigate/domain-ranking-datasets/index.md
- Full API reference (all endpoint signatures/response schemas): https://developers.cloudflare.com/api/resources/radar/index.md
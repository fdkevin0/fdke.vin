# Network tools

`ip.fdke.vin` answers questions about an address or the caller's connection. `/tools/network` and `/api/network/*` expose aggregate Internet data. Implementation lives in [src/lib/network](../src/lib/network/).

## Lookup usage

```sh
curl https://ip.fdke.vin
curl https://ip.fdke.vin/json
curl 'https://ip.fdke.vin/1.1.1.1?detail=1&format=json'
curl https://ip.fdke.vin/example.com
```

The bare text response is exactly the caller's address plus a newline, with no upstream call or Radar token. Keep that shape stable for shell scripts. `/json` returns the caller's Connection as JSON. Format is chosen from `Accept`, with `?format=` as an override: `*/*` defaults to text, `application/json` requests JSON, and `text/html` redirects to the corresponding tool page. `?detail=1` enables more detail.

## Connection and IP profile

A **Connection** is what the edge observed about this request: address, colo, TLS/HTTP versions, RTT, and available location fields. It exists only for that request and is never cached or stored.

An **IP profile** is Radar's information about an address, including country and origin AS, whether or not it ever connected here. It has no connection-specific TLS, colo, or RTT. The profile reader consumes country-level location, not city or coordinates; adding an unrelated GeoNames lookup cannot supply a missing IP-to-city mapping.

A **Network lookup** resolves a path segment to IP profiles. Hostnames first resolve A/AAAA records through 1.1.1.1 DNS-over-HTTPS; Radar DNS datasets contain aggregate trends and are not a hostname resolver. At most four addresses are profiled for one hostname.

On a cache miss, each IP costs one Radar call (`/entities/ip`); detail adds `/entities/asns/ip`. The two requests can run concurrently because both take the IP directly.

## Internet snapshots

An **Internet snapshot** groups aggregate adoption, health, routing, or ranking datasets. The routes under [src/pages/api/network](../src/pages/api/network/) cache groups as a unit and use `cc` for country comparisons where supported. These describe Internet-wide observations, not an individual IP.

Keep **verified outage** and **traffic anomaly** distinct: one has been manually corroborated, the other reflects an algorithmically detected traffic change. Display the source's classification rather than presenting both as confirmed outages.

The dataset reader handles summary dimension maps (`summary_0`), ranked arrays, and dated annotation lists. It accepts known dimension aliases so a renamed key can omit one metric without failing the entire group. See [datasets.ts](../src/lib/network/datasets.ts) for the actual endpoint and field selection.

## Radar integration and failures

Store `RADAR_API_TOKEN` as a Worker secret. Calls use a Bearer token with Account > Radar > Read permission and unwrap the Cloudflare `{ success, errors, result }` envelope. See the [official setup guide](https://developers.cloudflare.com/radar/get-started/first-request/) and [API reference](https://developers.cloudflare.com/api/resources/radar/).

[radar.ts](../src/lib/network/radar.ts) performs a single attempt and surfaces failures instead of retrying or returning a successful empty result. The lookup host returns 503 when no token is configured, 429 for rate limiting (with `Retry-After: 60`), and 422 for excessive query cost. Its bare Connection endpoint still works without a token. Dataset routes preserve Radar error status but do not add the lookup host's Retry-After header.

Consult current [Radar errors](https://developers.cloudflare.com/radar/get-started/error-codes/) before changing this mapping. Avoid relying on a numeric request budget inferred from old research.

## Routing and cache design

The Worker handles `LOOKUP_HOST` before federation and Astro. The lookup host bypasses the site's Access checks, API-token verification, and language middleware, and serves its own `robots.txt`. Keep `LOOKUP_HOST` and the custom-domain route in `wrangler.jsonc` synchronized; new lookup-host routes belong in its handler.

Successful lookup responses cache for one day using `caches.default`, with no KV or D1 tier. Keys derive from the normalized target, format, and detail flag, so trailing slashes and irrelevant query parameters do not multiply entries. Connection responses and lookup errors use `no-store`. Per-colo caching accepts cold misses in other regions in exchange for a simpler storage model.

The lookup and dataset readers take injected dependencies so their behavior can be tested in Node without a Radar token or Workers runtime. See [Contributing](../CONTRIBUTING.md#validation).

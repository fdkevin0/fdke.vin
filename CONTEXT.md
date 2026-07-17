# fdke.vin

A personal multilingual blog (Astro on Cloudflare Workers). Posts exist in up to three languages; the site picks the best translation for each visitor.

## Language

### Content

**Post**:
A blog article stored as one markdown file per language under `src/content/post/`. Translations of the same article are distinct Posts sharing one Post slug.
_Avoid_: article, entry

**Note**:
A short-form piece federated over ActivityPub. Stored as a **D1 row** (not a markdown file) keyed by an opaque sortable **Note id** (ULID), rendered SSR at `/notes/{id}/`, and authored by posting to the Telegram channel. Not translated and not part of post resolution.
_Avoid_: status, toot, microblog post

**Note id**:
The opaque, time-sortable ULID that is a Note's canonical identity and its `/notes/{id}/` URL segment. Also the AS2 object id. Replaces the old markdown slug — Notes no longer have hand-authored slugs.
_Avoid_: slug (that was the old markdown identity), snowflake

**Post grammar**:
The `{date}-{slug}-{lang}` filename convention every Post file must follow (e.g. `2026-03-27-terminal-en`). The single source of a Post's identity: publish date, Post slug, and SiteLang.
_Avoid_: naming convention, filename format

**Post slug**:
The language-independent identifier shared by all translations of a Post, extracted from the Post grammar. It is the `/posts/{slug}/` URL segment.
_Avoid_: post id (that's the full filename), permalink

### Languages

**SiteLang**:
One of the site's supported languages: `zh`, `en`, `ja`. Every Post declares exactly one.
_Avoid_: locale, language code

**Post resolution**:
Choosing which Post translation to serve for a given Post slug and requested SiteLang, applying fallback priority when the exact language is missing.
_Avoid_: post lookup, language negotiation

**Fallback priority**:
The order tried during post resolution: requested SiteLang, then the default SiteLang (`en`), then the remaining SiteLangs.
_Avoid_: language fallback chain

### Feeds

**Site feed**:
An RSS feed the site publishes about its own content (blog posts, notes).
_Avoid_: rss (ambiguous on its own)

**Feed aggregator**:
The feed _reader_ subsystem: ingests external feeds into D1, translates them with Workers AI, and serves them to the dashboard. Unrelated to the Site feed despite its `rss_`-prefixed tables.
_Avoid_: rss feed, feed reader

### Federation

The site federates its Notes over **ActivityPub** as a single actor. All terms below scope to that subsystem (`src/lib/ap`, D1 `ap_*` tables, `ap-delivery-queue`).

**Actor**:
The single ActivityPub identity representing the site's author, addressed as `@fdkevin@fdke.vin`. Discovered via WebFinger on the apex domain; owns the inbox, outbox, and followers collections. Every Note is authored by this one Actor.
_Avoid_: user, account, profile

**Note object**:
A Note serialized as ActivityStreams 2.0 JSON. The same `/notes/{id}/` URL returns HTML to browsers and the Note object to requests sending `Accept: application/activity+json` (content negotiation). Its `id` is the Note id URL.
_Avoid_: as2 note, json note

**Album**:
A multi-photo Telegram channel post, delivered to the webhook as one message per photo sharing a `media_group_id`. Buffers as a Pending album and finalizes into a single Note carrying every photo as an attachment, delivered as one `Create`/`Update`.
_Avoid_: gallery, media group

**Pending album**:
The buffered, not-yet-finalized state of an Album — one D1 row per arrived photo (`ap_pending_album_photos`), written durably before the webhook responds 200. Deleted once its Album finalizes.
_Avoid_: draft, buffer (ambiguous alone)

**Finalization**:
The debounced step — a ~3s-quiet-period check re-enqueued on the delivery queue after every Album photo arrival — that assembles a Pending album's rows into one Note and delivers it. A message arriving after finalization (a straggler) attaches to the existing Note with a follow-up `Update` instead of re-finalizing.
_Avoid_: publish, flush

**Activity**:
A `Create`, `Update`, or `Delete` the Actor emits about a Note (post → `Create`, channel edit → `Update`, dashboard removal → `Delete(Tombstone)`). Inbound Activities the inbox accepts additionally include `Follow`/`Undo`, `Like`, and `Announce`.
_Avoid_: event, message

**Inbox / Outbox**:
The Actor's two AS2 collections. The **inbox** (`/inbox`) receives Activities from remote servers — every request is HTTP-Signature-verified before processing. The **outbox** exposes the Actor's own emitted Activities, including backfilled Notes (which appear but are never delivered).
_Avoid_: feed (collides with Site feed / Feed aggregator)

**Follower**:
A remote Actor that has sent an accepted `Follow`. Stored in D1 with its (shared) inbox URL; the delivery fan-out targets Followers.
_Avoid_: subscriber, fan

**Interaction**:
A remote reaction to a Note ingested via the inbox — a reply (`Create(Note)` in-reply-to), a `Like`, or an `Announce` (boost). Replies render as a sanitized thread under the Note; Likes and Announces render as counts.
_Avoid_: comment, reaction, engagement

**Delivery**:
Signing an outbound Activity and POSTing it to each Follower's (deduped shared) inbox via `ap-delivery-queue`, with retry/backoff. Deliveries only ever originate from live authoring — backfilled Notes are not delivered. Per-inbox delivery status (`pending`/`delivered`/`failed`) is tracked in `ap_note_deliveries` and aggregated into a Note's dashboard status.
_Avoid_: fan-out (that's the mechanism), push, broadcast

**Blocklist**:
The set of remote domains (`ap_blocklist`) whose inbound Activities the inbox drops before any store write. Managed from the dashboard; enforced by matching the actor URI's host.
_Avoid_: banlist, denylist, mute

### Access

**Protected route**:
A route requiring an authenticated user (via Cloudflare Access) — some additionally accept an API token carrying the route's required scope.

**API scope**:
A permission string granted to an API token (e.g. `api.dlsite.read`, or `api.*` for all).

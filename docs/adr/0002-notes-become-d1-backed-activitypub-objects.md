# 2. Notes become D1-backed ActivityPub objects (via Fedify)

Date: 2026-07-11 | Amended: 2026-07-11

## Status

Accepted (amended — protocol layer delegates to Fedify)

## Context

Notes were short-form markdown files under `src/content/note/`, loaded by the
`note` content collection, prerendered as static HTML, and read by three
surfaces: the detail page, the listing/pagination (`/notes/[...page]`), and
the notes RSS feed (`/notes/rss.xml`).

We want Notes to federate over ActivityPub as a single actor
(`@fdkevin@fdke.vin`), authored by posting to a Telegram channel. Two forces
make the file-based model untenable:

1. **Runtime authoring.** A Telegram-posted Note does not exist at build time,
   so it cannot be prerendered, and it has no hand-authored slug.
2. **Content negotiation.** The same Note URL must return HTML to browsers and
   ActivityStreams 2.0 JSON to Fediverse fetchers, which requires the request.

Federation also needs runtime state that has no place in git: followers,
inbound interactions, and delivery status.

Building a complete ActivityPub protocol stack from scratch (WebFinger, HTTP
Signatures, Actor JSON-LD, inbox/outbox, delivery fan-out) is ~3000–5000 lines
of security-sensitive code with high interop risk against Mastodon and other
fediverse software. [Fedify](https://fedify.dev) (MIT, v2.3.1, 1k★) is a
TypeScript ActivityPub framework with first-class Cloudflare Workers support
that covers the full protocol surface. Adopting it saves an estimated 60–75%
of protocol-layer development time and eliminates the highest-risk hand-rolled
code (HTTP Signatures verification, key management, delivery retry/fan-out).

## Decision

### Data model & identity (unchanged from original)

- Notes move from the `note` content collection into **D1 rows** keyed by an
  opaque, time-sortable **ULID** (the "Note id"), and render **SSR**
  (`prerender = false`). The content collection and its Zod schema are retired;
  listing, pagination, and RSS switch to D1 reads.
- The three existing markdown Notes are **migrated once** into D1 (preserving
  `publishDate`, assigning ULIDs). `src/content/note/` is removed.
- Note identity is the **ULID**, canonical for both the `/notes/{id}/` URL and
  the AS2 object id. There is no slug.
- Telegram **channel posts** author Notes (`channel_post` → `Create`,
  `edited_channel_post` → `Update`); **deletes happen out-of-band** via the
  Access-protected dashboard (Telegram does not deliver channel-delete events)
  and emit `Delete(Tombstone)`.

### Protocol layer (new — delegates to Fedify)

- The ActivityPub protocol layer uses **Fedify** (`@fedify/fedify` +
  `@fedify/cfworkers`) instead of hand-rolled WebFinger, HTTP Signatures,
  Actor JSON-LD, inbox/outbox, and delivery.
- **Actor & WebFinger**: Fedify's `setActorDispatcher` returns a `Person` for
  the single actor. WebFinger is auto-handled — no custom `.well-known` route.
- **Key management**: `setKeyPairsDispatcher` stores/generates RSA + Ed25519
  keypairs. Fedify auto-signs outgoing Activities and auto-verifies incoming
  signatures across draft-cavage, RFC 9421, Linked Data, and FEP-8b32.
- **Inbox**: `setInboxListeners` with chained `.on(Follow)` / `.on(Like)` /
  `.on(Announce)` / `.on(Create)` handlers. Signature verification, activity
  idempotency (24h dedup cache), and queue-backed non-blocking processing are
  all built in.
- **Outbox/Delivery**: `ctx.sendActivity()` signs and delivers to follower
  inboxes through a dedicated `ap-delivery-queue` (Cloudflare Queue). Built-in
  exponential backoff retry, shared inbox preference, and follower fan-out.
- **Content negotiation**: Fedify middleware inspects the `Accept` header —
  `application/activity+json` requests for `/notes/{id}` return the AS2 Note
  object; browser requests pass through to Astro for SSR HTML rendering.
- **Integration path**: `@fedify/astro` (Astro middleware) OR `@fedify/hono`
  (Hono adapter mounted in `src/worker.ts`) — final choice depends on
  compatibility testing with `@astrojs/cloudflare`. Both paths coexist with
  the existing Cloudflare Access + API token middleware.
- Business data stays in **existing D1 tables** (`ap_notes`) and additional
  `ap_followers` / `ap_interactions` tables. Fedify owns no data model — it
  reads through dispatcher callbacks. The existing `src/lib/ap/storage.ts`,
  `ulid.ts`, and migration scripts are fully retained.

## Consequences

- **Note pages lose static prerendering.** They are now SSR and depend on D1
  availability; the previous zero-runtime-cost static delivery for Notes is
  gone. Blog Posts are unaffected and stay file-based.
- **The `note` content collection is deleted**, so anything importing it breaks
  and must read D1 instead. This is the hard-to-reverse part: markdown Notes
  are no longer a supported authoring path (the hybrid model was rejected).
- **Note ids change shape** from slugs to ULIDs. The three migrated Notes get
  new URLs; if their old `/notes/{slug}/` URLs were shared, redirects are a
  follow-up concern.
- **New abuse surface**: an internet-facing inbox and remote HTML/media
  rendering. Mitigated by Fedify's built-in HTTP-Signature verification
  (rejects unverifiable Activities with 401), `rehype-sanitize` on remote
  content, R2-proxied avatars, and a D1 domain blocklist.
- **New infrastructure**: D1 `ap_*` tables, an `ap-delivery-queue` (Cloudflare
  Queue), an RSA keypair secret (Cloudflare secret), a KV namespace or D1 table
  for Fedify's `KvStore`, and a Telegram webhook — all consistent with existing
  Cloudflare-native patterns (see ADR-0001's feed aggregator).
- **New dependencies**: `@fedify/fedify`, `@fedify/cfworkers`, and either
  `@fedify/astro` or `@fedify/hono`. All MIT-licensed. Bundle size impact on
  the Workers 1MB free-tier limit must be verified during integration.
- **Lock-in risk is low**: Fedify speaks standard ActivityPub. If the project
  outgrows it, the data model (ULIDs, D1 tables) and the protocol surface
  (WebFinger paths, actor URI patterns) are all standard and portable.
- Rollout is **phased** (D1+SSR+ingest → Fedify actor+WebFinger (read-only
  identity) → Fedify outbox delivery → Fedify inbox+interactions → Telegram
  webhook → frontend switch), each phase independently shippable.

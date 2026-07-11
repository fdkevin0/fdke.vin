# 2. Notes become D1-backed ActivityPub objects

Date: 2026-07-11

## Status

Accepted

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

## Decision

- Notes move from the `note` content collection into **D1 rows** keyed by an
  opaque, time-sortable **ULID** (the "Note id"), and render **SSR**
  (`prerender = false`). The content collection and its Zod schema are retired;
  listing, pagination, and RSS switch to D1 reads.
- The three existing markdown Notes are **migrated once** into D1 (preserving
  `publishDate`, assigning ULIDs). `src/content/note/` is removed.
- Note identity is the **ULID**, canonical for both the `/notes/{id}/` URL and
  the AS2 object id. There is no slug.
- Federation is **two-way**: a single Actor with WebFinger, actor, outbox,
  followers, and a signature-verifying inbox. Outbound Activities
  (`Create`/`Update`/`Delete`) are signed and delivered via a dedicated
  `ap-delivery-queue`. The private key is a Cloudflare secret.
- Telegram **channel posts** author Notes (`channel_post` → `Create`,
  `edited_channel_post` → `Update`); **deletes happen out-of-band** via the
  Access-protected dashboard (Telegram does not deliver channel-delete events)
  and emit `Delete(Tombstone)`.

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
  rendering. Mitigated by mandatory HTTP-Signature verification, `rehype-sanitize`
  on remote content, R2-proxied avatars, and a D1 domain blocklist.
- **New infrastructure**: D1 `ap_*` tables, an `ap-delivery-queue`, an RSA
  keypair secret, and a Telegram webhook — all consistent with existing
  Cloudflare-native patterns (see ADR-0001's feed aggregator).
- Rollout is **phased** (D1+SSR+ingest → read-only identity → outbound delivery
  → inbox+interactions), each phase independently shippable.

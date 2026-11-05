# ActivityPub and Notes

The site federates short-form Notes as one actor, `@fdkevin@fdke.vin`. Implementation lives in [src/lib/ap](../src/lib/ap/); schema lives in [0001_activitypub.sql](../migrations/0001_activitypub.sql) and [0005_drop_activitypub_delivery_status.sql](../migrations/0005_drop_activitypub_delivery_status.sql).

## Note identity and lifecycle

A **Note** is a D1 row in `ap_notes` keyed by an opaque, time-sortable ULID (**Note id**), rendered at `/notes/{id}/`. Each row records its `source` (`'migration'` for backfilled notes, `'telegram'` for channel posts, or `'dashboard'`). Notes are not translated and have no hand-authored slug. The canonical Note URL is also its ActivityStreams 2.0 (AS2) object id.

**Note authoring** ingests Telegram channel updates (`channel_post` and `edited_channel_post` from `TELEGRAM_ALLOWED_CHAT_ID`). A new single-message post inserts a Note and originates `Create`; if a message matches an existing `(telegram_chat_id, telegram_message_id)` row (an edit, or a retried `channel_post` after the Note row landed), it updates the Note in place and originates `Update` (preserving `updated_at` at `publishDate` on a `channel_post` retry so stored fields remain idempotent).

The **Note lifecycle** includes authoring, album finalization, and dashboard deletion. Deletion emits `Delete(Tombstone)` using the Note id even after its row is removed. Telegram does not send channel-delete webhooks, so deletions are managed from the dashboard.

## Federation terms and behavior

- **Actor**: The single ActivityPub identity representing the site's author, addressed as `@fdkevin@fdke.vin`. Discovered via WebFinger on the apex domain; owns the inbox, outbox, and followers collections. Every Note is authored by this one Actor.
- **Note object**: A Note serialized as AS2 JSON. The same `/notes/{id}/` URL returns HTML to browsers and the Note object to requests sending `Accept: application/activity+json` (content negotiation). Its `id` is the Note id URL.
- **Album**: A multi-photo Telegram channel post, delivered to the webhook as one message per photo sharing a `media_group_id`. Buffers as a Pending album and finalizes into a single Note carrying every photo as an attachment, delivered as one `Create`/`Update`.
- **Pending album**: The buffered, not-yet-finalized state of an Album — one D1 row per arrived photo (`ap_pending_album_photos`), written durably before the webhook responds 200. Deleted once its Album finalizes.
- **Finalization**: The debounced step — a ~3s-quiet-period check re-enqueued on the delivery queue after every Album photo arrival — that assembles a Pending album's rows into one Note and delivers it. Before finalization, a redelivered photo or caption edit takes the same buffer-and-debounce flow, refreshing `arrived_at` to extend the quiet window. A message or photo edit arriving after finalization (a straggler) attaches to the existing Note in place with a follow-up `Update` instead of re-finalizing.
- **Activity**: A `Create`, `Update`, or `Delete` the Actor emits about a Note (post → `Create`, channel edit → `Update`, dashboard removal → `Delete(Tombstone)`). Inbound Activities the inbox accepts additionally include `Follow`/`Undo`, `Like`, and `Announce`.
- **Inbox / Outbox**: The Actor's two AS2 collections. The shared **inbox** (`/inbox`) receives Activities from remote servers — Fedify verifies every request before queued processing. The **outbox** (`/users/fdkevin/outbox`) lists `Create` activities reconstructed from current Notes, including backfilled Notes (`source = 'migration'`, which appear in the outbox but are never delivered).
- **Follower**: A remote Actor that has sent an accepted `Follow`. Stored in D1 (`ap_followers`) with its personal and optional shared inbox URL; the delivery fan-out targets Followers.
- **Interaction**: A remote reaction to a Note ingested via the inbox — a reply (`Create(Note)` in-reply-to), a `Like`, or an `Announce` (boost). Replies render as a sanitized thread under the Note; Likes and Announces render as counts.
- **Delivery**: Fedify signs an outbound Activity and fans it out to Followers present when the Activity originates through `ap-delivery-queue`, preferring shared inboxes and relying on Cloudflare Queue retries. Delivery originates from live Note lifecycle changes — backfilled Notes are not delivered, and a Follower added later does not receive earlier Activities. Fedify keeps its cache and inbox idempotency state in `AP_FEDIFY_KV`; business records remain in D1.
- **Blocklist**: The set of remote domains (`ap_blocklist`) whose inbound Activities the inbox drops before any store write. Managed from the dashboard; enforced by matching the actor URI's host.

## Design and storage

Runtime authoring and content negotiation require D1-backed SSR Notes instead of Markdown content collections. Fedify owns protocol verification, signing, discovery, and queued delivery, with media stored in `AP_BUCKET`. The custom Worker entry runs federation before falling through to Astro.

Activity ids distinguish retries from edits: `Create` uses `{noteUrl}#create`, `Update` includes the updated timestamp, and `Delete` uses `{noteUrl}#delete`. The outbox reconstructs `Create` activities from current Notes; it is not an audit log of edits and deletions.

## Setup and operations

Provision the resources and Telegram webhook below for a new deployment. These steps modify the selected Cloudflare account and Telegram bot; they are not prerequisites for a documentation edit or a Node unit-test run.

- [1. Cloudflare resources (one-time)](#1-cloudflare-resources-one-time)
- [2. Secrets & vars](#2-secrets--vars)
- [3. Create the Telegram bot & channel](#3-create-the-telegram-bot--channel)
- [4. Find the channel's chat id](#4-find-the-channels-chat-id)
- [5. Register the webhook](#5-register-the-webhook)
- [6. End-to-end verification](#6-end-to-end-verification)
- [7. Inbound interactions & moderation](#7-inbound-interactions--moderation)
- [Troubleshooting](#troubleshooting)

### 1. Cloudflare resources (one-time)

These must exist in the account before `wrangler deploy`, and are referenced by `wrangler.jsonc`.

```sh
# Delivery queue for outbound activities and album finalization.
npx wrangler queues create ap-delivery-queue

# R2 bucket for channel-post photos and remote avatars, if not already created.
npx wrangler r2 bucket create ap-storage

# KV namespace for Fedify caches and inbox idempotency.
npx wrangler kv namespace create AP_FEDIFY_KV

# Apply every pending versioned D1 migration.
pnpm wrangler d1 migrations apply DATABASE --remote
```

The ActivityPub business tables (`ap_notes`, `ap_pending_album_photos`, `ap_note_attachments`, `ap_followers`, `ap_interactions`, and `ap_blocklist`; `ap_note_deliveries` from `0001` is dropped by `0005`) live in the `DATABASE` D1 binding. Fedify's protocol state lives in `AP_FEDIFY_KV`. Wrangler records applied D1 files in `d1_migrations`; application requests never run schema DDL.

### 2. Secrets & vars

| Name                       | Kind   | Purpose                                                     |
| -------------------------- | ------ | ----------------------------------------------------------- |
| `AP_RSA_PRIVATE_KEY`       | secret | Actor signing key (JWK). Public key is derived + published. |
| `TELEGRAM_BOT_TOKEN`       | secret | Bot API token from @BotFather.                              |
| `TELEGRAM_WEBHOOK_SECRET`  | secret | Shared token proving a webhook call came from Telegram.     |
| `TELEGRAM_ALLOWED_CHAT_ID` | var    | The one channel/chat id allowed to author Notes.            |

#### Signing key

```sh
node scripts/ap/generate-keypair.mjs | npx wrangler secret put AP_RSA_PRIVATE_KEY
```

Generates a 2048-bit RSASSA-PKCS1-v1_5 key as a JWK and stores it. `keys.ts` imports the private key and derives the public key from it, so only this one secret is managed. **Rotating it invalidates every follower's cached key** — remote verification depends on refreshing that cached public key.

#### Telegram secrets

```sh
# From @BotFather when you create the bot (step 3).
npx wrangler secret put TELEGRAM_BOT_TOKEN

# Any high-entropy string you choose; you pass the same value to setWebhook.
openssl rand -hex 32 | npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

#### Allowed chat id

`TELEGRAM_ALLOWED_CHAT_ID` is a plain var in `wrangler.jsonc` (`vars` block), set to the author's channel. For another deployment, set it to your channel's id (a negative number like `-1001234567890`, see step 4) and redeploy. Every update from any other chat is ignored by `parseChannelUpdate`.

For local dev, the secrets live in `.dev.vars` (gitignored); `wrangler types` reads them to type the `Env` bindings.

### 3. Create the Telegram bot & channel

1. In Telegram, message **@BotFather** → `/newbot` → follow prompts → copy the **bot token** (→ `TELEGRAM_BOT_TOKEN`).
2. Create (or pick) the **channel** you'll author Notes in.
3. Add the bot to the channel as an **administrator**. A bot only receives `channel_post` updates for channels it administers — this step is required, not optional.

### 4. Find the channel's chat id

The webhook isn't set yet, so `getUpdates` works (it and `setWebhook` are mutually exclusive):

```sh
# Post any message in the channel first, then:
curl -s "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates" \
  | jq '.result[].channel_post.chat | {id, title}'
```

Channel ids are negative and typically prefixed `-100`. Put that value in `TELEGRAM_ALLOWED_CHAT_ID` and redeploy so the change ships.

### 5. Register the webhook

Point Telegram at the ingestion route and hand it the shared secret. Restrict `allowed_updates` so the bot only sends the two update types we handle:

```sh
curl -sX POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://fdke.vin/api/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
  --data-urlencode 'allowed_updates=["channel_post","edited_channel_post"]'
```

Telegram sends the token back in the `x-telegram-bot-api-secret-token` header on every call; the route rejects anything whose header doesn't match `TELEGRAM_WEBHOOK_SECRET` (401). Confirm registration:

```sh
curl -s "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo" | jq
# pending_update_count should drain to 0; last_error_message should be empty.
```

### 6. End-to-end verification

Once steps 1–5 are done and the worker is deployed:

1. **Discovery** — search `@fdkevin@fdke.vin` from a Mastodon account (or `npx @fedify/cli lookup @fdkevin@fdke.vin`). The actor resolves; Mastodon labels it a bot because the actor `type` is `Application`.
2. **Follow** — click Follow. The button flips to "Following" only if the signed `Accept` verified against the published key. Check persistence:
   ```sh
   npx wrangler d1 execute DATABASE --remote \
     --command "SELECT actor_id, shared_inbox_url FROM ap_followers"
   ```
   Unfollow → the row disappears (`Undo(Follow)`).
3. **Post a Note** — while followed, post a message in the channel. Within a few seconds it appears in the follower's Home timeline. Editing the Telegram message federates an `Update` (Mastodon shows it as edited).

Watch it happen live with `npx wrangler tail`:

- `[api:telegram.webhook]` — ingestion; a 401 means the secret header mismatched, a 500 forces Telegram to retry.
- `[queue:ap-delivery-queue]` — one delivery per deduped follower inbox; failures retry with backoff.
- inbox — HTTP-Signature verification result (forged/unsigned → 401).

### 7. Inbound interactions & moderation

Once followed, replies, likes, and boosts flow back to the site:

- The inbox accepts signature-verified reply `Create(Note)` (in-reply-to one of our Notes), `Like`, `Announce`, and their `Undo`/`Delete`; anything else is acknowledged and dropped. Activities from a blocklisted domain are dropped before any store write.
- Replies render as a sanitized thread (`rehype-sanitize`) under the Note; likes and boosts render as counts. Remote avatars are proxied through R2 (`avatars/{sha256}.{ext}`) and served from `/api/ap/media/…` — never hotlinked.
- The author moderates from **`/dashboard/notes`** (Access-protected):
  - **Notes** list shows Notes and their interactions.
  - **Delete & tombstone** removes a Note from the site and enqueues a signed `Delete(Tombstone)` to followers via `ap-delivery-queue` — closing the loop Telegram channel deletes can't (they aren't delivered as webhooks).
  - **Domain blocklist** add/remove is enforced live at the inbox.
  - **Replies** can be hidden (stop rendering) or removed per Note.

Verify: reply to / like / boost a Note from Mastodon → it surfaces under the Note within seconds. Delete the Note from the dashboard → a following Mastodon account shows it tombstoned.

### Troubleshooting

- **Nothing reaches followers** — the delivery only fires on live Telegram authoring, and only to stored followers. Confirm there's at least one row in `ap_followers` and that the Telegram post actually created a Note (`SELECT id, source FROM ap_notes ORDER BY published_at DESC LIMIT 5`).
- **Follow won't complete** — Mastodon couldn't verify the `Accept`. Re-check that `/actor` serves a `publicKey.publicKeyPem` and that `AP_RSA_PRIVATE_KEY` is the matching key.
- **Webhook 401s** — `TELEGRAM_WEBHOOK_SECRET` and the `secret_token` passed to `setWebhook` differ; re-run step 5.
- **No `channel_post` updates** — the bot isn't a channel admin (step 3), or `allowed_updates` excluded them (step 5).
- **Outbound fetch blocked** — the worker uses `global_fetch_strictly_public`; delivery POSTs and remote key fetches must target public hosts (they do in prod).

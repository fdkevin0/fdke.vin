# ActivityPub setup & operations

How to bring the site's ActivityPub actor (`@fdkevin@fdke.vin`) fully online and
author Notes from Telegram. Covers the one-time provisioning the code assumes but
can't do itself: the RSA key secret, the Cloudflare resources, and the Telegram
bot + webhook. See `CONTEXT.md` "Federation" for the domain model and
`docs/adr/0002-notes-become-d1-backed-activitypub-objects.md` for the design.

Current state after PR #70: discovery (WebFinger + actor doc) and Follow/Undo
work in prod. Delivery of Notes to followers only starts once the Telegram bot
below is wired up — **backfilled Notes are never delivered by design**, so an
empty timeline before Telegram is set up is expected, not a bug.

---

## 1. Cloudflare resources (one-time)

These must exist in the account before `wrangler deploy`, and are referenced by
`wrangler.jsonc`.

```sh
# Delivery queue (new in AP-6). rss-* queues already exist.
npx wrangler queues create ap-delivery-queue

# R2 bucket for channel-post photos (AP-3), if not already created.
npx wrangler r2 bucket create ap-storage

# Apply the AP D1 schema. The app also creates these tables lazily on first
# use, but applying explicitly avoids a cold-start race and documents intent.
npx wrangler d1 execute DATABASE --remote --file scripts/d1/activitypub.sql
```

`ap_notes`, `ap_note_attachments`, and `ap_followers` all live in the `DATABASE`
D1 binding. Note migration (AP-1) is separate — see `scripts/d1/migrate-notes.mjs`.

---

## 2. Secrets & vars

| Name                       | Kind   | Purpose                                                     |
| -------------------------- | ------ | ----------------------------------------------------------- |
| `AP_RSA_PRIVATE_KEY`       | secret | Actor signing key (JWK). Public key is derived + published. |
| `TELEGRAM_BOT_TOKEN`       | secret | Bot API token from @BotFather.                              |
| `TELEGRAM_WEBHOOK_SECRET`  | secret | Shared token proving a webhook call came from Telegram.     |
| `TELEGRAM_ALLOWED_CHAT_ID` | var    | The one channel/chat id allowed to author Notes.            |

### Signing key

```sh
node scripts/ap/generate-keypair.mjs | npx wrangler secret put AP_RSA_PRIVATE_KEY
```

Generates a 2048-bit RSASSA-PKCS1-v1_5 key as a JWK and stores it. `keys.ts`
imports the private key and derives the public key from it, so only this one
secret is managed. **Rotating it invalidates every follower's cached key** —
remote servers will re-fetch `/actor#main-key` on the next signed request.

### Telegram secrets

```sh
# From @BotFather when you create the bot (step 3).
npx wrangler secret put TELEGRAM_BOT_TOKEN

# Any high-entropy string you choose; you pass the same value to setWebhook.
openssl rand -hex 32 | npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

### Allowed chat id

`TELEGRAM_ALLOWED_CHAT_ID` is a plain var in `wrangler.jsonc` (`vars` block),
currently `""`. Set it to your channel's id (a negative number like
`-1001234567890`, see step 4) and redeploy. Every update from any other chat is
ignored by `parseChannelUpdate`.

For local dev, the secrets live in `.dev.vars` (gitignored); `wrangler types`
reads them to type the `Env` bindings.

---

## 3. Create the Telegram bot & channel

1. In Telegram, message **@BotFather** → `/newbot` → follow prompts → copy the
   **bot token** (→ `TELEGRAM_BOT_TOKEN`).
2. Create (or pick) the **channel** you'll author Notes in.
3. Add the bot to the channel as an **administrator**. A bot only receives
   `channel_post` updates for channels it administers — this step is required,
   not optional.

---

## 4. Find the channel's chat id

The webhook isn't set yet, so `getUpdates` works (it and `setWebhook` are
mutually exclusive):

```sh
# Post any message in the channel first, then:
curl -s "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates" \
  | jq '.result[].channel_post.chat | {id, title}'
```

Channel ids are negative and typically prefixed `-100`. Put that value in
`TELEGRAM_ALLOWED_CHAT_ID` and redeploy so the change ships.

---

## 5. Register the webhook

Point Telegram at the ingestion route and hand it the shared secret. Restrict
`allowed_updates` so the bot only sends the two update types we handle:

```sh
curl -sX POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://fdke.vin/api/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
  --data-urlencode 'allowed_updates=["channel_post","edited_channel_post"]'
```

Telegram sends the token back in the `x-telegram-bot-api-secret-token` header on
every call; the route rejects anything whose header doesn't match
`TELEGRAM_WEBHOOK_SECRET` (401). Confirm registration:

```sh
curl -s "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo" | jq
# pending_update_count should drain to 0; last_error_message should be empty.
```

---

## 6. End-to-end verification

Once steps 1–5 are done and the worker is deployed:

1. **Discovery** — search `@fdkevin@fdke.vin` from a Mastodon account (or
   `npx @fedify/cli lookup @fdkevin@fdke.vin`). The actor resolves; Mastodon
   labels it a bot because the actor `type` is `Application`.
2. **Follow** — click Follow. The button flips to "Following" only if the signed
   `Accept` verified against the published key. Check persistence:
   ```sh
   npx wrangler d1 execute DATABASE --remote \
     --command "SELECT actor_id, shared_inbox_url FROM ap_followers"
   ```
   Unfollow → the row disappears (`Undo(Follow)`).
3. **Post a Note** — while followed, post a message in the channel. Within a few
   seconds it appears in the follower's Home timeline. Editing the Telegram
   message federates an `Update` (Mastodon shows it as edited).

Watch it happen live with `npx wrangler tail`:

- `[api:telegram.webhook]` — ingestion; a 401 means the secret header mismatched,
  a 500 forces Telegram to retry.
- `[queue:ap-delivery-queue]` — one delivery per deduped follower inbox; failures
  retry with backoff.
- inbox — HTTP-Signature verification result (forged/unsigned → 401).

---

## Troubleshooting

- **Nothing reaches followers** — the delivery only fires on live Telegram
  authoring, and only to stored followers. Confirm there's at least one row in
  `ap_followers` and that the Telegram post actually created a Note
  (`SELECT id, source FROM ap_notes ORDER BY published_at DESC LIMIT 5`).
- **Follow won't complete** — Mastodon couldn't verify the `Accept`. Re-check
  that `/actor` serves a `publicKey.publicKeyPem` and that `AP_RSA_PRIVATE_KEY`
  is the matching key.
- **Webhook 401s** — `TELEGRAM_WEBHOOK_SECRET` and the `secret_token` passed to
  `setWebhook` differ; re-run step 5.
- **No `channel_post` updates** — the bot isn't a channel admin (step 3), or
  `allowed_updates` excluded them (step 5).
- **Outbound fetch blocked** — the worker uses `global_fetch_strictly_public`;
  delivery POSTs and remote key fetches must target public hosts (they do in
  prod).

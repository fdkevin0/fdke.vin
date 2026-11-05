# Cloudflare integration

Use this guide for Workers runtime code, bindings, authentication, utility tools, deployment, and platform errors. Retrieve current official documentation for the APIs involved before making implementation decisions; obtain quotas from the relevant product's `/platform/limits/` page.

## Repository integration

- The site uses the `@astrojs/cloudflare` adapter; bindings (`DATABASE`, `AP_BUCKET`, `EMAIL_BUCKET`, `AP_FEDIFY_KV`, `FEED_COORDINATOR`, queues, and `AI`) are configured in [wrangler.jsonc](../wrangler.jsonc).
- Server-side bindings use `import { env } from "cloudflare:workers"` or the dynamic helpers in [cloudflare-runtime.ts](../src/lib/cloudflare-runtime.ts) (`getCloudflareEnv`, `requireCloudflareEnv`, `runInBackground`, `getEdgeCache`). Build/server schema variables (`CLOUDFLARE_TEAM_DOMAIN`, `CLOUDFLARE_POLICY_AUD`, and optional Webmention variables) are declared in [astro.config.ts](../astro.config.ts) and accessed via `astro:env/server`. `Astro.locals.runtime.env` is not supported.
- `worker-configuration.d.ts` is generated. Run `pnpm run types` after changing `wrangler.jsonc` or `.dev.vars`.
- See [Contributing](../CONTRIBUTING.md#development) for local commands. Deployment uses `pnpm exec wrangler deploy` when deployment is authorized.

## Access control and API tokens

[protected-routes.ts](../src/lib/protected-routes.ts) defines every route requiring authentication, enforced by [middleware.ts](../src/middleware.ts):

- **Access-only routes** (`/auth`, `/dashboard/*`, `/api/tokens/*`, `/api/feed/*`, `/tools/access`, `/tools/mail/*`) require a verified Cloudflare Access JWT (`cf-access-jwt-assertion` header or `CF_Authorization` cookie) carrying an `email` claim (`type` must be `"app"` when present). Unauthenticated browser requests to non-`/api/` routes redirect (`302`) to `/auth?redirect=<path>` (validated as a same-origin path by [auth-redirect.ts](../src/lib/auth-redirect.ts), defaulting to `/dashboard/`).
- **Scoped token routes** additionally accept `Authorization: Bearer fdv_<base64url>` tokens bearing the route's required **API scope** ([scopes.ts](../src/lib/api/tokens/scopes.ts), or `api.*` for all):
  - `/api/ping` (`api.ping`): health and token verification endpoint.
  - `/api/dlsite/*` (`api.dlsite.read`): DLsite product metadata scraper ([dlsite.ts](../src/lib/api/dlsite.ts)).
  - `/api/exhentai/*` (`api.exhentai.read`): ExHentai gallery and torrent scraper ([exhentai.ts](../src/lib/api/exhentai.ts), [torrent.ts](../src/pages/api/exhentai/torrent.ts)); requires runtime secret `EXHENTAI_COOKIE`.
- **Token storage**: Tokens are hashed with SHA-256 ([crypto.ts](../src/lib/api/tokens/crypto.ts)) and stored in `api_tokens` ([0002_api_tokens.sql](../migrations/0002_api_tokens.sql); `api_token_audit_events` is dropped in [0006_drop_unused_tables.sql](../migrations/0006_drop_unused_tables.sql)). Tokens are managed from `/dashboard/api-management` (`GET/POST /api/tokens`, `PATCH/DELETE /api/tokens/[id]`, `POST /api/tokens/[id]/rotate`), and `last_used_at` is updated asynchronously via `runInBackground`.
- **Local development**: In `import.meta.env.DEV`, middleware supplies a mock Access user (`dev@fdke.vin`) unless the route has a required API scope and the request sends an `Authorization: Bearer` header.
- The lookup host (`ip.fdke.vin`) runs ahead of Astro and has its own public handler; see [Network](network.md).

## Utility tools

- **Mail viewer** (`/tools/mail`, `/tools/mail/email/[key]`): Access-protected R2 email reader ([email.ts](../src/lib/api/email.ts)) that lists and parses raw `.eml` objects stored under `emails/` in `EMAIL_BUCKET` (`email-storage`).
- **Access diagnostics** (`/tools/access`): Access-protected inspector ([tools/access/index.astro](../src/pages/tools/access/index.astro)) showing verified Access JWT claims and querying `${CLOUDFLARE_TEAM_DOMAIN}/cdn-cgi/access/get-identity` for WARP/Gateway posture and device sessions.
- **Photography calculators** (`/tools/camera`, `/tools/lut-to-np3`, `POST /api/tools/lut-to-np3`): Public tools for hyperfocal distance and sensor format equivalence ([optics.ts](../src/lib/tools/optics.ts)) and converting display-referred 3D `.cube` LUTs (up to 2 MB, domain `0..1`) into Nikon Flexible Color `.NP3` binary files ([lut-to-np3.ts](../src/lib/tools/lut-to-np3.ts)).

## Database changes

Versioned SQL lives in `migrations/`. Apply migrations to the intended environment before relying on new schema; request handlers do not run schema DDL. Resource provisioning and remote migration commands in feature guides are operational steps, not part of a normal local build.

## Official references

Read the reference relevant to the task:

- [Astro on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/): framework integration and deployment.
- [Workers documentation](https://developers.cloudflare.com/workers/): runtime APIs; the documentation MCP is `https://docs.mcp.cloudflare.com/mcp`.
- [Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/): Node APIs in Workers.
- [Runtime errors](https://developers.cloudflare.com/workers/observability/errors/) and [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): failures, including error 1102.
- Product references: [KV](https://developers.cloudflare.com/kv/), [R2](https://developers.cloudflare.com/r2/), [D1](https://developers.cloudflare.com/d1/), [Durable Objects](https://developers.cloudflare.com/durable-objects/), [Queues](https://developers.cloudflare.com/queues/), [Vectorize](https://developers.cloudflare.com/vectorize/), [Workers AI](https://developers.cloudflare.com/workers-ai/), and [Agents](https://developers.cloudflare.com/agents/).

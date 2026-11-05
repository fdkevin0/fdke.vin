# Cloudflare integration

Use this guide for Workers runtime code, bindings, deployment, and platform errors. Retrieve current official documentation for the APIs involved before making implementation decisions; obtain quotas from the relevant product's `/platform/limits/` page.

## Repository integration

- The site uses the `@astrojs/cloudflare` adapter; bindings are configured in `wrangler.jsonc`.
- Server-side bindings use `import { env } from "cloudflare:workers"`. Existing helpers in `src/lib/cloudflare-runtime.ts` cover dynamic access. `Astro.locals.runtime.env` is no longer supported.
- `worker-configuration.d.ts` is generated. Run `pnpm run types` after changing `wrangler.jsonc` or `.dev.vars`.
- See [Contributing](../CONTRIBUTING.md#development) for local commands. Deployment uses `pnpm exec wrangler deploy` when deployment is authorized.

## Access control

A **Protected route** requires an authenticated Cloudflare Access user; selected APIs also accept an API token with the route's required **API scope** (for example `api.dlsite.read`, or `api.*`). In local development (`import.meta.env.DEV`), middleware supplies a mock Access user when no Bearer token is sent. See [middleware](../src/middleware.ts), [token scopes](../src/lib/api/tokens/scopes.ts), and [0002_api_tokens.sql](../migrations/0002_api_tokens.sql) when changing these boundaries. The lookup host has its own public handler; see [Network](network.md).

## Database changes

Versioned SQL lives in `migrations/`. Apply migrations to the intended environment before relying on new schema; request handlers do not run schema DDL. Resource provisioning and remote migration commands in feature guides are operational steps, not part of a normal local build.

## Official references

Read the reference relevant to the task:

- [Astro on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/): framework integration and deployment.
- [Workers documentation](https://developers.cloudflare.com/workers/): runtime APIs; the documentation MCP is `https://docs.mcp.cloudflare.com/mcp`.
- [Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/): Node APIs in Workers.
- [Runtime errors](https://developers.cloudflare.com/workers/observability/errors/) and [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): failures, including error 1102.
- Product references: [KV](https://developers.cloudflare.com/kv/), [R2](https://developers.cloudflare.com/r2/), [D1](https://developers.cloudflare.com/d1/), [Durable Objects](https://developers.cloudflare.com/durable-objects/), [Queues](https://developers.cloudflare.com/queues/), [Vectorize](https://developers.cloudflare.com/vectorize/), [Workers AI](https://developers.cloudflare.com/workers-ai/), and [Agents](https://developers.cloudflare.com/agents/).

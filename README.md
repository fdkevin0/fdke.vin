# fdke.vin

Personal multilingual website built with Astro and deployed to Cloudflare Workers.

The site includes blog posts, ActivityPub notes, RSS feeds and a public `/reading` feed view, search, public tools for exchange rates (`/tools/exchange`), photography (`/tools/camera`, `/tools/lut-to-np3`), and network lookups (`ip.fdke.vin`, `/tools/network`), plus Cloudflare Access-protected dashboard and utility routes (`/dashboard/*`, `/tools/mail`, `/tools/access`).

## Quick start

Use Node.js 24 (matching CI) and pnpm:

```sh
pnpm install
pnpm run dev
```

For development commands, validation, and contribution conventions, see [CONTRIBUTING.md](CONTRIBUTING.md). Runtime features need the bindings and secrets described in [Cloudflare integration](docs/cloudflare.md) and the relevant feature guide.

## Documentation

| Guide                                    | Read for                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| [Content](docs/content.md)               | Posts, translations, tags, and content identity                            |
| [ActivityPub](docs/activitypub.md)       | Notes, federation, Telegram authoring, setup, and moderation               |
| [Feeds](docs/feeds.md)                   | Site RSS feeds, the external feed aggregator, and `/reading`               |
| [Exchange rates](docs/exchange-rates.md) | BOC polling, watermark recovery, and latest-rate queries                   |
| [Network](docs/network.md)               | IP lookups, Internet snapshots, Radar, and response contracts              |
| [Cloudflare](docs/cloudflare.md)         | Runtime bindings, Access/token auth, mail/camera/LUT tools, and proxy APIs |
| [Contributing](CONTRIBUTING.md)          | Local development, testing, issues, and documentation upkeep               |
| [Agent instructions](AGENTS.md)          | Agent working scope and permission boundaries                              |

## Project layout

Routes live in `src/pages`, shared UI in `src/components`, shells in `src/layouts`, and styles in `src/styles`. Site metadata lives in `src/site.config.ts`; shared static assets belong in `public/`.
